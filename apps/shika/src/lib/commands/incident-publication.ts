import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  incidentPublicSnapshotSchema,
  type IncidentPublicSnapshot,
} from "@/lib/public/incident-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"
import {
  createRedactedTimelineSnapshot,
  createWithdrawnTimelineSnapshot,
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

const publicationActions = [
  "publish",
  "withdraw",
  "redact",
  "suppress",
] as const

const closureInputFields = {
  idempotencyKey: z.uuid(),
  incidentId: z.string().uuid(),
  expectedIncidentVersion: z.number().int().positive().safe(),
  expectedIncidentPublicationVersion: z.number().int().positive().safe(),
}

const incidentDependencyGuardSchema = z
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

const withdrawIncidentPublicationSchema = z
  .object({
    ...closureInputFields,
    action: z.literal("withdraw"),
  })
  .strict()

const privacyCloseIncidentPublicationSchema = z
  .object({
    ...closureInputFields,
    action: z.enum(["redact", "suppress"]),
    affectedComponents: z
      .array(incidentDependencyGuardSchema)
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const componentIds = new Set<string>()

    for (const [index, component] of value.affectedComponents.entries()) {
      if (componentIds.has(component.componentId)) {
        context.addIssue({
          code: "custom",
          path: ["affectedComponents", index, "componentId"],
          message: "Affected components must be unique",
        })
      }
      componentIds.add(component.componentId)
    }
  })

export const closeIncidentPublicationInputSchema = z.discriminatedUnion(
  "action",
  [withdrawIncidentPublicationSchema, privacyCloseIncidentPublicationSchema],
)

export type CloseIncidentPublicationInput = z.infer<
  typeof closeIncidentPublicationInputSchema
>

export interface CloseIncidentPublicationResult {
  incidentId: string
  incidentVersion: number
  incidentPublicationVersion: number
  publicPrivacyEpoch: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
}

export type IncidentPublicationClosureAction =
  CloseIncidentPublicationInput["action"]

export interface IncidentPublicationClosureGuard {
  incidentId: string
  expectedIncidentVersion: number
  expectedIncidentPublicationVersion: number
}

interface IncidentRoot {
  publicId: string
  version: number
}

interface IncidentPublicationStream {
  version: number
  action: (typeof publicationActions)[number]
  targetSourceId: string
  resultingDisposition: "published" | "closed"
  resultingSourceId: string | null
  resultingSnapshot: IncidentPublicSnapshot | null
}

export interface PublishedIncidentSource {
  sourceId: string
  sourceRevision: number
  publicEntryId: string
  effectiveAt: number
  recordedAt: number
  firstPublicationVersion: number
  latestAction: (typeof publicationActions)[number]
  snapshot: IncidentPublicSnapshot
}

export interface IncidentPublicDependency {
  componentId: string
  componentPublicId: string
}

export interface PreparedIncidentPublicationClosure {
  incidentId: string
  incidentVersion: number
  incidentPublicationVersion: number
  targets: readonly PublishedIncidentSource[]
  dependencies: readonly IncidentPublicDependency[]
}

function invalidSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public incident snapshot is invalid",
  )
}

function parseResult(resultRef: string): CloseIncidentPublicationResult {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(resultRef) as unknown
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored incident publication result is invalid",
    )
  }

  const result = z
    .object({
      incidentId: z.string().uuid(),
      incidentVersion: z.number().int().positive().safe(),
      incidentPublicationVersion: z.number().int().positive().safe(),
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
    .safeParse(parsedJson)

  if (!result.success) {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored incident publication result is invalid",
    )
  }

  return result.data
}

function parsePublicationAction(value: unknown) {
  const result = z.enum(publicationActions).safeParse(value)
  if (!result.success) {
    throw new CommandValidationError(
      "INVALID_PUBLICATION_STATE",
      "Stored incident publication state is invalid",
    )
  }
  return result.data
}

async function readIncidentRoot(
  transaction: StatementExecutor,
  incidentId: string,
): Promise<IncidentRoot> {
  const result = await transaction.execute({
    sql: "SELECT public_id, version FROM incidents WHERE id = ? LIMIT 1",
    args: [incidentId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandNotFoundError(
      "INCIDENT_NOT_FOUND",
      "The incident does not exist",
    )
  }

  return {
    publicId: String(row.public_id),
    version: Number(row.version),
  }
}

async function readPublicationStream(
  transaction: StatementExecutor,
  incidentId: string,
): Promise<IncidentPublicationStream> {
  const result = await transaction.execute({
    sql: "SELECT publication_version, action, target_source_id, resulting_disposition, resulting_source_id, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version DESC, id DESC LIMIT 1",
    args: [incidentId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandValidationError(
      "INCIDENT_NOT_PUBLIC",
      "A private incident has no public snapshot to close",
    )
  }

  const action = parsePublicationAction(row.action)
  const resultingDisposition = String(row.resulting_disposition)
  if (
    resultingDisposition !== "published" &&
    resultingDisposition !== "closed"
  ) {
    throw new CommandValidationError(
      "INVALID_PUBLICATION_STATE",
      "Stored incident publication state is invalid",
    )
  }

  const resultingSourceId =
    row.resulting_source_id === null
      ? null
      : String(row.resulting_source_id)
  const resultingSnapshot =
    row.resulting_current_snapshot_json === null
      ? null
      : parseStoredJson(
          incidentPublicSnapshotSchema,
          row.resulting_current_snapshot_json,
          invalidSnapshot,
        )

  const isOpenState =
    action === "publish" &&
    resultingDisposition === "published" &&
    resultingSourceId !== null &&
    resultingSnapshot !== null
  const isClosedState =
    action !== "publish" &&
    resultingDisposition === "closed" &&
    resultingSourceId === null &&
    resultingSnapshot === null

  if (!isOpenState && !isClosedState) {
    throw new CommandValidationError(
      "INVALID_PUBLICATION_STATE",
      "Stored incident publication state is invalid",
    )
  }

  return {
    version: Number(row.publication_version),
    action,
    targetSourceId: String(row.target_source_id),
    resultingDisposition,
    resultingSourceId,
    resultingSnapshot,
  }
}

async function readPublishedSources(
  transaction: StatementExecutor,
  incidentId: string,
  incidentPublicId: string,
): Promise<PublishedIncidentSource[]> {
  const result = await transaction.execute({
    sql: `
      SELECT
        publication_events.target_source_id,
        publication_events.target_source_revision,
        publication_events.publication_version,
        publication_events.action,
        publication_events.target_snapshot_json,
        incident_updates.incident_id,
        incident_updates.incident_version,
        incident_updates.public_entry_id,
        incident_updates.effective_at,
        incident_updates.recorded_at
      FROM publication_events
      LEFT JOIN incident_updates
        ON incident_updates.id = publication_events.target_source_id
      WHERE publication_events.stream_type = 'incident'
        AND publication_events.stream_id = ?
      ORDER BY publication_events.publication_version, publication_events.id
    `,
    args: [incidentId],
  })
  const sources = new Map<string, PublishedIncidentSource>()

  for (const row of result.rows) {
    const sourceId = String(row.target_source_id)
    const sourceRevision = Number(row.target_source_revision)
    const action = parsePublicationAction(row.action)

    if (
      row.incident_id === null ||
      String(row.incident_id) !== incidentId ||
      Number(row.incident_version) !== sourceRevision
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLICATION_STATE",
        "Stored incident publication source is invalid",
      )
    }

    const existing = sources.get(sourceId)
    if (action === "publish") {
      const snapshot = parseStoredJson(
        incidentPublicSnapshotSchema,
        row.target_snapshot_json,
        invalidSnapshot,
      )
      if (
        snapshot.incidentPublicId !== incidentPublicId ||
        snapshot.publicEntryId !== String(row.public_entry_id) ||
        snapshot.effectiveAt !== Number(row.effective_at)
      ) {
        throw invalidSnapshot()
      }

      if (existing) {
        if (
          existing.snapshot.publicEntryId !== snapshot.publicEntryId ||
          JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot)
        ) {
          throw invalidSnapshot()
        }
        existing.latestAction = action
      } else {
        sources.set(sourceId, {
          sourceId,
          sourceRevision,
          publicEntryId: String(row.public_entry_id),
          effectiveAt: Number(row.effective_at),
          recordedAt: Number(row.recorded_at),
          firstPublicationVersion: Number(row.publication_version),
          latestAction: action,
          snapshot,
        })
      }
      continue
    }

    if (!existing) {
      throw new CommandValidationError(
        "INVALID_PUBLICATION_STATE",
        "A publication closure has no published source",
      )
    }

    existing.latestAction = action
  }

  if (sources.size === 0) {
    throw new CommandValidationError(
      "INCIDENT_NOT_PUBLIC",
      "The incident has no published source",
    )
  }

  return [...sources.values()].toSorted(
    (left, right) =>
      left.firstPublicationVersion - right.firstPublicationVersion ||
      left.sourceId.localeCompare(right.sourceId),
  )
}

async function readIncidentPublicDependencies(
  transaction: StatementExecutor,
  incidentId: string,
  sources: readonly PublishedIncidentSource[],
): Promise<IncidentPublicDependency[]> {
  const result = await transaction.execute({
    sql: `
      SELECT
        incident_update_public_components.incident_update_id,
        incident_update_public_components.position,
        incident_update_public_components.component_id,
        incident_update_public_components.public_component_id_snapshot,
        incident_update_public_components.public_name_snapshot,
        incident_update_public_components.component_metadata_publication_version
      FROM incident_update_public_components
      INNER JOIN incident_updates
        ON incident_updates.id = incident_update_public_components.incident_update_id
      WHERE incident_updates.incident_id = ?
      ORDER BY
        incident_update_public_components.incident_update_id,
        incident_update_public_components.position,
        incident_update_public_components.component_id
    `,
    args: [incidentId],
  })
  const sourceIds = new Set(sources.map((source) => source.sourceId))
  const rows = result.rows.filter((row) =>
    sourceIds.has(String(row.incident_update_id)),
  )
  const dependencies = new Map<string, IncidentPublicDependency>()

  for (const source of sources) {
    const sourceRows = rows.filter(
      (row) => String(row.incident_update_id) === source.sourceId,
    )
    if (sourceRows.length !== source.snapshot.affectedComponents.length) {
      throw invalidSnapshot()
    }

    for (const row of sourceRows) {
      const position = Number(row.position)
      const publicComponentId =
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
      const snapshot = source.snapshot.affectedComponents.find(
        (component) => component.position === position,
      )

      if (
        publicComponentId === null ||
        publicName === null ||
        metadataPublicationVersion === null ||
        !snapshot ||
        snapshot.componentPublicId !== publicComponentId ||
        snapshot.name !== publicName
      ) {
        throw invalidSnapshot()
      }

      const componentId = String(row.component_id)
      const existing = dependencies.get(componentId)
      if (existing && existing.componentPublicId !== publicComponentId) {
        throw invalidSnapshot()
      }
      dependencies.set(componentId, {
        componentId,
        componentPublicId: publicComponentId,
      })
    }
  }

  return [...dependencies.values()].toSorted((left, right) =>
    left.componentId.localeCompare(right.componentId),
  )
}

async function closeIncidentDependencies(
  transaction: StatementExecutor,
  dependencies: readonly IncidentPublicDependency[],
  guards: readonly z.infer<typeof incidentDependencyGuardSchema>[],
  recordedAt: number,
) {
  const dependencyIds = dependencies.map((dependency) => dependency.componentId)
  const guardIds = guards.map((guard) => guard.componentId).toSorted()

  if (
    dependencyIds.length !== guardIds.length ||
    dependencyIds.some((componentId, index) => componentId !== guardIds[index])
  ) {
    throw new CommandValidationError(
      "INCIDENT_DEPENDENCY_GUARDS_INCOMPLETE",
      "Every public incident dependency requires a current component guard",
    )
  }

  const guardByComponentId = new Map(
    guards.map((guard) => [guard.componentId, guard]),
  )
  const nextVersions: Array<{
    componentId: string
    componentVersion: number
  }> = []

  for (const dependency of dependencies) {
    const guard = guardByComponentId.get(dependency.componentId)
    if (!guard) {
      throw new CommandValidationError(
        "INCIDENT_DEPENDENCY_GUARDS_INCOMPLETE",
        "Every public incident dependency requires a current component guard",
      )
    }

    const componentResult = await transaction.execute({
      sql: "SELECT version, public_id FROM components WHERE id = ? LIMIT 1",
      args: [guard.componentId],
    })
    const component = componentResult.rows[0]
    if (!component) {
      throw new CommandNotFoundError(
        "COMPONENT_NOT_FOUND",
        "An affected incident component does not exist",
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

    const publicationResult = await transaction.execute({
      sql: "SELECT publication_version FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = ? ORDER BY publication_version DESC, id DESC LIMIT 1",
      args: [guard.componentId],
    })
    if (
      Number(publicationResult.rows[0]?.publication_version ?? 0) !==
      guard.expectedComponentMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "An affected component publication changed after review",
      )
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

function assertClosureAllowed(
  stream: IncidentPublicationStream,
  action: CloseIncidentPublicationInput["action"],
) {
  if (stream.action === "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A suppressed incident cannot change publication state",
    )
  }

  if (stream.action === "redact" && action !== "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A redacted incident can only be suppressed",
    )
  }

  if (action === "withdraw" && stream.action !== "publish") {
    throw new CommandValidationError(
      "PUBLICATION_NOT_LIVE",
      "Only a published incident can be withdrawn",
    )
  }
}

function sourcesForClosure(
  sources: readonly PublishedIncidentSource[],
  stream: IncidentPublicationStream,
  action: CloseIncidentPublicationInput["action"],
) {
  if (action === "withdraw") {
    const sourceId = stream.resultingSourceId ?? stream.targetSourceId
    const source = sources.find((candidate) => candidate.sourceId === sourceId)
    if (!source || source.latestAction !== "publish") {
      throw new CommandValidationError(
        "INVALID_PUBLICATION_STATE",
        "The current public incident source is invalid",
      )
    }
    return [source]
  }

  const candidates = sources.filter((source) =>
    action === "redact"
      ? source.latestAction === "publish" || source.latestAction === "withdraw"
      : source.latestAction !== "suppress",
  )

  if (candidates.length === 0 || candidates.length !== sources.length) {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "The incident publication sources cannot be closed again",
    )
  }

  return candidates
}

export async function prepareIncidentPublicationClosure(
  transaction: StatementExecutor,
  guard: IncidentPublicationClosureGuard,
  action: IncidentPublicationClosureAction,
): Promise<PreparedIncidentPublicationClosure> {
  const incident = await readIncidentRoot(transaction, guard.incidentId)
  if (incident.version !== guard.expectedIncidentVersion) {
    throw new CommandConflictError(
      "INCIDENT_VERSION_CONFLICT",
      "The incident changed after the publication action was prepared",
    )
  }

  const stream = await readPublicationStream(transaction, guard.incidentId)
  if (stream.version !== guard.expectedIncidentPublicationVersion) {
    throw new CommandConflictError(
      "INCIDENT_PUBLICATION_VERSION_CONFLICT",
      "The incident publication changed after the action was prepared",
    )
  }

  assertClosureAllowed(stream, action)
  const sources = await readPublishedSources(
    transaction,
    guard.incidentId,
    incident.publicId,
  )
  const targets = sourcesForClosure(sources, stream, action)
  const dependencies =
    action === "withdraw"
      ? []
      : await readIncidentPublicDependencies(
          transaction,
          guard.incidentId,
          sources,
        )

  if (
    stream.resultingSnapshot &&
    !targets.some(
      (source) =>
        source.sourceId === stream.resultingSourceId &&
        JSON.stringify(source.snapshot) ===
          JSON.stringify(stream.resultingSnapshot),
    )
  ) {
    throw invalidSnapshot()
  }

  const updateResult = await transaction.execute({
    sql: "UPDATE incidents SET version = version WHERE id = ? AND version = ? RETURNING version",
    args: [guard.incidentId, incident.version],
  })
  if (!updateResult.rows[0]) {
    throw new CommandConflictError(
      "INCIDENT_VERSION_CONFLICT",
      "The incident changed during the publication action",
    )
  }

  return {
    incidentId: guard.incidentId,
    incidentVersion: incident.version,
    incidentPublicationVersion: stream.version,
    targets,
    dependencies,
  }
}

export async function insertIncidentPublicationClosureEvents(
  transaction: StatementExecutor,
  prepared: PreparedIncidentPublicationClosure,
  input: {
    action: IncidentPublicationClosureAction
    allocation: PublicationEventAllocationSlice
    recordedAt: number
    correlationId: string
  },
) {
  const withdrawalEntryId =
    input.action === "withdraw" ? randomUUID() : null

  for (const [index, source] of prepared.targets.entries()) {
    const publicationVersion =
      prepared.incidentPublicationVersion + index + 1
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
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'incident', ?, ?, ?, 'incident_update', ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        randomUUID(),
        prepared.incidentId,
        publicationVersion,
        input.action,
        source.sourceId,
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

  return prepared.incidentPublicationVersion + prepared.targets.length
}

export async function closeIncidentPublicationForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CloseIncidentPublicationResult> {
  const input = closeIncidentPublicationInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_incident_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseResult(existingResultRef)

    const prepared = await prepareIncidentPublicationClosure(
      transaction,
      {
        incidentId: input.incidentId,
        expectedIncidentVersion: input.expectedIncidentVersion,
        expectedIncidentPublicationVersion:
          input.expectedIncidentPublicationVersion,
      },
      input.action,
    )

    const componentVersions =
      input.action === "withdraw"
        ? []
        : await closeIncidentDependencies(
            transaction,
            prepared.dependencies,
            input.affectedComponents,
            recordedAt,
          )

    const privacyEpochDelta = input.action === "withdraw" ? 0 : 1
    const allocation = await allocateOrdinals(
      transaction,
      prepared.targets.length,
      prepared.targets.length,
      recordedAt,
      privacyEpochDelta,
    )
    const nextPublicationVersion =
      await insertIncidentPublicationClosureEvents(transaction, prepared, {
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
      })
    const result: CloseIncidentPublicationResult = {
      incidentId: input.incidentId,
      incidentVersion: prepared.incidentVersion,
      incidentPublicationVersion: nextPublicationVersion,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
      componentVersions,
    }

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_incident_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
