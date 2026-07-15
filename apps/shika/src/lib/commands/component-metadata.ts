import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  assertValidStatusInterval,
  projectPublicStatus,
  statusConditions,
  type PublicDisposition,
  type PublicStatusTransitionCandidate,
} from "@/domain/status"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  componentPublicSnapshotSchema,
  createComponentPublicSnapshot,
  createStatusPublicSnapshot,
  statusPublicSnapshotSchema,
  type ComponentPublicSnapshot,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import { withWriteTransaction, type StatementExecutor } from "./write-transaction"

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().default(null)

const publicDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    summary: nullableText(280),
    sortOrder: z.number().int().nonnegative().safe(),
  })
  .strict()

const timestampSchema = z.number().int().nonnegative().safe()

const startingReportSchema = z
  .object({
    condition: z.enum(statusConditions),
    effectiveAt: timestampSchema,
    validUntil: timestampSchema.nullable().default(null),
    ownerSummary: nullableText(280),
    publicSummary: nullableText(280),
    privateNote: nullableText(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertValidStatusInterval(value.effectiveAt, value.validUntil)
    } catch {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "validUntil must be later than effectiveAt",
      })
    }
  })

const componentGuardSchema = z.object({
  componentId: z.uuid(),
  expectedComponentVersion: z.number().int().positive().safe(),
  expectedMetadataPublicationVersion: z.number().int().nonnegative().safe(),
})

export const saveComponentMetadataInputSchema = componentGuardSchema
  .extend({
    idempotencyKey: z.uuid(),
    ownerName: z.string().trim().min(1).max(80),
    ownerSummary: nullableText(280),
    ownerSortOrder: z.number().int().nonnegative().safe(),
    defaultValidityMs: z.number().int().positive().safe().nullable().default(null),
    privateNote: nullableText(2_000),
    publicDraft: publicDraftSchema.nullable().default(null),
  })
  .strict()

export const publishComponentInputSchema = componentGuardSchema
  .extend({
    idempotencyKey: z.uuid(),
    expectedStatusPublicationVersion: z.number().int().nonnegative().safe(),
    startingReport: startingReportSchema,
  })
  .strict()

export const publishComponentMetadataInputSchema = publishComponentInputSchema

export const changeComponentLifecycleInputSchema = componentGuardSchema
  .extend({
    idempotencyKey: z.uuid(),
    expectedStatusPublicationVersion: z.number().int().nonnegative().safe(),
    operation: z.enum(["archive", "unarchive"]),
  })
  .strict()

export type SaveComponentMetadataInput = z.infer<
  typeof saveComponentMetadataInputSchema
>
export type PublishComponentInput = z.infer<typeof publishComponentInputSchema>
export type PublishComponentMetadataInput = PublishComponentInput
export type ChangeComponentLifecycleInput = z.infer<
  typeof changeComponentLifecycleInputSchema
>

export interface SaveComponentMetadataResult {
  componentId: string
  componentVersion: number
  revisionId: string
  revisionVersion: number
  metadataPublicationVersion: number
}

export interface PublishComponentResult {
  componentId: string
  componentVersion: number
  revisionId: string
  revisionVersion: number
  metadataPublicationVersion: number
  statusTransitionId: string
  statusPublicationVersion: number
}

export type PublishComponentMetadataResult = PublishComponentResult

export interface ChangeComponentLifecycleResult {
  componentId: string
  componentVersion: number
  revisionId: string
  revisionVersion: number
  lifecycle: "active" | "archived"
  metadataPublicationVersion: number
  statusPublicationVersion: number
}

const storedComponentRowSchema = z
  .object({
    component_id: z.string().uuid(),
    component_public_id: z.string().uuid(),
    component_version: z.number().int().positive().safe(),
    revision_id: z.string().uuid(),
    revision_component_version: z.number().int().positive().safe(),
    lifecycle: z.enum(["active", "archived"]),
    owner_name: z.string().trim().min(1).max(80),
    owner_summary: z.string().nullable(),
    owner_sort_order: z.number().int().nonnegative().safe(),
    public_name: z.string().nullable(),
    public_summary: z.string().nullable(),
    public_sort_order: z.number().int().nonnegative().safe().nullable(),
    default_validity_ms: z.number().int().positive().safe().nullable(),
    private_note: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.revision_component_version > value.component_version) {
      context.addIssue({
        code: "custom",
        path: ["revision_component_version"],
        message: "Component revision is ahead of its aggregate",
      })
    }

    const publicIdentityIsComplete =
      (value.public_name === null &&
        value.public_summary === null &&
        value.public_sort_order === null) ||
      (value.public_name !== null && value.public_sort_order !== null)

    if (!publicIdentityIsComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_name"],
        message: "Public component identity is incomplete",
      })
    }
  })

type StoredComponent = z.infer<typeof storedComponentRowSchema>

const publicationRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    target_source_type: z.string().min(1),
    target_source_id: z.string().min(1),
    target_source_revision: z.number().int().positive().safe(),
    target_snapshot_json: z.string().nullable(),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_type: z.string().nullable(),
    resulting_source_id: z.string().nullable(),
    resulting_source_revision: z.number().int().positive().safe().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasCompletePublishedState =
      value.resulting_source_type !== null &&
      value.resulting_source_id !== null &&
      value.resulting_source_revision !== null &&
      value.resulting_current_snapshot_json !== null
    const hasEmptyClosedState =
      value.resulting_source_type === null &&
      value.resulting_source_id === null &&
      value.resulting_source_revision === null &&
      value.resulting_current_snapshot_json === null

    if (
      (value.resulting_disposition === "published" &&
        !hasCompletePublishedState) ||
      (value.resulting_disposition === "closed" && !hasEmptyClosedState)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_disposition"],
        message: "Publication projection is incomplete",
      })
    }
  })

interface PublicationState {
  version: number
  action: "publish" | "withdraw" | "redact" | "suppress" | null
  resultingDisposition: "private" | "published" | "closed"
  resultingSourceType: string | null
  resultingSourceId: string | null
  resultingSourceRevision: number | null
  resultingCurrentSnapshotJson: string | null
}

interface PublishedStatusSource {
  sourceId: string
  sourceRevision: number
  snapshot: StatusPublicSnapshot
}

const publicStatusCandidateRowSchema = z
  .object({
    id: z.string().uuid(),
    condition: z.enum(statusConditions),
    effective_at: timestampSchema,
    valid_until: timestampSchema.nullable(),
    recorded_at: timestampSchema,
    owner_ordinal: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact"]),
  })
  .strict()

function publicationActionToDisposition(
  action: "publish" | "withdraw" | "redact",
): PublicDisposition {
  switch (action) {
    case "publish":
      return "published"
    case "withdraw":
      return "withdrawn"
    case "redact":
      return "redacted"
  }
}

function invalidComponentState() {
  return new CommandValidationError(
    "INVALID_COMPONENT_STATE",
    "Stored component metadata is invalid",
  )
}

function invalidPublicSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public component data is invalid",
  )
}

function parseResult<Output>(schema: z.ZodType<Output>, resultRef: string) {
  return schema.parse(JSON.parse(resultRef) as unknown)
}

const saveResultSchema = z
  .object({
    componentId: z.string().uuid(),
    componentVersion: z.number().int().positive().safe(),
    revisionId: z.string().uuid(),
    revisionVersion: z.number().int().positive().safe(),
    metadataPublicationVersion: z.number().int().nonnegative().safe(),
  })
  .strict()

const publishResultSchema = saveResultSchema
  .extend({
    statusTransitionId: z.string().uuid(),
    statusPublicationVersion: z.number().int().positive().safe(),
  })
  .strict()

const lifecycleResultSchema = saveResultSchema
  .extend({
    lifecycle: z.enum(["active", "archived"]),
    statusPublicationVersion: z.number().int().nonnegative().safe(),
  })
  .strict()

async function readComponent(
  transaction: StatementExecutor,
  componentId: string,
): Promise<StoredComponent> {
  const result = await transaction.execute({
    sql: `
      SELECT
        components.id AS component_id,
        components.public_id AS component_public_id,
        components.version AS component_version,
        component_revisions.id AS revision_id,
        component_revisions.component_version AS revision_component_version,
        component_revisions.lifecycle,
        component_revisions.owner_name,
        component_revisions.owner_summary,
        component_revisions.owner_sort_order,
        component_revisions.public_name,
        component_revisions.public_summary,
        component_revisions.public_sort_order,
        component_revisions.default_validity_ms,
        component_revisions.private_note
      FROM components
      LEFT JOIN component_revisions
        ON component_revisions.id = (
          SELECT id
          FROM component_revisions AS latest_revision
          WHERE latest_revision.component_id = components.id
          ORDER BY latest_revision.component_version DESC, latest_revision.id DESC
          LIMIT 1
        )
      WHERE components.id = ?
      LIMIT 1
    `,
    args: [componentId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "The component does not exist",
    )
  }

  const parsed = storedComponentRowSchema.safeParse(row)
  if (!parsed.success) throw invalidComponentState()
  return parsed.data
}

async function readPublicationState(
  transaction: StatementExecutor,
  streamType: "component_metadata" | "component_status",
  componentId: string,
): Promise<PublicationState> {
  const result = await transaction.execute({
    sql: `
      SELECT
        publication_version,
        action,
        target_source_type,
        target_source_id,
        target_source_revision,
        target_snapshot_json,
        resulting_disposition,
        resulting_source_type,
        resulting_source_id,
        resulting_source_revision,
        resulting_current_snapshot_json
      FROM publication_events
      WHERE stream_type = ? AND stream_id = ?
      ORDER BY publication_version DESC, id DESC
      LIMIT 1
    `,
    args: [streamType, componentId],
  })
  const row = result.rows[0]

  if (!row) {
    return {
      version: 0,
      action: null,
      resultingDisposition: "private",
      resultingSourceType: null,
      resultingSourceId: null,
      resultingSourceRevision: null,
      resultingCurrentSnapshotJson: null,
    }
  }

  const parsed = publicationRowSchema.safeParse(row)
  if (!parsed.success) throw invalidComponentState()

  return {
    version: parsed.data.publication_version,
    action: parsed.data.action,
    resultingDisposition: parsed.data.resulting_disposition,
    resultingSourceType: parsed.data.resulting_source_type,
    resultingSourceId: parsed.data.resulting_source_id,
    resultingSourceRevision: parsed.data.resulting_source_revision,
    resultingCurrentSnapshotJson:
      parsed.data.resulting_current_snapshot_json,
  }
}

async function assertMetadataSourceCanBePublished(
  transaction: StatementExecutor,
  componentId: string,
  revisionId: string,
) {
  const result = await transaction.execute({
    sql: "SELECT action FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = ? AND target_source_id = ? ORDER BY publication_version DESC, id DESC LIMIT 1",
    args: [componentId, revisionId],
  })
  const action = result.rows[0]?.action

  if (action === "redact" || action === "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A redacted or suppressed component revision cannot be published again",
    )
  }
}

async function readPublishedStatusSources(
  transaction: StatementExecutor,
  componentId: string,
): Promise<PublishedStatusSource[]> {
  const result = await transaction.execute({
    sql: `
      WITH ranked AS (
        SELECT
          target_source_id,
          target_source_revision,
          action,
          target_snapshot_json,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS rank
        FROM publication_events
        WHERE stream_type = 'component_status' AND stream_id = ?
      )
      SELECT target_source_id, target_source_revision, target_snapshot_json
      FROM ranked
      WHERE rank = 1 AND action = 'publish'
      ORDER BY target_source_id
    `,
    args: [componentId],
  })

  return result.rows.map((row) => ({
    sourceId: z.string().uuid().parse(row.target_source_id),
    sourceRevision: z
      .number()
      .int()
      .positive()
      .safe()
      .parse(row.target_source_revision),
    snapshot: parseStoredJson(
      statusPublicSnapshotSchema,
      row.target_snapshot_json,
      invalidPublicSnapshot,
    ),
  }))
}

async function readPublicStatusCandidates(
  transaction: StatementExecutor,
  componentId: string,
): Promise<PublicStatusTransitionCandidate[]> {
  const result = await transaction.execute({
    sql: `
      WITH ranked AS (
        SELECT
          target_source_id,
          action,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS rank
        FROM publication_events
        WHERE stream_type = 'component_status' AND stream_id = ?
      )
      SELECT
        status_transitions.id,
        status_transitions.condition,
        status_transitions.effective_at,
        status_transitions.valid_until,
        status_transitions.recorded_at,
        status_transitions.owner_ordinal,
        ranked.action
      FROM ranked
      INNER JOIN status_transitions
        ON status_transitions.id = ranked.target_source_id
      WHERE ranked.rank = 1 AND ranked.action != 'suppress'
    `,
    args: [componentId],
  })

  return result.rows.map((row) => {
    const parsed = publicStatusCandidateRowSchema.safeParse(row)
    if (!parsed.success) throw invalidComponentState()

    return {
      id: parsed.data.id,
      condition: parsed.data.condition,
      effectiveAt: parsed.data.effective_at,
      validUntil: parsed.data.valid_until,
      recordedAt: parsed.data.recorded_at,
      audienceOrdinal: parsed.data.owner_ordinal,
      publicDisposition: publicationActionToDisposition(parsed.data.action),
    }
  })
}

function assertComponentVersion(
  component: StoredComponent,
  expectedVersion: number,
) {
  if (component.component_version !== expectedVersion) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "The component changed after the metadata action was prepared",
    )
  }
}

function assertPublicationVersion(
  stream: "metadata" | "status",
  actualVersion: number,
  expectedVersion: number,
) {
  if (actualVersion === expectedVersion) return

  throw new CommandConflictError(
    stream === "metadata"
      ? "COMPONENT_PUBLICATION_VERSION_CONFLICT"
      : "STATUS_PUBLICATION_VERSION_CONFLICT",
    `The component ${stream} publication changed after review`,
  )
}

async function updateComponentRoot(
  transaction: StatementExecutor,
  componentId: string,
  expectedVersion: number,
  nextVersion: number,
  recordedAt: number,
) {
  const result = await transaction.execute({
    sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
    args: [nextVersion, recordedAt, componentId, expectedVersion],
  })

  if (!result.rows[0]) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "The component changed during the metadata action",
    )
  }
}

interface RevisionValues {
  lifecycle: "active" | "archived"
  ownerName: string
  ownerSummary: string | null
  ownerSortOrder: number
  publicName: string | null
  publicSummary: string | null
  publicSortOrder: number | null
  defaultValidityMs: number | null
  privateNote: string | null
}

async function insertRevision(
  transaction: StatementExecutor,
  input: {
    revisionId: string
    componentId: string
    componentVersion: number
    values: RevisionValues
    recordedAt: number
    correlationId: string
  },
) {
  await transaction.execute({
    sql: "INSERT INTO component_revisions (id, component_id, component_version, lifecycle, owner_name, owner_summary, owner_sort_order, public_name, public_summary, public_sort_order, default_validity_ms, private_note, recorded_at, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      input.revisionId,
      input.componentId,
      input.componentVersion,
      input.values.lifecycle,
      input.values.ownerName,
      input.values.ownerSummary,
      input.values.ownerSortOrder,
      input.values.publicName,
      input.values.publicSummary,
      input.values.publicSortOrder,
      input.values.defaultValidityMs,
      input.values.privateNote,
      input.recordedAt,
      input.correlationId,
    ],
  })
}

function revisionValuesFromStored(
  component: StoredComponent,
  lifecycle: "active" | "archived",
): RevisionValues {
  return {
    lifecycle,
    ownerName: component.owner_name,
    ownerSummary: component.owner_summary,
    ownerSortOrder: component.owner_sort_order,
    publicName: component.public_name,
    publicSummary: component.public_summary,
    publicSortOrder: component.public_sort_order,
    defaultValidityMs: component.default_validity_ms,
    privateNote: component.private_note,
  }
}

async function hasActiveDependency(
  transaction: StatementExecutor,
  componentId: string,
) {
  const result = await transaction.execute({
    sql: `
      SELECT 1 AS dependency
      FROM incidents
      INNER JOIN incident_updates
        ON incident_updates.incident_id = incidents.id
        AND incident_updates.incident_version = incidents.version
      INNER JOIN incident_update_components
        ON incident_update_components.incident_update_id = incident_updates.id
      WHERE incident_update_components.component_id = ?
        AND incident_updates.phase != 'resolved'
      UNION ALL
      SELECT 1 AS dependency
      FROM maintenance_windows
      INNER JOIN maintenance_events
        ON maintenance_events.maintenance_window_id = maintenance_windows.id
        AND maintenance_events.maintenance_version = maintenance_windows.version
      INNER JOIN maintenance_event_components
        ON maintenance_event_components.maintenance_event_id = maintenance_events.id
      WHERE maintenance_event_components.component_id = ?
        AND maintenance_events.phase IN ('scheduled', 'in_progress')
      LIMIT 1
    `,
    args: [componentId, componentId],
  })

  return result.rows.length > 0
}

async function insertMetadataPublication(
  transaction: StatementExecutor,
  input: {
    eventId: string
    componentId: string
    publicationVersion: number
    action: "publish" | "withdraw"
    sourceId: string
    sourceRevision: number
    snapshot: ComponentPublicSnapshot
    resultingDisposition: "published" | "closed"
    recordedAt: number
    ownerOrdinal: number
    publicOrdinal: number
    publicPrivacyEpoch: number
    correlationId: string
  },
) {
  const snapshotJson = JSON.stringify(input.snapshot)
  const isPublished = input.resultingDisposition === "published"

  await transaction.execute({
    sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_metadata', ?, ?, ?, 'component_revision', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    args: [
      input.eventId,
      input.componentId,
      input.publicationVersion,
      input.action,
      input.sourceId,
      input.sourceRevision,
      snapshotJson,
      input.resultingDisposition,
      isPublished ? "component_revision" : null,
      isPublished ? input.sourceId : null,
      isPublished ? input.sourceRevision : null,
      isPublished ? snapshotJson : null,
      input.recordedAt,
      input.ownerOrdinal,
      input.publicOrdinal,
      input.publicPrivacyEpoch,
      input.correlationId,
    ],
  })
}

async function insertStatusWithdrawal(
  transaction: StatementExecutor,
  input: {
    eventId: string
    componentId: string
    publicationVersion: number
    source: PublishedStatusSource
    recordedAt: number
    ownerOrdinal: number
    publicOrdinal: number
    publicPrivacyEpoch: number
    correlationId: string
  },
) {
  await transaction.execute({
    sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, ?, 'withdraw', 'status_transition', ?, ?, ?, 'closed', 1, ?, ?, ?, ?, ?)",
    args: [
      input.eventId,
      input.componentId,
      input.publicationVersion,
      input.source.sourceId,
      input.source.sourceRevision,
      JSON.stringify(input.source.snapshot),
      input.recordedAt,
      input.ownerOrdinal,
      input.publicOrdinal,
      input.publicPrivacyEpoch,
      input.correlationId,
    ],
  })
}

async function insertStartingStatusPublication(
  transaction: StatementExecutor,
  input: {
    eventId: string
    componentId: string
    publicationVersion: number
    transitionId: string
    sourceRevision: number
    snapshot: StatusPublicSnapshot
    effectiveAt: number
    recordedAt: number
    ownerOrdinal: number
    publicOrdinal: number
    publicPrivacyEpoch: number
    correlationId: string
  },
) {
  const snapshotJson = JSON.stringify(input.snapshot)

  await transaction.execute({
    sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, ?, 'publish', 'status_transition', ?, ?, ?, 'published', 'status_transition', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    args: [
      input.eventId,
      input.componentId,
      input.publicationVersion,
      input.transitionId,
      input.sourceRevision,
      snapshotJson,
      input.transitionId,
      input.sourceRevision,
      snapshotJson,
      input.snapshot.publicEntryId,
      input.effectiveAt,
      input.recordedAt,
      snapshotJson,
      input.recordedAt,
      input.ownerOrdinal,
      input.publicOrdinal,
      input.publicPrivacyEpoch,
      input.correlationId,
    ],
  })
}

export async function saveComponentMetadataForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<SaveComponentMetadataResult> {
  const input = saveComponentMetadataInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const revisionId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "save_component_metadata",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseResult(saveResultSchema, existingResultRef)

    const component = await readComponent(transaction, input.componentId)
    const metadataPublication = await readPublicationState(
      transaction,
      "component_metadata",
      input.componentId,
    )
    assertComponentVersion(component, input.expectedComponentVersion)
    assertPublicationVersion(
      "metadata",
      metadataPublication.version,
      input.expectedMetadataPublicationVersion,
    )

    const nextVersion = input.expectedComponentVersion + 1
    await updateComponentRoot(
      transaction,
      input.componentId,
      input.expectedComponentVersion,
      nextVersion,
      recordedAt,
    )
    await insertRevision(transaction, {
      revisionId,
      componentId: input.componentId,
      componentVersion: nextVersion,
      values: {
        lifecycle: component.lifecycle,
        ownerName: input.ownerName,
        ownerSummary: input.ownerSummary,
        ownerSortOrder: input.ownerSortOrder,
        publicName: input.publicDraft?.name ?? null,
        publicSummary: input.publicDraft?.summary ?? null,
        publicSortOrder: input.publicDraft?.sortOrder ?? null,
        defaultValidityMs: input.defaultValidityMs,
        privateNote: input.privateNote,
      },
      recordedAt,
      correlationId,
    })

    const result: SaveComponentMetadataResult = {
      componentId: input.componentId,
      componentVersion: nextVersion,
      revisionId,
      revisionVersion: nextVersion,
      metadataPublicationVersion: metadataPublication.version,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "save_component_metadata",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
    })

    return result
  })
}

export async function publishComponentForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<PublishComponentResult> {
  const input = publishComponentInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const metadataPublicationEventId = randomUUID()
  const statusTransitionId = randomUUID()
  const statusPublicEntryId = randomUUID()
  const statusPublicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_component",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) {
      return parseResult(publishResultSchema, existingResultRef)
    }

    if (
      input.startingReport.effectiveAt > recordedAt ||
      (input.startingReport.validUntil !== null &&
        input.startingReport.validUntil <= recordedAt)
    ) {
      throw new CommandValidationError(
        "PUBLIC_STARTING_STATUS_NOT_CURRENT",
        "A public component requires a starting status that is current now",
      )
    }

    const component = await readComponent(transaction, input.componentId)
    const metadataPublication = await readPublicationState(
      transaction,
      "component_metadata",
      input.componentId,
    )
    const statusPublication = await readPublicationState(
      transaction,
      "component_status",
      input.componentId,
    )
    assertComponentVersion(component, input.expectedComponentVersion)
    assertPublicationVersion(
      "metadata",
      metadataPublication.version,
      input.expectedMetadataPublicationVersion,
    )
    assertPublicationVersion(
      "status",
      statusPublication.version,
      input.expectedStatusPublicationVersion,
    )

    if (component.lifecycle !== "active") {
      throw new CommandValidationError(
        "COMPONENT_ARCHIVED",
        "An archived component cannot be published",
      )
    }
    if (component.public_name === null || component.public_sort_order === null) {
      throw new CommandValidationError(
        "PUBLIC_METADATA_REQUIRED",
        "A public metadata draft is required before publication",
      )
    }
    if (
      metadataPublication.resultingDisposition === "published" &&
      metadataPublication.resultingSourceId === component.revision_id
    ) {
      throw new CommandValidationError(
        "PUBLICATION_UNCHANGED",
        "This component revision is already public",
      )
    }
    await assertMetadataSourceCanBePublished(
      transaction,
      input.componentId,
      component.revision_id,
    )

    const componentSnapshot = createComponentPublicSnapshot({
      schemaVersion: 1,
      componentPublicId: component.component_public_id,
      name: component.public_name,
      summary: component.public_summary,
      sortOrder: component.public_sort_order,
    })
    const statusSnapshot = createStatusPublicSnapshot({
      schemaVersion: 1,
      publicEntryId: statusPublicEntryId,
      componentPublicId: component.component_public_id,
      componentName: component.public_name,
      condition: input.startingReport.condition,
      summary: input.startingReport.publicSummary,
      effectiveAt: input.startingReport.effectiveAt,
      validUntil: input.startingReport.validUntil,
    })
    const priorStatusCandidates = await readPublicStatusCandidates(
      transaction,
      input.componentId,
    )
    const allocation = await allocateOrdinals(transaction, 3, 2, recordedAt)
    const statusOwnerOrdinal = allocation.ownerOrdinal - 2
    const metadataOwnerOrdinal = allocation.ownerOrdinal - 1
    const metadataPublicOrdinal = allocation.publicOrdinal - 1
    const nextComponentVersion = input.expectedComponentVersion + 1
    const nextMetadataPublicationVersion = metadataPublication.version + 1
    const nextStatusPublicationVersion = statusPublication.version + 1
    const projection = projectPublicStatus(
      [
        ...priorStatusCandidates,
        {
          id: statusTransitionId,
          condition: input.startingReport.condition,
          effectiveAt: input.startingReport.effectiveAt,
          validUntil: input.startingReport.validUntil,
          recordedAt,
          audienceOrdinal: statusOwnerOrdinal,
          publicDisposition: "published",
        },
      ],
      recordedAt,
    )

    if (
      projection.condition === "unknown" ||
      projection.selectedTransitionId !== statusTransitionId
    ) {
      throw new CommandValidationError(
        "PUBLIC_STARTING_STATUS_NOT_AUTHORITATIVE",
        "The starting status must become the current public status",
      )
    }

    await updateComponentRoot(
      transaction,
      input.componentId,
      input.expectedComponentVersion,
      nextComponentVersion,
      recordedAt,
    )
    await transaction.execute({
      sql: "INSERT INTO status_transitions (id, component_id, component_version, condition, owner_summary, public_summary, private_note, effective_at, valid_until, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        statusTransitionId,
        input.componentId,
        nextComponentVersion,
        input.startingReport.condition,
        input.startingReport.ownerSummary,
        input.startingReport.publicSummary,
        input.startingReport.privateNote,
        input.startingReport.effectiveAt,
        input.startingReport.validUntil,
        recordedAt,
        statusOwnerOrdinal,
        statusPublicEntryId,
        correlationId,
      ],
    })
    await insertMetadataPublication(transaction, {
      eventId: metadataPublicationEventId,
      componentId: input.componentId,
      publicationVersion: nextMetadataPublicationVersion,
      action: "publish",
      sourceId: component.revision_id,
      sourceRevision: component.revision_component_version,
      snapshot: componentSnapshot,
      resultingDisposition: "published",
      recordedAt,
      ownerOrdinal: metadataOwnerOrdinal,
      publicOrdinal: metadataPublicOrdinal,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
      correlationId,
    })
    await insertStartingStatusPublication(transaction, {
      eventId: statusPublicationEventId,
      componentId: input.componentId,
      publicationVersion: nextStatusPublicationVersion,
      transitionId: statusTransitionId,
      sourceRevision: nextComponentVersion,
      snapshot: statusSnapshot,
      effectiveAt: input.startingReport.effectiveAt,
      recordedAt,
      ownerOrdinal: allocation.ownerOrdinal,
      publicOrdinal: allocation.publicOrdinal,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
      correlationId,
    })

    const result: PublishComponentResult = {
      componentId: input.componentId,
      componentVersion: nextComponentVersion,
      revisionId: component.revision_id,
      revisionVersion: component.revision_component_version,
      metadataPublicationVersion: nextMetadataPublicationVersion,
      statusTransitionId,
      statusPublicationVersion: nextStatusPublicationVersion,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_component",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
    })

    return result
  })
}

export const publishComponentMetadataForOwner = publishComponentForOwner

export async function changeComponentLifecycleForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<ChangeComponentLifecycleResult> {
  const input = changeComponentLifecycleInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const revisionId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "change_component_lifecycle",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) {
      return parseResult(lifecycleResultSchema, existingResultRef)
    }

    const component = await readComponent(transaction, input.componentId)
    const metadataPublication = await readPublicationState(
      transaction,
      "component_metadata",
      input.componentId,
    )
    const statusPublication = await readPublicationState(
      transaction,
      "component_status",
      input.componentId,
    )
    assertComponentVersion(component, input.expectedComponentVersion)
    assertPublicationVersion(
      "metadata",
      metadataPublication.version,
      input.expectedMetadataPublicationVersion,
    )
    assertPublicationVersion(
      "status",
      statusPublication.version,
      input.expectedStatusPublicationVersion,
    )

    const nextLifecycle =
      input.operation === "archive" ? "archived" : "active"
    if (component.lifecycle === nextLifecycle) {
      throw new CommandValidationError(
        "COMPONENT_LIFECYCLE_UNCHANGED",
        `The component is already ${nextLifecycle}`,
      )
    }

    const publishedStatusSources =
      input.operation === "archive"
        ? await readPublishedStatusSources(transaction, input.componentId)
        : []
    if (
      input.operation === "archive" &&
      (await hasActiveDependency(transaction, input.componentId))
    ) {
      throw new CommandValidationError(
        "COMPONENT_HAS_ACTIVE_DEPENDENCIES",
        "Resolve incidents and complete or cancel maintenance before archiving this component",
      )
    }

    let metadataSnapshot: ComponentPublicSnapshot | null = null
    if (metadataPublication.resultingDisposition === "published") {
      if (
        metadataPublication.resultingSourceType !== "component_revision" ||
        metadataPublication.resultingSourceId === null ||
        metadataPublication.resultingSourceRevision === null
      ) {
        throw invalidComponentState()
      }
      metadataSnapshot = parseStoredJson(
        componentPublicSnapshotSchema,
        metadataPublication.resultingCurrentSnapshotJson,
        invalidPublicSnapshot,
      )
    }

    const nextVersion = input.expectedComponentVersion + 1
    await updateComponentRoot(
      transaction,
      input.componentId,
      input.expectedComponentVersion,
      nextVersion,
      recordedAt,
    )
    await insertRevision(transaction, {
      revisionId,
      componentId: input.componentId,
      componentVersion: nextVersion,
      values: revisionValuesFromStored(component, nextLifecycle),
      recordedAt,
      correlationId,
    })

    const publicationCount =
      input.operation === "archive"
        ? (metadataSnapshot === null ? 0 : 1) + publishedStatusSources.length
        : 0
    const allocation =
      publicationCount > 0
        ? await allocateOrdinals(
            transaction,
            publicationCount,
            publicationCount,
            recordedAt,
          )
        : { ownerOrdinal: 0, publicOrdinal: 0, publicPrivacyEpoch: 0 }
    const firstOwnerOrdinal = allocation.ownerOrdinal - publicationCount + 1
    const firstPublicOrdinal = allocation.publicOrdinal - publicationCount + 1
    let nextMetadataPublicationVersion = metadataPublication.version
    let nextStatusPublicationVersion = statusPublication.version
    let publicationIndex = 0

    if (
      metadataSnapshot &&
      metadataPublication.resultingSourceId &&
      metadataPublication.resultingSourceRevision
    ) {
      nextMetadataPublicationVersion += 1
      await insertMetadataPublication(transaction, {
        eventId: randomUUID(),
        componentId: input.componentId,
        publicationVersion: nextMetadataPublicationVersion,
        action: "withdraw",
        sourceId: metadataPublication.resultingSourceId,
        sourceRevision: metadataPublication.resultingSourceRevision,
        snapshot: metadataSnapshot,
        resultingDisposition: "closed",
        recordedAt,
        ownerOrdinal: firstOwnerOrdinal + publicationIndex,
        publicOrdinal: firstPublicOrdinal + publicationIndex,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
      publicationIndex += 1
    }

    for (const source of publishedStatusSources) {
      nextStatusPublicationVersion += 1
      await insertStatusWithdrawal(transaction, {
        eventId: randomUUID(),
        componentId: input.componentId,
        publicationVersion: nextStatusPublicationVersion,
        source,
        recordedAt,
        ownerOrdinal: firstOwnerOrdinal + publicationIndex,
        publicOrdinal: firstPublicOrdinal + publicationIndex,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
      publicationIndex += 1
    }

    const result: ChangeComponentLifecycleResult = {
      componentId: input.componentId,
      componentVersion: nextVersion,
      revisionId,
      revisionVersion: nextVersion,
      lifecycle: nextLifecycle,
      metadataPublicationVersion: nextMetadataPublicationVersion,
      statusPublicationVersion: nextStatusPublicationVersion,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "change_component_lifecycle",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
    })

    return result
  })
}
