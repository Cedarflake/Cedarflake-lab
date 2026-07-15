import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  maintenancePublicSnapshotSchema,
  type MaintenancePublicSnapshot,
} from "@/lib/public/maintenance-snapshots"
import { componentPublicSnapshotSchema } from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"
import {
  createRedactedTimelineSnapshot,
  createWithdrawnTimelineSnapshot,
  redactedTimelineSnapshotSchema,
  withdrawnTimelineSnapshotSchema,
} from "@/lib/public/timeline-snapshots"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import type { PublicationEventAllocationSlice } from "./publication-event-allocation"
import {
  withWriteTransaction,
  type StatementExecutor,
} from "./write-transaction"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

const closureInputFields = {
  idempotencyKey: z.string().uuid(),
  maintenanceWindowId: z.string().uuid(),
  expectedMaintenanceVersion: z.number().int().positive().safe(),
  expectedMaintenancePublicationVersion: z
    .number()
    .int()
    .positive()
    .safe(),
}

const maintenanceDependencyGuardSchema = z
  .object({
    componentId: z.string().uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

const withdrawMaintenancePublicationSchema = z
  .object({
    ...closureInputFields,
    action: z.literal("withdraw"),
  })
  .strict()

const privacyCloseMaintenancePublicationSchema = z
  .object({
    ...closureInputFields,
    action: z.enum(["redact", "suppress"]),
    affectedComponents: z
      .array(maintenanceDependencyGuardSchema)
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const componentIds = new Set<string>()

    input.affectedComponents.forEach((component, index) => {
      if (componentIds.has(component.componentId)) {
        context.addIssue({
          code: "custom",
          path: ["affectedComponents", index, "componentId"],
          message: "Affected components must be unique",
        })
      }

      componentIds.add(component.componentId)
    })
  })

export const closeMaintenancePublicationInputSchema = z.discriminatedUnion(
  "action",
  [
    withdrawMaintenancePublicationSchema,
    privacyCloseMaintenancePublicationSchema,
  ],
)

export type CloseMaintenancePublicationInput = z.infer<
  typeof closeMaintenancePublicationInputSchema
>

export interface CloseMaintenancePublicationResult {
  maintenanceWindowId: string
  maintenanceVersion: number
  maintenancePublicationVersion: number
  publicPrivacyEpoch: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
}

export type MaintenancePublicationClosureAction =
  CloseMaintenancePublicationInput["action"]

export interface MaintenancePublicationClosureGuard {
  maintenanceWindowId: string
  expectedMaintenanceVersion: number
  expectedMaintenancePublicationVersion: number
}

interface MaintenanceRoot {
  publicId: string
  version: number
}

export interface PublishedMaintenanceSource {
  eventId: string
  sourceRevision: number
  publicEntryId: string
  effectiveAt: number
  recordedAt: number
  action: z.infer<typeof publicationActionSchema>
  snapshot: MaintenancePublicSnapshot
}

export interface MaintenancePublicDependency {
  componentId: string
  componentPublicId: string
}

export interface PreparedMaintenancePublicationClosure {
  maintenanceWindowId: string
  maintenanceVersion: number
  maintenancePublicationVersion: number
  targets: readonly PublishedMaintenanceSource[]
  dependencies: readonly MaintenancePublicDependency[]
}

const rootRowSchema = z
  .object({
    public_id: z.string().uuid(),
    version: z.number().int().positive().safe(),
  })
  .strict()

const publicationSourceRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: publicationActionSchema,
    target_source_id: z.string().uuid(),
    target_source_revision: z.number().int().positive().safe(),
    target_snapshot_json: z.string().nullable(),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_type: z.literal("maintenance_event").nullable(),
    resulting_source_id: z.string().uuid().nullable(),
    resulting_source_revision: z.number().int().positive().safe().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
    timeline_entry_id: z.string().uuid().nullable(),
    timeline_effective_at: z.number().int().nonnegative().safe().nullable(),
    timeline_recorded_at: z.number().int().nonnegative().safe().nullable(),
    timeline_snapshot_json: z.string().nullable(),
    source_window_id: z.string().uuid(),
    source_revision: z.number().int().positive().safe(),
    source_public_entry_id: z.string().uuid(),
    source_effective_at: z.number().int().nonnegative().safe(),
    source_recorded_at: z.number().int().nonnegative().safe(),
  })
  .strict()

type PublicationSourceRow = z.infer<typeof publicationSourceRowSchema>

function invalidPublicationState() {
  return new CommandValidationError(
    "INVALID_PUBLICATION_STATE",
    "Stored maintenance publication state is invalid",
  )
}

function invalidSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public maintenance snapshot is invalid",
  )
}

function parseResult(resultRef: string): CloseMaintenancePublicationResult {
  return z
    .object({
      maintenanceWindowId: z.string().uuid(),
      maintenanceVersion: z.number().int().positive().safe(),
      maintenancePublicationVersion: z.number().int().positive().safe(),
      publicPrivacyEpoch: z.number().int().nonnegative().safe(),
      componentVersions: z.array(
        z
          .object({
            componentId: z.string().uuid(),
            componentVersion: z.number().int().positive().safe(),
          })
          .strict(),
      ),
    })
    .strict()
    .parse(JSON.parse(resultRef) as unknown)
}

function parseRoot(row: unknown): MaintenanceRoot {
  const result = rootRowSchema.safeParse(row)
  if (!result.success) throw invalidPublicationState()

  return {
    publicId: result.data.public_id,
    version: result.data.version,
  }
}

function parseSourceRow(row: unknown) {
  const result = publicationSourceRowSchema.safeParse(row)
  if (!result.success) throw invalidPublicationState()
  return result.data
}

function snapshotsMatch(
  left: MaintenancePublicSnapshot,
  right: MaintenancePublicSnapshot,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertSourceIdentity(
  row: PublicationSourceRow,
  maintenanceWindowId: string,
  maintenancePublicId: string,
  snapshot: MaintenancePublicSnapshot,
) {
  if (
    row.source_window_id !== maintenanceWindowId ||
    row.source_revision !== row.target_source_revision ||
    row.source_public_entry_id !== snapshot.publicEntryId ||
    row.source_effective_at !== snapshot.effectiveAt ||
    snapshot.maintenancePublicId !== maintenancePublicId
  ) {
    throw invalidPublicationState()
  }
}

function assertClosedResult(row: PublicationSourceRow) {
  if (
    row.resulting_disposition !== "closed" ||
    row.resulting_source_type !== null ||
    row.resulting_source_id !== null ||
    row.resulting_source_revision !== null ||
    row.resulting_current_snapshot_json !== null
  ) {
    throw invalidPublicationState()
  }
}

function createPublishedSource(
  row: PublicationSourceRow,
  maintenanceWindowId: string,
  maintenancePublicId: string,
): PublishedMaintenanceSource {
  if (row.action === "suppress" || row.target_snapshot_json === null) {
    throw invalidPublicationState()
  }

  const snapshot = parseStoredJson(
    maintenancePublicSnapshotSchema,
    row.target_snapshot_json,
    invalidSnapshot,
  )
  assertSourceIdentity(
    row,
    maintenanceWindowId,
    maintenancePublicId,
    snapshot,
  )

  return {
    eventId: row.target_source_id,
    sourceRevision: row.target_source_revision,
    publicEntryId: snapshot.publicEntryId,
    effectiveAt: snapshot.effectiveAt,
    recordedAt: row.source_recorded_at,
    action: row.action,
    snapshot,
  }
}

function assertHeadState(
  row: PublicationSourceRow,
  source: PublishedMaintenanceSource,
) {
  if (
    row.timeline_entry_id === null ||
    row.timeline_effective_at === null ||
    row.timeline_recorded_at === null
  ) {
    throw invalidPublicationState()
  }

  if (row.action === "publish") {
    if (
      row.resulting_disposition !== "published" ||
      row.resulting_source_type !== "maintenance_event" ||
      row.resulting_source_id !== row.target_source_id ||
      row.resulting_source_revision !== row.target_source_revision ||
      row.resulting_current_snapshot_json === null ||
      row.timeline_entry_id !== source.publicEntryId ||
      row.timeline_effective_at !== source.effectiveAt ||
      row.timeline_snapshot_json === null
    ) {
      throw invalidPublicationState()
    }

    const currentSnapshot = parseStoredJson(
      maintenancePublicSnapshotSchema,
      row.resulting_current_snapshot_json,
      invalidSnapshot,
    )
    const timelineSnapshot = parseStoredJson(
      maintenancePublicSnapshotSchema,
      row.timeline_snapshot_json,
      invalidSnapshot,
    )

    if (
      !snapshotsMatch(source.snapshot, currentSnapshot) ||
      !snapshotsMatch(source.snapshot, timelineSnapshot)
    ) {
      throw invalidSnapshot()
    }

    return
  }

  assertClosedResult(row)

  if (row.action === "withdraw") {
    const timelineSnapshot = parseStoredJson(
      withdrawnTimelineSnapshotSchema,
      row.timeline_snapshot_json,
      invalidSnapshot,
    )

    if (
      timelineSnapshot.publicEntryId !== row.timeline_entry_id ||
      row.timeline_entry_id === source.publicEntryId
    ) {
      throw invalidPublicationState()
    }

    return
  }

  if (row.action === "redact") {
    const timelineSnapshot = parseStoredJson(
      redactedTimelineSnapshotSchema,
      row.timeline_snapshot_json,
      invalidSnapshot,
    )

    if (
      timelineSnapshot.publicEntryId !== source.publicEntryId ||
      row.timeline_entry_id !== source.publicEntryId ||
      row.timeline_effective_at !== source.effectiveAt
    ) {
      throw invalidPublicationState()
    }

    return
  }

  throw invalidPublicationState()
}

function assertClosureAllowed(
  currentAction: z.infer<typeof publicationActionSchema>,
  requestedAction: CloseMaintenancePublicationInput["action"],
) {
  if (currentAction === "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A suppressed maintenance window cannot change publication state",
    )
  }

  if (currentAction === "redact" && requestedAction !== "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A redacted maintenance window can only be suppressed",
    )
  }

  if (requestedAction === "withdraw" && currentAction !== "publish") {
    throw new CommandValidationError(
      "PUBLICATION_NOT_LIVE",
      "Only a published maintenance window can be withdrawn",
    )
  }
}

async function readRoot(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
) {
  const result = await transaction.execute({
    sql: "SELECT public_id, version FROM maintenance_windows WHERE id = ?",
    args: [maintenanceWindowId],
  })

  if (!result.rows[0]) {
    throw new CommandNotFoundError(
      "MAINTENANCE_NOT_FOUND",
      "The maintenance window does not exist",
    )
  }

  return parseRoot(result.rows[0])
}

const publicationSourceSelection = `
  publication_events.publication_version,
  publication_events.action,
  publication_events.target_source_id,
  publication_events.target_source_revision,
  publication_events.target_snapshot_json,
  publication_events.resulting_disposition,
  publication_events.resulting_source_type,
  publication_events.resulting_source_id,
  publication_events.resulting_source_revision,
  publication_events.resulting_current_snapshot_json,
  publication_events.timeline_entry_id,
  publication_events.timeline_effective_at,
  publication_events.timeline_recorded_at,
  publication_events.timeline_snapshot_json,
  maintenance_events.maintenance_window_id AS source_window_id,
  maintenance_events.maintenance_version AS source_revision,
  maintenance_events.public_entry_id AS source_public_entry_id,
  maintenance_events.effective_at AS source_effective_at,
  maintenance_events.recorded_at AS source_recorded_at
`

async function readHead(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
) {
  const result = await transaction.execute({
    sql: `
      SELECT ${publicationSourceSelection}
      FROM publication_events
      LEFT JOIN maintenance_events
        ON maintenance_events.id = publication_events.target_source_id
      WHERE publication_events.stream_type = 'maintenance'
        AND publication_events.stream_id = ?
      ORDER BY publication_events.publication_version DESC, publication_events.id DESC
      LIMIT 1
    `,
    args: [maintenanceWindowId],
  })

  if (!result.rows[0]) {
    throw new CommandNotFoundError(
      "MAINTENANCE_PUBLICATION_NOT_FOUND",
      "The maintenance window has no public snapshot",
    )
  }

  return parseSourceRow(result.rows[0])
}

async function readPublishedSources(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
  maintenancePublicId: string,
) {
  const result = await transaction.execute({
    sql: `
      WITH ranked_publications AS (
        SELECT
          publication_events.*,
          row_number() OVER (
            PARTITION BY publication_events.target_source_id
            ORDER BY publication_events.publication_version DESC, publication_events.id DESC
          ) AS source_rank
        FROM publication_events
        WHERE publication_events.stream_type = 'maintenance'
          AND publication_events.stream_id = ?
      )
      SELECT
        ranked_publications.publication_version,
        ranked_publications.action,
        ranked_publications.target_source_id,
        ranked_publications.target_source_revision,
        ranked_publications.target_snapshot_json,
        ranked_publications.resulting_disposition,
        ranked_publications.resulting_source_type,
        ranked_publications.resulting_source_id,
        ranked_publications.resulting_source_revision,
        ranked_publications.resulting_current_snapshot_json,
        ranked_publications.timeline_entry_id,
        ranked_publications.timeline_effective_at,
        ranked_publications.timeline_recorded_at,
        ranked_publications.timeline_snapshot_json,
        maintenance_events.maintenance_window_id AS source_window_id,
        maintenance_events.maintenance_version AS source_revision,
        maintenance_events.public_entry_id AS source_public_entry_id,
        maintenance_events.effective_at AS source_effective_at,
        maintenance_events.recorded_at AS source_recorded_at
      FROM ranked_publications
      LEFT JOIN maintenance_events
        ON maintenance_events.id = ranked_publications.target_source_id
      WHERE ranked_publications.source_rank = 1
      ORDER BY ranked_publications.target_source_revision, ranked_publications.target_source_id
    `,
    args: [maintenanceWindowId],
  })

  const sources = result.rows.map((row) => {
    const parsed = parseSourceRow(row)
    return createPublishedSource(
      parsed,
      maintenanceWindowId,
      maintenancePublicId,
    )
  })

  if (sources.length === 0) throw invalidPublicationState()

  return sources
}

async function readPublicDependencies(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
  sources: readonly PublishedMaintenanceSource[],
): Promise<MaintenancePublicDependency[]> {
  const result = await transaction.execute({
    sql: `
      SELECT
        maintenance_event_components.maintenance_event_id,
        maintenance_event_components.position,
        maintenance_event_components.component_id,
        maintenance_event_components.public_component_id_snapshot,
        maintenance_event_components.public_name_snapshot,
        maintenance_event_components.component_metadata_publication_version
      FROM maintenance_event_components
      INNER JOIN maintenance_events
        ON maintenance_events.id = maintenance_event_components.maintenance_event_id
      WHERE maintenance_events.maintenance_window_id = ?
      ORDER BY
        maintenance_event_components.maintenance_event_id,
        maintenance_event_components.position,
        maintenance_event_components.component_id
    `,
    args: [maintenanceWindowId],
  })
  const sourceIds = new Set(sources.map((source) => source.eventId))
  const rows = result.rows.filter((row) =>
    sourceIds.has(String(row.maintenance_event_id)),
  )
  const dependencies = new Map<string, MaintenancePublicDependency>()

  for (const source of sources) {
    const sourceRows = rows.filter(
      (row) => String(row.maintenance_event_id) === source.eventId,
    )

    if (sourceRows.length !== source.snapshot.affectedComponents.length) {
      throw invalidSnapshot()
    }

    for (const [index, row] of sourceRows.entries()) {
      const position = Number(row.position)
      const componentId = String(row.component_id)
      const componentPublicId =
        row.public_component_id_snapshot === null
          ? null
          : String(row.public_component_id_snapshot)
      const publicName =
        row.public_name_snapshot === null
          ? null
          : String(row.public_name_snapshot)
      const metadataPublicationVersion =
        row.component_metadata_publication_version === null
          ? null
          : Number(row.component_metadata_publication_version)
      const snapshot = source.snapshot.affectedComponents[index]

      if (
        position !== index ||
        componentPublicId === null ||
        publicName === null ||
        metadataPublicationVersion === null ||
        !Number.isSafeInteger(metadataPublicationVersion) ||
        metadataPublicationVersion < 1 ||
        !snapshot ||
        snapshot.componentPublicId !== componentPublicId ||
        snapshot.name !== publicName
      ) {
        throw invalidSnapshot()
      }

      const existing = dependencies.get(componentId)
      if (existing && existing.componentPublicId !== componentPublicId) {
        throw invalidSnapshot()
      }

      dependencies.set(componentId, { componentId, componentPublicId })
    }
  }

  return [...dependencies.values()].toSorted((left, right) =>
    left.componentId.localeCompare(right.componentId),
  )
}

async function closePublicDependencies(
  transaction: StatementExecutor,
  dependencies: readonly MaintenancePublicDependency[],
  guards: readonly z.infer<typeof maintenanceDependencyGuardSchema>[],
  recordedAt: number,
) {
  const dependencyIds = dependencies.map(
    (dependency) => dependency.componentId,
  )
  const guardIds = guards
    .map((guard) => guard.componentId)
    .toSorted((left, right) => left.localeCompare(right))

  if (
    dependencyIds.length !== guardIds.length ||
    dependencyIds.some(
      (componentId, index) => componentId !== guardIds[index],
    )
  ) {
    throw new CommandValidationError(
      "MAINTENANCE_DEPENDENCY_GUARDS_INCOMPLETE",
      "Every public maintenance dependency requires a current component guard",
    )
  }

  const guardsByComponentId = new Map(
    guards.map((guard) => [guard.componentId, guard]),
  )
  const nextVersions: Array<{
    componentId: string
    componentVersion: number
  }> = []

  for (const dependency of dependencies) {
    const guard = guardsByComponentId.get(dependency.componentId)
    if (!guard) {
      throw new CommandValidationError(
        "MAINTENANCE_DEPENDENCY_GUARDS_INCOMPLETE",
        "Every public maintenance dependency requires a current component guard",
      )
    }

    const result = await transaction.execute({
      sql: `
        WITH ranked_publications AS (
          SELECT
            stream_id,
            publication_version,
            resulting_disposition,
            resulting_current_snapshot_json,
            row_number() OVER (
              PARTITION BY stream_id
              ORDER BY publication_version DESC, id DESC
            ) AS rank
          FROM publication_events
          WHERE stream_type = 'component_metadata'
        )
        SELECT
          components.version,
          components.public_id,
          ranked_publications.publication_version,
          ranked_publications.resulting_disposition,
          ranked_publications.resulting_current_snapshot_json
        FROM components
        LEFT JOIN ranked_publications
          ON ranked_publications.stream_id = components.id
          AND ranked_publications.rank = 1
        WHERE components.id = ?
        LIMIT 1
      `,
      args: [guard.componentId],
    })
    const component = result.rows[0]

    if (!component) {
      throw new CommandNotFoundError(
        "COMPONENT_NOT_FOUND",
        "An affected maintenance component does not exist",
      )
    }

    if (
      Number(component.version) !== guard.expectedComponentVersion ||
      String(component.public_id) !== dependency.componentPublicId
    ) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed after the privacy action was prepared",
      )
    }

    if (
      Number(component.publication_version ?? 0) !==
      guard.expectedComponentMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "An affected component publication changed after review",
      )
    }

    if (
      String(component.resulting_disposition) !== "published" ||
      component.resulting_current_snapshot_json === null
    ) {
      throw new CommandValidationError(
        "COMPONENT_NOT_PUBLIC",
        "A public maintenance dependency must still be public",
      )
    }

    const publicSnapshot = parseStoredJson(
      componentPublicSnapshotSchema,
      component.resulting_current_snapshot_json,
      invalidSnapshot,
    )

    if (publicSnapshot.componentPublicId !== dependency.componentPublicId) {
      throw invalidSnapshot()
    }

    const nextVersion = guard.expectedComponentVersion + 1
    const updateResult = await transaction.execute({
      sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextVersion,
        recordedAt,
        guard.componentId,
        guard.expectedComponentVersion,
      ],
    })

    if (!updateResult.rows[0]) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed during the privacy action",
      )
    }

    nextVersions.push({
      componentId: guard.componentId,
      componentVersion: nextVersion,
    })
  }

  return nextVersions
}

function orderCurrentSourceLast(
  sources: readonly PublishedMaintenanceSource[],
  currentEventId: string,
  action: "redact" | "suppress",
) {
  if (
    action === "redact" &&
    sources.some(
      (source) =>
        source.action !== "publish" && source.action !== "withdraw",
    )
  ) {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "Maintenance publication sources cannot be redacted again",
    )
  }

  const current = sources.find((source) => source.eventId === currentEventId)
  if (!current) throw invalidPublicationState()

  return [
    ...sources.filter((source) => source.eventId !== currentEventId),
    current,
  ]
}

async function assertRootCas(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
  expectedMaintenanceVersion: number,
  recordedAt: number,
) {
  const result = await transaction.execute({
    sql: "UPDATE maintenance_windows SET updated_at = ? WHERE id = ? AND version = ? RETURNING version",
    args: [recordedAt, maintenanceWindowId, expectedMaintenanceVersion],
  })

  if (!result.rows[0]) {
    throw new CommandConflictError(
      "MAINTENANCE_VERSION_CONFLICT",
      "Maintenance changed during the publication action",
    )
  }
}

export async function insertMaintenancePublicationClosureEvents(
  transaction: StatementExecutor,
  prepared: PreparedMaintenancePublicationClosure,
  input: {
    action: MaintenancePublicationClosureAction
    allocation: PublicationEventAllocationSlice
    recordedAt: number
    correlationId: string
  },
) {
  for (const [index, source] of prepared.targets.entries()) {
    const publicationVersion =
      prepared.maintenancePublicationVersion + index + 1
    const withdrawalEntryId =
      input.action === "withdraw" ? randomUUID() : null
    const timelineEntryId = withdrawalEntryId ?? source.publicEntryId
    const timelineEffectiveAt =
      input.action === "withdraw" ? input.recordedAt : source.effectiveAt
    const timelineRecordedAt =
      input.action === "withdraw" ? input.recordedAt : source.recordedAt
    const timelineSnapshot =
      input.action === "withdraw" && withdrawalEntryId
        ? createWithdrawnTimelineSnapshot({
            schemaVersion: 1,
            kind: "withdrawn",
            publicEntryId: withdrawalEntryId,
          })
        : input.action === "redact"
          ? createRedactedTimelineSnapshot({
              schemaVersion: 1,
              kind: "redacted",
              publicEntryId: source.publicEntryId,
            })
          : null

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'maintenance', ?, ?, ?, 'maintenance_event', ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        randomUUID(),
        prepared.maintenanceWindowId,
        publicationVersion,
        input.action,
        source.eventId,
        source.sourceRevision,
        input.action === "suppress"
          ? null
          : JSON.stringify(source.snapshot),
        timelineEntryId,
        timelineEffectiveAt,
        timelineRecordedAt,
        timelineSnapshot === null ? null : JSON.stringify(timelineSnapshot),
        input.recordedAt,
        input.allocation.firstOwnerOrdinal + index,
        input.allocation.firstPublicOrdinal + index,
        input.allocation.publicPrivacyEpoch,
        input.correlationId,
      ],
    })
  }

  return {
    maintenancePublicationVersion:
      prepared.maintenancePublicationVersion + prepared.targets.length,
    publicPrivacyEpoch: input.allocation.publicPrivacyEpoch,
  }
}

export async function prepareMaintenancePublicationClosure(
  transaction: StatementExecutor,
  guard: MaintenancePublicationClosureGuard,
  action: MaintenancePublicationClosureAction,
  recordedAt: number,
): Promise<PreparedMaintenancePublicationClosure> {
  const root = await readRoot(transaction, guard.maintenanceWindowId)

  if (root.version !== guard.expectedMaintenanceVersion) {
    throw new CommandConflictError(
      "MAINTENANCE_VERSION_CONFLICT",
      "Maintenance changed after the publication action was prepared",
    )
  }

  const head = await readHead(transaction, guard.maintenanceWindowId)

  if (
    head.publication_version !==
    guard.expectedMaintenancePublicationVersion
  ) {
    throw new CommandConflictError(
      "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
      "Maintenance publication changed after the action was prepared",
    )
  }

  assertClosureAllowed(head.action, action)
  const currentSource = createPublishedSource(
    head,
    guard.maintenanceWindowId,
    root.publicId,
  )
  assertHeadState(head, currentSource)

  const targets =
    action === "withdraw"
      ? [currentSource]
      : orderCurrentSourceLast(
          await readPublishedSources(
            transaction,
            guard.maintenanceWindowId,
            root.publicId,
          ),
          currentSource.eventId,
          action,
        )
  const dependencies =
    action === "withdraw"
      ? []
      : await readPublicDependencies(
          transaction,
          guard.maintenanceWindowId,
          targets,
        )

  await assertRootCas(
    transaction,
    guard.maintenanceWindowId,
    guard.expectedMaintenanceVersion,
    recordedAt,
  )

  return {
    maintenanceWindowId: guard.maintenanceWindowId,
    maintenanceVersion: root.version,
    maintenancePublicationVersion: head.publication_version,
    targets,
    dependencies,
  }
}

export async function closeMaintenancePublicationForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CloseMaintenancePublicationResult> {
  const input = closeMaintenancePublicationInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const recordedAt = Date.now()
  const correlationId = randomUUID()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_maintenance_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseResult(existingResultRef)

    const prepared = await prepareMaintenancePublicationClosure(
      transaction,
      {
        maintenanceWindowId: input.maintenanceWindowId,
        expectedMaintenanceVersion: input.expectedMaintenanceVersion,
        expectedMaintenancePublicationVersion:
          input.expectedMaintenancePublicationVersion,
      },
      input.action,
      recordedAt,
    )
    const componentVersions =
      input.action === "withdraw"
        ? []
        : await closePublicDependencies(
            transaction,
            prepared.dependencies,
            input.affectedComponents,
            recordedAt,
          )
    const allocation = await allocateOrdinals(
      transaction,
      prepared.targets.length,
      prepared.targets.length,
      recordedAt,
      input.action === "withdraw" ? 0 : 1,
    )
    const closure = await insertMaintenancePublicationClosureEvents(
      transaction,
      prepared,
      {
        action: input.action,
        allocation: {
          firstOwnerOrdinal:
            allocation.ownerOrdinal - prepared.targets.length + 1,
          firstPublicOrdinal:
            allocation.publicOrdinal - prepared.targets.length + 1,
          publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        },
        recordedAt,
        correlationId,
      },
    )
    const result: CloseMaintenancePublicationResult = {
      maintenanceWindowId: input.maintenanceWindowId,
      maintenanceVersion: prepared.maintenanceVersion,
      maintenancePublicationVersion:
        closure.maintenancePublicationVersion,
      publicPrivacyEpoch: closure.publicPrivacyEpoch,
      componentVersions,
    }

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_maintenance_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
