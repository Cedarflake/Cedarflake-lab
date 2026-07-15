import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  maintenancePhases,
  type MaintenancePhase,
} from "@/domain/maintenance"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  createMaintenancePublicSnapshot,
  type MaintenancePublicKind,
} from "@/lib/public/maintenance-snapshots"
import {
  componentPublicSnapshotSchema,
  type ComponentPublicSnapshot,
} from "@/lib/public/snapshots"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import {
  withWriteTransaction,
  type StatementExecutor,
} from "./write-transaction"

const timestampSchema = z.number().int().nonnegative().safe()
const nullableSummarySchema = z.string().trim().max(280).nullable()
const componentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

export const publishMaintenanceInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    maintenanceWindowId: z.uuid(),
    expectedMaintenanceVersion: z.number().int().positive().safe(),
    expectedMaintenancePublicationVersion: z
      .number()
      .int()
      .nonnegative()
      .safe(),
    effectiveAt: timestampSchema,
    publicTitle: z.string().trim().min(1).max(120),
    publicSummary: nullableSummarySchema,
    publicStartsAt: timestampSchema,
    publicEndsAt: timestampSchema,
    publicTimezone: z.string().trim().min(1).max(80),
    affectedComponents: z.array(componentGuardSchema).min(1).max(50),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.publicStartsAt >= input.publicEndsAt) {
      context.addIssue({
        code: "custom",
        path: ["publicEndsAt"],
        message: "Public maintenance must end after it starts",
      })
    }

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

export type PublishMaintenanceInput = z.infer<
  typeof publishMaintenanceInputSchema
>

export interface PublishMaintenanceResult {
  maintenanceWindowId: string
  maintenanceEventId: string
  maintenanceVersion: number
  maintenancePublicationVersion: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
}

interface CurrentMaintenance {
  id: string
  publicId: string
  version: number
  phase: MaintenancePhase
  title: string
  ownerSummary: string | null
  startsAt: number
  endsAt: number
  timezone: string
  componentIds: readonly string[]
}

type PublicationAction = "publish" | "withdraw" | "redact" | "suppress"

interface PublicationState {
  version: number
  action: PublicationAction | null
  isPublished: boolean
}

interface ComponentRecord {
  componentId: string
  componentPublicId: string
  expectedComponentVersion: number
  nextComponentVersion: number
  componentRevisionId: string
  ownerName: string
  metadataPublicationVersion: number
  publicSnapshot: ComponentPublicSnapshot
}

const currentMaintenanceRowSchema = z
  .object({
    maintenance_window_id: z.uuid(),
    maintenance_public_id: z.uuid(),
    maintenance_version: z.number().int().positive().safe(),
    event_id: z.uuid(),
    event_version: z.number().int().positive().safe(),
    phase: z.enum(maintenancePhases),
    title: z.string().min(1).max(120),
    owner_summary: z.string().max(280).nullable(),
    starts_at: timestampSchema,
    ends_at: timestampSchema,
    timezone: z.string().min(1).max(80),
  })
  .strict()

const componentReferenceRowSchema = z
  .object({
    position: z.number().int().nonnegative().safe(),
    component_id: z.uuid(),
  })
  .strict()

const publicationStateRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    resulting_disposition: z.enum(["published", "closed"]),
  })
  .strict()

const componentRowSchema = z
  .object({
    component_id: z.uuid(),
    component_public_id: z.uuid(),
    component_version: z.number().int().positive().safe(),
    component_revision_id: z.uuid(),
    lifecycle: z.enum(["active", "archived"]),
    owner_name: z.string().min(1).max(80),
    metadata_publication_version: z.number().int().positive().safe().nullable(),
    metadata_disposition: z.enum(["published", "closed"]).nullable(),
    metadata_snapshot_json: z.string().nullable(),
  })
  .strict()

const resultSchema = z
  .object({
    maintenanceWindowId: z.uuid(),
    maintenanceEventId: z.uuid(),
    maintenanceVersion: z.number().int().positive().safe(),
    maintenancePublicationVersion: z.number().int().positive().safe(),
    componentVersions: z.array(
      z
        .object({
          componentId: z.uuid(),
          componentVersion: z.number().int().positive().safe(),
        })
        .strict(),
    ),
  })
  .strict()

function invalidMaintenanceState() {
  return new CommandValidationError(
    "INVALID_MAINTENANCE_STATE",
    "Stored maintenance state is invalid",
  )
}

function invalidPublicSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public component snapshot is invalid",
  )
}

function parseReceiptResult(resultRef: string): PublishMaintenanceResult {
  try {
    return resultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored maintenance publication receipt is invalid",
    )
  }
}

function parseStoredJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw invalidPublicSnapshot()
  }
}

function publicKindForPhase(phase: MaintenancePhase): MaintenancePublicKind {
  switch (phase) {
    case "scheduled":
      return "scheduled"
    case "in_progress":
      return "started"
    case "completed":
      return "completed"
    case "cancelled":
      return "cancelled"
  }
}

async function readCurrentMaintenance(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
): Promise<CurrentMaintenance> {
  const rootResult = await transaction.execute({
    sql: `
      SELECT
        maintenance_windows.id AS maintenance_window_id,
        maintenance_windows.public_id AS maintenance_public_id,
        maintenance_windows.version AS maintenance_version,
        maintenance_events.id AS event_id,
        maintenance_events.maintenance_version AS event_version,
        maintenance_events.phase,
        maintenance_events.title,
        maintenance_events.owner_summary,
        maintenance_events.starts_at,
        maintenance_events.ends_at,
        maintenance_events.timezone
      FROM maintenance_windows
      LEFT JOIN maintenance_events
        ON maintenance_events.maintenance_window_id = maintenance_windows.id
        AND maintenance_events.maintenance_version = maintenance_windows.version
      WHERE maintenance_windows.id = ?
      LIMIT 1
    `,
    args: [maintenanceWindowId],
  })
  const rawRoot = rootResult.rows[0]

  if (!rawRoot) {
    throw new CommandNotFoundError(
      "MAINTENANCE_NOT_FOUND",
      "The maintenance window does not exist",
    )
  }

  const parsedRoot = currentMaintenanceRowSchema.safeParse(rawRoot)
  if (
    !parsedRoot.success ||
    parsedRoot.data.event_version !== parsedRoot.data.maintenance_version ||
    parsedRoot.data.starts_at >= parsedRoot.data.ends_at
  ) {
    throw invalidMaintenanceState()
  }

  const referenceResult = await transaction.execute({
    sql: "SELECT position, component_id FROM maintenance_event_components WHERE maintenance_event_id = ? ORDER BY position, component_id",
    args: [parsedRoot.data.event_id],
  })
  const references = referenceResult.rows.map((row) => {
    const parsed = componentReferenceRowSchema.safeParse(row)
    if (!parsed.success) throw invalidMaintenanceState()
    return parsed.data
  })
  const ids = new Set<string>()

  if (references.length === 0) throw invalidMaintenanceState()
  for (const [index, reference] of references.entries()) {
    if (
      reference.position !== index ||
      ids.has(reference.component_id)
    ) {
      throw invalidMaintenanceState()
    }

    ids.add(reference.component_id)
  }

  return {
    id: parsedRoot.data.maintenance_window_id,
    publicId: parsedRoot.data.maintenance_public_id,
    version: parsedRoot.data.maintenance_version,
    phase: parsedRoot.data.phase,
    title: parsedRoot.data.title,
    ownerSummary: parsedRoot.data.owner_summary,
    startsAt: parsedRoot.data.starts_at,
    endsAt: parsedRoot.data.ends_at,
    timezone: parsedRoot.data.timezone,
    componentIds: references.map((reference) => reference.component_id),
  }
}

async function readPublicationState(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
): Promise<PublicationState> {
  const result = await transaction.execute({
    sql: "SELECT publication_version, action, resulting_disposition FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC, id DESC LIMIT 1",
    args: [maintenanceWindowId],
  })
  const rawState = result.rows[0]
  if (!rawState) return { version: 0, action: null, isPublished: false }

  const parsed = publicationStateRowSchema.safeParse(rawState)
  if (!parsed.success) throw invalidMaintenanceState()

  const isPublished = parsed.data.resulting_disposition === "published"
  if ((parsed.data.action === "publish") !== isPublished) {
    throw invalidMaintenanceState()
  }

  return {
    version: parsed.data.publication_version,
    action: parsed.data.action,
    isPublished,
  }
}

function orderGuards(
  currentComponentIds: readonly string[],
  guards: readonly z.infer<typeof componentGuardSchema>[],
) {
  const guardsById = new Map(guards.map((guard) => [guard.componentId, guard]))

  if (
    guardsById.size !== currentComponentIds.length ||
    currentComponentIds.some((componentId) => !guardsById.has(componentId))
  ) {
    throw new CommandConflictError(
      "MAINTENANCE_REFERENCE_SET_CONFLICT",
      "Maintenance references changed after publication was reviewed",
    )
  }

  return currentComponentIds.map((componentId) => {
    const guard = guardsById.get(componentId)
    if (!guard) throw invalidMaintenanceState()
    return guard
  })
}

async function readHistoricalPublicComponentIds(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
) {
  const result = await transaction.execute({
    sql: `
      WITH ranked_source_state AS (
        SELECT
          target_source_id,
          action,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS source_rank
        FROM publication_events
        WHERE stream_type = 'maintenance' AND stream_id = ?
      )
      SELECT DISTINCT maintenance_event_components.component_id
      FROM ranked_source_state AS source_state
      INNER JOIN maintenance_event_components
        ON maintenance_event_components.maintenance_event_id = source_state.target_source_id
      WHERE source_state.source_rank = 1
        AND source_state.action IN ('publish', 'withdraw')
        AND maintenance_event_components.public_component_id_snapshot IS NOT NULL
        AND maintenance_event_components.public_name_snapshot IS NOT NULL
        AND maintenance_event_components.component_metadata_publication_version IS NOT NULL
      ORDER BY maintenance_event_components.component_id
    `,
    args: [maintenanceWindowId],
  })

  return new Set(result.rows.map((row) => String(row.component_id)))
}

async function readComponents(
  transaction: StatementExecutor,
  guards: readonly z.infer<typeof componentGuardSchema>[],
  existingPublicComponentIds: ReadonlySet<string>,
): Promise<ComponentRecord[]> {
  const placeholders = guards.map(() => "?").join(", ")
  const result = await transaction.execute({
    sql: `
      WITH ranked_revisions AS (
        SELECT
          id,
          component_id,
          lifecycle,
          owner_name,
          row_number() OVER (
            PARTITION BY component_id
            ORDER BY component_version DESC, id DESC
          ) AS rank
        FROM component_revisions
      ),
      ranked_publications AS (
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
        components.id AS component_id,
        components.public_id AS component_public_id,
        components.version AS component_version,
        ranked_revisions.id AS component_revision_id,
        ranked_revisions.lifecycle,
        ranked_revisions.owner_name,
        ranked_publications.publication_version AS metadata_publication_version,
        ranked_publications.resulting_disposition AS metadata_disposition,
        ranked_publications.resulting_current_snapshot_json AS metadata_snapshot_json
      FROM components
      LEFT JOIN ranked_revisions
        ON ranked_revisions.component_id = components.id
        AND ranked_revisions.rank = 1
      LEFT JOIN ranked_publications
        ON ranked_publications.stream_id = components.id
        AND ranked_publications.rank = 1
      WHERE components.id IN (${placeholders})
    `,
    args: guards.map((guard) => guard.componentId),
  })
  const rowsById = new Map(
    result.rows.map((row) => [String(row.component_id), row]),
  )

  return guards.map((guard) => {
    const rawComponent = rowsById.get(guard.componentId)
    if (!rawComponent) {
      throw new CommandNotFoundError(
        "COMPONENT_NOT_FOUND",
        "An affected component does not exist",
      )
    }

    const parsed = componentRowSchema.safeParse(rawComponent)
    if (!parsed.success) throw invalidMaintenanceState()
    const component = parsed.data

    if (component.lifecycle !== "active") {
      throw new CommandValidationError(
        "COMPONENT_ARCHIVED",
        "Archived components cannot be referenced by public maintenance",
      )
    }
    if (component.component_version !== guard.expectedComponentVersion) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed after publication was reviewed",
      )
    }
    if (
      component.metadata_disposition !== "published" ||
      component.metadata_publication_version === null ||
      component.metadata_snapshot_json === null
    ) {
      throw new CommandValidationError(
        "COMPONENT_NOT_PUBLIC",
        "Public maintenance can reference only public components",
      )
    }
    if (
      component.metadata_publication_version !==
      guard.expectedComponentMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "An affected component publication changed after maintenance was reviewed",
      )
    }

    const publicSnapshot = componentPublicSnapshotSchema.safeParse(
      parseStoredJson(component.metadata_snapshot_json),
    )
    if (
      !publicSnapshot.success ||
      publicSnapshot.data.componentPublicId !== component.component_public_id
    ) {
      throw invalidPublicSnapshot()
    }

    return {
      componentId: component.component_id,
      componentPublicId: component.component_public_id,
      expectedComponentVersion: guard.expectedComponentVersion,
      nextComponentVersion:
        guard.expectedComponentVersion +
        Number(!existingPublicComponentIds.has(component.component_id)),
      componentRevisionId: component.component_revision_id,
      ownerName: component.owner_name,
      metadataPublicationVersion: component.metadata_publication_version,
      publicSnapshot: publicSnapshot.data,
    }
  })
}

async function compareAndSwapDependencies(
  transaction: StatementExecutor,
  components: readonly ComponentRecord[],
  recordedAt: number,
) {
  for (const component of components) {
    if (component.nextComponentVersion === component.expectedComponentVersion) {
      continue
    }

    const result = await transaction.execute({
      sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        component.nextComponentVersion,
        recordedAt,
        component.componentId,
        component.expectedComponentVersion,
      ],
    })
    if (!result.rows[0]) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed while maintenance was being published",
      )
    }
  }
}

async function insertComponentSnapshots(
  transaction: StatementExecutor,
  maintenanceEventId: string,
  components: readonly ComponentRecord[],
) {
  for (const [position, component] of components.entries()) {
    await transaction.execute({
      sql: "INSERT INTO maintenance_event_components (maintenance_event_id, position, component_id, component_version, component_revision_id, owner_name_snapshot, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        maintenanceEventId,
        position,
        component.componentId,
        component.nextComponentVersion,
        component.componentRevisionId,
        component.ownerName,
        component.publicSnapshot.componentPublicId,
        component.publicSnapshot.name,
        component.metadataPublicationVersion,
      ],
    })
  }
}

export async function publishMaintenanceForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<PublishMaintenanceResult> {
  const input = publishMaintenanceInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const maintenanceEventId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_maintenance",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseReceiptResult(existingResultRef)

    const current = await readCurrentMaintenance(
      transaction,
      input.maintenanceWindowId,
    )
    if (current.version !== input.expectedMaintenanceVersion) {
      throw new CommandConflictError(
        "MAINTENANCE_VERSION_CONFLICT",
        "Maintenance changed after publication was reviewed",
      )
    }

    const publicationState = await readPublicationState(transaction, current.id)
    if (
      publicationState.version !== input.expectedMaintenancePublicationVersion
    ) {
      throw new CommandConflictError(
        "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
        "Maintenance publication changed after it was reviewed",
      )
    }
    if (publicationState.isPublished) {
      throw new CommandValidationError(
        "MAINTENANCE_ALREADY_PUBLIC",
        "Only a currently private maintenance window can be published",
      )
    }
    if (publicationState.action === "suppress") {
      throw new CommandValidationError(
        "PUBLICATION_TERMINAL",
        "A suppressed maintenance window cannot be published again",
      )
    }
    if (
      input.publicStartsAt !== current.startsAt ||
      input.publicEndsAt !== current.endsAt ||
      input.publicTimezone !== current.timezone
    ) {
      throw new CommandValidationError(
        "MAINTENANCE_SCHEDULE_MISMATCH",
        "The public schedule must match the current maintenance schedule",
      )
    }

    const orderedGuards = orderGuards(
      current.componentIds,
      input.affectedComponents,
    )
    const historicalPublicComponentIds = await readHistoricalPublicComponentIds(
      transaction,
      current.id,
    )
    const affectedComponents = await readComponents(
      transaction,
      orderedGuards,
      historicalPublicComponentIds,
    )
    const nextMaintenanceVersion = current.version + 1
    const nextPublicationVersion = publicationState.version + 1
    const allocation = await allocateOrdinals(transaction, 2, 1, recordedAt)
    const eventOwnerOrdinal = allocation.ownerOrdinal - 1

    const maintenanceResult = await transaction.execute({
      sql: "UPDATE maintenance_windows SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextMaintenanceVersion,
        recordedAt,
        current.id,
        current.version,
      ],
    })
    if (!maintenanceResult.rows[0]) {
      throw new CommandConflictError(
        "MAINTENANCE_VERSION_CONFLICT",
        "Maintenance changed while it was being published",
      )
    }

    await compareAndSwapDependencies(transaction, affectedComponents, recordedAt)

    const publicSnapshot = createMaintenancePublicSnapshot({
      schemaVersion: 1,
      publicEntryId,
      maintenancePublicId: current.publicId,
      kind: publicKindForPhase(current.phase),
      phase: current.phase,
      title: input.publicTitle,
      summary: input.publicSummary,
      startsAt: input.publicStartsAt,
      endsAt: input.publicEndsAt,
      timezone: input.publicTimezone,
      effectiveAt: input.effectiveAt,
      affectedComponents: affectedComponents.map((component) => ({
        componentPublicId: component.publicSnapshot.componentPublicId,
        name: component.publicSnapshot.name,
      })),
    })

    await transaction.execute({
      sql: "INSERT INTO maintenance_events (id, maintenance_window_id, maintenance_version, kind, phase, title, owner_summary, private_note, starts_at, ends_at, timezone, public_title, public_phase, public_summary, public_starts_at, public_ends_at, public_timezone, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, 'metadata', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        maintenanceEventId,
        current.id,
        nextMaintenanceVersion,
        current.phase,
        current.title,
        current.ownerSummary,
        current.startsAt,
        current.endsAt,
        current.timezone,
        input.publicTitle,
        current.phase,
        input.publicSummary,
        input.publicStartsAt,
        input.publicEndsAt,
        input.publicTimezone,
        input.effectiveAt,
        recordedAt,
        eventOwnerOrdinal,
        publicEntryId,
        correlationId,
      ],
    })
    await insertComponentSnapshots(
      transaction,
      maintenanceEventId,
      affectedComponents,
    )

    const snapshotJson = JSON.stringify(publicSnapshot)
    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'maintenance', ?, ?, 'publish', 'maintenance_event', ?, ?, ?, 'published', 'maintenance_event', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        publicationEventId,
        current.id,
        nextPublicationVersion,
        maintenanceEventId,
        nextMaintenanceVersion,
        snapshotJson,
        maintenanceEventId,
        nextMaintenanceVersion,
        snapshotJson,
        publicEntryId,
        input.effectiveAt,
        recordedAt,
        snapshotJson,
        recordedAt,
        allocation.ownerOrdinal,
        allocation.publicOrdinal,
        allocation.publicPrivacyEpoch,
        correlationId,
      ],
    })

    const result: PublishMaintenanceResult = {
      maintenanceWindowId: current.id,
      maintenanceEventId,
      maintenanceVersion: nextMaintenanceVersion,
      maintenancePublicationVersion: nextPublicationVersion,
      componentVersions: affectedComponents.map((component) => ({
        componentId: component.componentId,
        componentVersion: component.nextComponentVersion,
      })),
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_maintenance",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
