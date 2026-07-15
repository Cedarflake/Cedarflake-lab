import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  assertIncidentPhaseCommand,
  incidentPhases,
  incidentSeverities,
  type IncidentPhase,
  type IncidentSeverity,
} from "@/domain/incidents"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import { componentPublicSnapshotSchema } from "@/lib/public/snapshots"
import {
  createIncidentPublicSnapshot,
  incidentPublicSnapshotSchema,
  type IncidentPublicSnapshot,
} from "@/lib/public/incident-snapshots"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import {
  addStatusTransitionIntervalIssue,
  statusTransitionPayloadSchema,
} from "./status-transition-input"
import {
  writeStatusTransition,
  type StatusTransitionWriteResult,
} from "./status-transition-write"
import {
  withWriteTransaction,
  type StatementExecutor,
} from "./write-transaction"

const timestampSchema = z.number().int().nonnegative().safe()
const incidentTitleSchema = z.string().trim().min(1).max(120)
const incidentSummarySchema = z.string().trim().max(1_000).nullable().default(null)
const privateNoteSchema = z.string().trim().max(2_000).nullable().default(null)
const reasonSchema = z.string().trim().min(1).max(1_000)
const nonterminalIncidentPhases = [
  "investigating",
  "identified",
  "monitoring",
] as const

const componentGuardSchema = z
  .object({
    componentId: z.string().uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
  })
  .strict()

const publicComponentGuardSchema = componentGuardSchema
  .extend({
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

function uniqueComponents<T extends { componentId: string }>(
  components: readonly T[],
  context: z.RefinementCtx,
) {
  const componentIds = new Set<string>()

  for (const [index, component] of components.entries()) {
    if (componentIds.has(component.componentId)) {
      context.addIssue({
        code: "custom",
        path: [index, "componentId"],
        message: "Affected components must be unique",
      })
    }

    componentIds.add(component.componentId)
  }
}

const privateCreateIncidentSchema = z
  .object({
    idempotencyKey: z.uuid(),
    title: incidentTitleSchema,
    severity: z.enum(incidentSeverities),
    initialPhase: z.enum(nonterminalIncidentPhases),
    ownerSummary: incidentSummarySchema,
    privateNote: privateNoteSchema,
    effectiveAt: timestampSchema,
    affectedComponents: z.array(componentGuardSchema).min(1).max(100),
    publication: z.object({ mode: z.literal("private") }).strict(),
  })
  .strict()
  .superRefine((value, context) =>
    uniqueComponents(value.affectedComponents, context),
  )

const publicCreateIncidentSchema = z
  .object({
    idempotencyKey: z.uuid(),
    title: incidentTitleSchema,
    severity: z.enum(incidentSeverities),
    initialPhase: z.enum(nonterminalIncidentPhases),
    ownerSummary: incidentSummarySchema,
    privateNote: privateNoteSchema,
    effectiveAt: timestampSchema,
    affectedComponents: z.array(publicComponentGuardSchema).min(1).max(100),
    publication: z
      .object({
        mode: z.literal("public"),
        expectedPublicationVersion: z.literal(0),
        publicTitle: incidentTitleSchema,
        publicSeverity: z.enum(incidentSeverities),
        publicSummary: incidentSummarySchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) =>
    uniqueComponents(value.affectedComponents, context),
  )

export const createIncidentInputSchema = z.union([
  privateCreateIncidentSchema,
  publicCreateIncidentSchema,
])

const privatePublicationSchema = z.object({ mode: z.literal("private") }).strict()
const publicUpdatePublicationSchema = z
  .object({
    mode: z.literal("public"),
    expectedPublicationVersion: z.number().int().positive().safe(),
    publicSummary: incidentSummarySchema,
  })
  .strict()
const updatePublicationSchema = z.union([
  privatePublicationSchema,
  publicUpdatePublicationSchema,
])

const updateFields = {
  idempotencyKey: z.uuid(),
  incidentId: z.string().uuid(),
  expectedIncidentVersion: z.number().int().positive().safe(),
  ownerSummary: incidentSummarySchema,
  privateNote: privateNoteSchema,
  effectiveAt: timestampSchema,
  publication: updatePublicationSchema,
}

const appendIncidentNoteSchema = z
  .object({
    ...updateFields,
    operation: z.literal("note"),
  })
  .strict()

const appendIncidentPhaseSchema = z
  .object({
    ...updateFields,
    operation: z.literal("phase_update"),
    to: z.enum(incidentPhases),
    reason: reasonSchema,
  })
  .strict()

const unchangedComponentOutcomeSchema = componentGuardSchema
  .extend({ mode: z.literal("unchanged") })
  .strict()

const transitionComponentOutcomeSchema = componentGuardSchema
  .extend({
    mode: z.literal("transition"),
    transition: statusTransitionPayloadSchema,
  })
  .strict()

const componentOutcomeSchema = z.discriminatedUnion("mode", [
  unchangedComponentOutcomeSchema,
  transitionComponentOutcomeSchema,
])

const resolveIncidentSchema = z
  .object({
    ...updateFields,
    operation: z.literal("resolve"),
    reason: reasonSchema,
    componentOutcomes: z.array(componentOutcomeSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    uniqueComponents(value.componentOutcomes, context)

    value.componentOutcomes.forEach((outcome, index) => {
      if (outcome.mode !== "transition") return

      addStatusTransitionIntervalIssue(
        outcome.transition,
        value.effectiveAt,
        context,
        ["componentOutcomes", index, "transition"],
      )
    })
  })

const reopenIncidentSchema = z
  .object({
    ...updateFields,
    operation: z.literal("reopen"),
    reason: reasonSchema,
    affectedComponents: z.array(componentGuardSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) =>
    uniqueComponents(value.affectedComponents, context),
  )

export const appendIncidentUpdateInputSchema = z.discriminatedUnion(
  "operation",
  [
    appendIncidentNoteSchema,
    appendIncidentPhaseSchema,
    resolveIncidentSchema,
    reopenIncidentSchema,
  ],
)

const incidentMetadataFields = {
  idempotencyKey: z.uuid(),
  incidentId: z.string().uuid(),
  expectedIncidentVersion: z.number().int().positive().safe(),
  title: incidentTitleSchema,
  severity: z.enum(incidentSeverities),
  ownerSummary: incidentSummarySchema,
  privateNote: privateNoteSchema,
  effectiveAt: timestampSchema,
  currentAffectedComponents: z.array(componentGuardSchema).min(1).max(100),
}

const privateIncidentMetadataSchema = z
  .object({
    ...incidentMetadataFields,
    affectedComponents: z.array(componentGuardSchema).min(1).max(100),
    publication: privatePublicationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    uniqueComponents(value.currentAffectedComponents, context)
    uniqueComponents(value.affectedComponents, context)
  })

const publicIncidentMetadataSchema = z
  .object({
    ...incidentMetadataFields,
    affectedComponents: z.array(publicComponentGuardSchema).min(1).max(100),
    publication: z
      .object({
        mode: z.literal("public"),
        expectedPublicationVersion: z.number().int().nonnegative().safe(),
        publicTitle: incidentTitleSchema,
        publicSeverity: z.enum(incidentSeverities),
        publicSummary: incidentSummarySchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    uniqueComponents(value.currentAffectedComponents, context)
    uniqueComponents(value.affectedComponents, context)
  })

export const reviseIncidentMetadataInputSchema = z.union([
  privateIncidentMetadataSchema,
  publicIncidentMetadataSchema,
])

export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>
export type AppendIncidentUpdateInput = z.infer<
  typeof appendIncidentUpdateInputSchema
>
export type ReviseIncidentMetadataInput = z.infer<
  typeof reviseIncidentMetadataInputSchema
>

export interface CreateIncidentResult {
  incidentId: string
  incidentPublicId: string
  incidentVersion: number
  incidentUpdateId: string
  incidentPublicationVersion: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
}

export interface AppendIncidentUpdateResult {
  incidentId: string
  incidentVersion: number
  incidentUpdateId: string
  phase: IncidentPhase
  incidentPublicationVersion: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
  statusTransitions: readonly StatusTransitionWriteResult[]
}

export interface ReviseIncidentMetadataResult {
  incidentId: string
  incidentVersion: number
  incidentUpdateId: string
  incidentPublicationVersion: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
}

interface ComponentReference {
  componentId: string
  expectedComponentVersion: number
  nextComponentVersion: number
  componentPublicId: string
  componentRevisionId: string
  ownerName: string
  publicName: string | null
  componentMetadataPublicationVersion: number | null
}

interface StoredIncidentReference {
  position: number
  componentId: string
  componentVersion: number
  componentRevisionId: string
  ownerName: string
}

interface StoredPublicIncidentReference {
  position: number
  componentId: string
  publicComponentId: string
  publicName: string
  componentMetadataPublicationVersion: number
}

interface CurrentIncident {
  id: string
  publicId: string
  version: number
  updateId: string
  phase: IncidentPhase
  severity: IncidentSeverity
  title: string
}

interface IncidentPublicationState {
  version: number
  isPublished: boolean
  sourceId: string | null
  snapshot: IncidentPublicSnapshot | null
}

function parseStoredJson(value: unknown) {
  if (typeof value !== "string") {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public incident data is invalid",
    )
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public incident data is invalid",
    )
  }
}

function parseCreateResult(resultRef: string): CreateIncidentResult {
  return z
    .object({
      incidentId: z.string().uuid(),
      incidentPublicId: z.string().uuid(),
      incidentVersion: z.number().int().positive(),
      incidentUpdateId: z.string().uuid(),
      incidentPublicationVersion: z.number().int().nonnegative(),
      componentVersions: z.array(
        z
          .object({
            componentId: z.string().uuid(),
            componentVersion: z.number().int().positive(),
          })
          .strict(),
      ),
    })
    .strict()
    .parse(parseStoredJson(resultRef))
}

function parseAppendResult(resultRef: string): AppendIncidentUpdateResult {
  return z
    .object({
      incidentId: z.string().uuid(),
      incidentVersion: z.number().int().positive(),
      incidentUpdateId: z.string().uuid(),
      phase: z.enum(incidentPhases),
      incidentPublicationVersion: z.number().int().nonnegative(),
      componentVersions: z
        .array(
          z
            .object({
              componentId: z.string().uuid(),
              componentVersion: z.number().int().positive(),
            })
            .strict(),
        )
        .default([]),
      statusTransitions: z
        .array(
          z
            .object({
              componentId: z.string().uuid(),
              componentVersion: z.number().int().positive(),
              statusTransitionId: z.string().uuid(),
              statusPublicationVersion: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .default([]),
    })
    .strict()
    .parse(parseStoredJson(resultRef))
}

function parseReviseMetadataResult(
  resultRef: string,
): ReviseIncidentMetadataResult {
  return z
    .object({
      incidentId: z.string().uuid(),
      incidentVersion: z.number().int().positive(),
      incidentUpdateId: z.string().uuid(),
      incidentPublicationVersion: z.number().int().nonnegative(),
      componentVersions: z.array(
        z
          .object({
            componentId: z.string().uuid(),
            componentVersion: z.number().int().positive(),
          })
          .strict(),
      ),
    })
    .strict()
    .parse(parseStoredJson(resultRef))
}

async function readComponentReference(
  transaction: StatementExecutor,
  guard: z.infer<typeof componentGuardSchema>,
  expectedMetadataPublicationVersion: number | null,
  requireActive = true,
): Promise<ComponentReference> {
  const result = await transaction.execute({
    sql: `
      SELECT
        components.version,
        components.public_id,
        component_revisions.id AS revision_id,
        component_revisions.lifecycle,
        component_revisions.owner_name
      FROM components
      INNER JOIN component_revisions
        ON component_revisions.id = (
          SELECT latest.id
          FROM component_revisions AS latest
          WHERE latest.component_id = components.id
          ORDER BY latest.component_version DESC
          LIMIT 1
        )
      WHERE components.id = ?
      LIMIT 1
    `,
    args: [guard.componentId],
  })
  const component = result.rows[0]

  if (!component) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "An affected component does not exist",
    )
  }

  if (Number(component.version) !== guard.expectedComponentVersion) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "An affected component changed after the incident was prepared",
    )
  }

  if (requireActive && String(component.lifecycle) !== "active") {
    throw new CommandValidationError(
      "COMPONENT_ARCHIVED",
      "An archived component cannot be referenced by an incident",
    )
  }

  let publicName: string | null = null
  let publicationVersion: number | null = null

  if (expectedMetadataPublicationVersion !== null) {
    const publicationResult = await transaction.execute({
      sql: "SELECT publication_version, resulting_disposition, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [guard.componentId],
    })
    const publication = publicationResult.rows[0]

    if (!publication || String(publication.resulting_disposition) !== "published") {
      throw new CommandValidationError(
        "COMPONENT_NOT_PUBLIC",
        "A public incident can reference only public components",
      )
    }

    publicationVersion = Number(publication.publication_version)
    if (publicationVersion !== expectedMetadataPublicationVersion) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "An affected component publication changed after review",
      )
    }

    const snapshot = componentPublicSnapshotSchema.safeParse(
      parseStoredJson(publication.resulting_current_snapshot_json),
    )
    if (
      !snapshot.success ||
      snapshot.data.componentPublicId !== String(component.public_id)
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public component data is invalid",
      )
    }

    publicName = snapshot.data.name
  }

  return {
    componentId: guard.componentId,
    expectedComponentVersion: guard.expectedComponentVersion,
    nextComponentVersion: guard.expectedComponentVersion + 1,
    componentPublicId: String(component.public_id),
    componentRevisionId: String(component.revision_id),
    ownerName: String(component.owner_name),
    publicName,
    componentMetadataPublicationVersion: publicationVersion,
  }
}

async function compareAndSwapComponent(
  transaction: StatementExecutor,
  component: ComponentReference,
  recordedAt: number,
) {
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
      "An affected component changed during incident creation",
    )
  }
}

async function insertIncidentReference(
  transaction: StatementExecutor,
  incidentUpdateId: string,
  reference: StoredIncidentReference,
) {
  await transaction.execute({
    sql: "INSERT INTO incident_update_components (incident_update_id, position, component_id, component_version, component_revision_id, owner_name_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      incidentUpdateId,
      reference.position,
      reference.componentId,
      reference.componentVersion,
      reference.componentRevisionId,
      reference.ownerName,
    ],
  })
}

async function insertIncidentPublicReference(
  transaction: StatementExecutor,
  incidentUpdateId: string,
  reference: StoredPublicIncidentReference,
) {
  await transaction.execute({
    sql: "INSERT INTO incident_update_public_components (incident_update_id, position, component_id, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      incidentUpdateId,
      reference.position,
      reference.componentId,
      reference.publicComponentId,
      reference.publicName,
      reference.componentMetadataPublicationVersion,
    ],
  })
}

async function insertIncidentUpdate(
  transaction: StatementExecutor,
  input: {
    updateId: string
    incidentId: string
    incidentVersion: number
    kind: "created" | "note" | "phase" | "metadata" | "resolved" | "reopened"
    phase: IncidentPhase
    severity: IncidentSeverity
    title: string
    ownerSummary: string | null
    privateNote: string | null
    reason: string | null
    publicSnapshot: IncidentPublicSnapshot | null
    effectiveAt: number
    recordedAt: number
    ownerOrdinal: number
    publicEntryId: string
    correlationId: string
  },
) {
  await transaction.execute({
    sql: "INSERT INTO incident_updates (id, incident_id, incident_version, kind, phase, severity, title, owner_summary, private_note, reason, public_title, public_phase, public_severity, public_summary, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      input.updateId,
      input.incidentId,
      input.incidentVersion,
      input.kind,
      input.phase,
      input.severity,
      input.title,
      input.ownerSummary,
      input.privateNote,
      input.reason,
      input.publicSnapshot?.title ?? null,
      input.publicSnapshot?.phase ?? null,
      input.publicSnapshot?.severity ?? null,
      input.publicSnapshot?.summary ?? null,
      input.effectiveAt,
      input.recordedAt,
      input.ownerOrdinal,
      input.publicEntryId,
      input.correlationId,
    ],
  })
}

async function insertIncidentPublication(
  transaction: StatementExecutor,
  input: {
    publicationEventId: string
    incidentId: string
    publicationVersion: number
    updateId: string
    incidentVersion: number
    snapshot: IncidentPublicSnapshot
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
    sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'incident', ?, ?, 'publish', 'incident_update', ?, ?, ?, 'published', 'incident_update', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    args: [
      input.publicationEventId,
      input.incidentId,
      input.publicationVersion,
      input.updateId,
      input.incidentVersion,
      snapshotJson,
      input.updateId,
      input.incidentVersion,
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

async function readCurrentIncident(
  transaction: StatementExecutor,
  incidentId: string,
): Promise<CurrentIncident> {
  const result = await transaction.execute({
    sql: `
      SELECT
        incidents.id,
        incidents.public_id,
        incidents.version,
        incident_updates.id AS update_id,
        incident_updates.incident_version,
        incident_updates.phase,
        incident_updates.severity,
        incident_updates.title
      FROM incidents
      INNER JOIN incident_updates
        ON incident_updates.incident_id = incidents.id
      WHERE incidents.id = ?
      ORDER BY incident_updates.incident_version DESC
      LIMIT 1
    `,
    args: [incidentId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandNotFoundError(
      "INCIDENT_NOT_FOUND",
      "The incident does not exist",
    )
  }

  const phase = z.enum(incidentPhases).safeParse(row.phase)
  const severity = z.enum(incidentSeverities).safeParse(row.severity)
  const version = Number(row.version)

  if (
    !phase.success ||
    !severity.success ||
    Number(row.incident_version) !== version
  ) {
    throw new CommandValidationError(
      "INVALID_INCIDENT_STATE",
      "Stored incident state is invalid",
    )
  }

  return {
    id: String(row.id),
    publicId: String(row.public_id),
    version,
    updateId: String(row.update_id),
    phase: phase.data,
    severity: severity.data,
    title: String(row.title),
  }
}

async function readIncidentReferences(
  transaction: StatementExecutor,
  incidentUpdateId: string,
): Promise<StoredIncidentReference[]> {
  const result = await transaction.execute({
    sql: "SELECT position, component_id, component_version, component_revision_id, owner_name_snapshot FROM incident_update_components WHERE incident_update_id = ? ORDER BY position, component_id",
    args: [incidentUpdateId],
  })

  return result.rows.map((row) => ({
    position: Number(row.position),
    componentId: String(row.component_id),
    componentVersion: Number(row.component_version),
    componentRevisionId: String(row.component_revision_id),
    ownerName: String(row.owner_name_snapshot),
  }))
}

async function readIncidentPublicReferences(
  transaction: StatementExecutor,
  incidentUpdateId: string,
): Promise<StoredPublicIncidentReference[]> {
  const result = await transaction.execute({
    sql: "SELECT position, component_id, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version FROM incident_update_public_components WHERE incident_update_id = ? ORDER BY position, component_id",
    args: [incidentUpdateId],
  })

  return result.rows.map((row) => ({
    position: Number(row.position),
    componentId: String(row.component_id),
    publicComponentId: String(row.public_component_id_snapshot),
    publicName: String(row.public_name_snapshot),
    componentMetadataPublicationVersion: Number(
      row.component_metadata_publication_version,
    ),
  }))
}

async function readIncidentHistoricalPublicComponentIds(
  transaction: StatementExecutor,
  incidentId: string,
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
        WHERE stream_type = 'incident' AND stream_id = ?
      )
      SELECT DISTINCT public_components.component_id
      FROM ranked_source_state AS source_state
      INNER JOIN incident_update_public_components AS public_components
        ON public_components.incident_update_id = source_state.target_source_id
      WHERE source_state.source_rank = 1
        AND source_state.action IN ('publish', 'withdraw')
      ORDER BY public_components.component_id
    `,
    args: [incidentId],
  })

  return new Set(result.rows.map((row) => String(row.component_id)))
}

async function readIncidentPublicationState(
  transaction: StatementExecutor,
  incidentId: string,
): Promise<IncidentPublicationState> {
  const result = await transaction.execute({
    sql: "SELECT publication_version, resulting_disposition, resulting_source_id, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
    args: [incidentId],
  })
  const row = result.rows[0]

  if (!row) {
    return { version: 0, isPublished: false, sourceId: null, snapshot: null }
  }

  const version = Number(row.publication_version)
  const isPublished = String(row.resulting_disposition) === "published"
  if (!isPublished) {
    return { version, isPublished: false, sourceId: null, snapshot: null }
  }

  const parsed = incidentPublicSnapshotSchema.safeParse(
    parseStoredJson(row.resulting_current_snapshot_json),
  )
  if (!parsed.success || row.resulting_source_id === null) {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public incident data is invalid",
    )
  }

  return {
    version,
    isPublished: true,
    sourceId: String(row.resulting_source_id),
    snapshot: parsed.data,
  }
}

async function validateCurrentComponentGuards(
  transaction: StatementExecutor,
  references: readonly StoredIncidentReference[],
  guards: readonly z.infer<typeof componentGuardSchema>[],
) {
  const expectedIds = references.map((reference) => reference.componentId).sort()
  const submittedIds = guards.map((guard) => guard.componentId).sort()

  if (
    expectedIds.length !== submittedIds.length ||
    expectedIds.some((componentId, index) => componentId !== submittedIds[index])
  ) {
    throw new CommandValidationError(
      "INCIDENT_COMPONENT_OUTCOMES_INCOMPLETE",
      "Every affected component requires an explicit reviewed version",
    )
  }

  for (const guard of guards.toSorted((left, right) =>
    left.componentId.localeCompare(right.componentId),
  )) {
    await readComponentReference(transaction, guard, null)
  }
}

type ResolveComponentOutcome = Extract<
  AppendIncidentUpdateInput,
  { operation: "resolve" }
>["componentOutcomes"][number]

interface PreparedResolveComponentOutcome {
  outcome: ResolveComponentOutcome
  reference: StoredIncidentReference
}

async function prepareResolveComponentOutcomes(
  transaction: StatementExecutor,
  references: readonly StoredIncidentReference[],
  outcomes: readonly ResolveComponentOutcome[],
): Promise<PreparedResolveComponentOutcome[]> {
  const expectedIds = references.map((reference) => reference.componentId).sort()
  const submittedIds = outcomes.map((outcome) => outcome.componentId).sort()

  if (
    expectedIds.length !== submittedIds.length ||
    expectedIds.some((componentId, index) => componentId !== submittedIds[index])
  ) {
    throw new CommandValidationError(
      "INCIDENT_COMPONENT_OUTCOMES_INCOMPLETE",
      "Every affected component requires an explicit recovery choice",
    )
  }

  const outcomesByComponentId = new Map(
    outcomes.map((outcome) => [outcome.componentId, outcome]),
  )
  const prepared: PreparedResolveComponentOutcome[] = []

  for (const reference of references) {
    const outcome = outcomesByComponentId.get(reference.componentId)

    if (!outcome) {
      throw new CommandValidationError(
        "INCIDENT_COMPONENT_OUTCOMES_INCOMPLETE",
        "Every affected component requires an explicit recovery choice",
      )
    }

    const component = await readComponentReference(transaction, outcome, null)
    prepared.push({
      outcome,
      reference: {
        position: reference.position,
        componentId: component.componentId,
        componentVersion: component.expectedComponentVersion,
        componentRevisionId: component.componentRevisionId,
        ownerName: component.ownerName,
      },
    })
  }

  return prepared
}

async function applyResolveComponentOutcomes(
  transaction: StatementExecutor,
  prepared: readonly PreparedResolveComponentOutcome[],
  context: {
    effectiveAt: number
    recordedAt: number
    correlationId: string
  },
) {
  const references: StoredIncidentReference[] = []
  const statusTransitions: StatusTransitionWriteResult[] = []

  for (const item of prepared) {
    if (item.outcome.mode === "unchanged") {
      references.push(item.reference)
      continue
    }

    const transition = await writeStatusTransition(
      transaction,
      {
        componentId: item.outcome.componentId,
        expectedComponentVersion: item.outcome.expectedComponentVersion,
        effectiveAt: context.effectiveAt,
        ...item.outcome.transition,
      },
      {
        recordedAt: context.recordedAt,
        correlationId: context.correlationId,
      },
    )
    statusTransitions.push(transition)
    references.push({
      ...item.reference,
      componentVersion: transition.componentVersion,
    })
  }

  return {
    references,
    componentVersions: references.map((reference) => ({
      componentId: reference.componentId,
      componentVersion: reference.componentVersion,
    })),
    statusTransitions,
  }
}

function incidentKind(
  operation: AppendIncidentUpdateInput["operation"],
): "note" | "phase" | "resolved" | "reopened" {
  switch (operation) {
    case "note":
      return "note"
    case "phase_update":
      return "phase"
    case "resolve":
      return "resolved"
    case "reopen":
      return "reopened"
  }
}

function nextIncidentPhase(
  incident: CurrentIncident,
  input: AppendIncidentUpdateInput,
) {
  if (input.operation === "note") return incident.phase

  const to =
    input.operation === "phase_update"
      ? input.to
      : input.operation === "resolve"
        ? "resolved"
        : "investigating"

  assertIncidentPhaseCommand({
    from: incident.phase,
    to,
    operation: input.operation,
    reason: input.reason,
  })

  return to
}

function requirePublicComponentName(reference: ComponentReference) {
  if (reference.publicName === null) {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public component data is invalid",
    )
  }

  return reference.publicName
}

function validatePublicIncidentReferences(
  publicReferences: readonly StoredPublicIncidentReference[],
  publicSnapshot: IncidentPublicSnapshot,
) {
  if (publicReferences.length !== publicSnapshot.affectedComponents.length) {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public incident references are invalid",
    )
  }

  for (const reference of publicReferences) {
    const snapshot = publicSnapshot.affectedComponents.find(
      (component) => component.position === reference.position,
    )

    if (
      !snapshot ||
      snapshot.componentPublicId !== reference.publicComponentId ||
      snapshot.name !== reference.publicName
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public incident references are invalid",
      )
    }
  }
}

function assertReviewedReferenceSet(
  references: readonly { componentId: string }[],
  guards: readonly z.infer<typeof componentGuardSchema>[],
  code: string,
  message: string,
) {
  const referenceIds = references
    .map((reference) => reference.componentId)
    .toSorted()
  const guardIds = guards.map((guard) => guard.componentId).toSorted()

  if (
    referenceIds.length !== guardIds.length ||
    referenceIds.some((componentId, index) => componentId !== guardIds[index])
  ) {
    throw new CommandConflictError(code, message)
  }
}

function addReviewedComponentGuards(
  guardByComponentId: Map<
    string,
    z.infer<typeof componentGuardSchema>
  >,
  guards: readonly z.infer<typeof componentGuardSchema>[],
) {
  for (const guard of guards) {
    const existing = guardByComponentId.get(guard.componentId)

    if (
      existing &&
      existing.expectedComponentVersion !== guard.expectedComponentVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "The reviewed component versions do not agree",
      )
    }

    guardByComponentId.set(guard.componentId, guard)
  }
}

function changedComponentIds(
  previous: readonly { componentId: string }[],
  next: readonly { componentId: string }[],
) {
  const previousIds = new Set(
    previous.map((reference) => reference.componentId),
  )
  const nextIds = new Set(next.map((reference) => reference.componentId))
  const changed = new Set<string>()

  for (const componentId of previousIds) {
    if (!nextIds.has(componentId)) changed.add(componentId)
  }
  for (const componentId of nextIds) {
    if (!previousIds.has(componentId)) changed.add(componentId)
  }

  return changed
}

async function assertReviewedComponentVersion(
  transaction: StatementExecutor,
  guard: z.infer<typeof componentGuardSchema>,
) {
  const result = await transaction.execute({
    sql: "SELECT version FROM components WHERE id = ? LIMIT 1",
    args: [guard.componentId],
  })
  const component = result.rows[0]

  if (!component) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "An affected component does not exist",
    )
  }

  if (Number(component.version) !== guard.expectedComponentVersion) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "An affected component changed after the incident was prepared",
    )
  }
}

async function compareAndSwapReviewedComponent(
  transaction: StatementExecutor,
  guard: z.infer<typeof componentGuardSchema>,
  recordedAt: number,
) {
  const result = await transaction.execute({
    sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
    args: [
      guard.expectedComponentVersion + 1,
      recordedAt,
      guard.componentId,
      guard.expectedComponentVersion,
    ],
  })

  if (!result.rows[0]) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "An affected component changed during the incident metadata revision",
    )
  }
}

export async function createIncidentForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CreateIncidentResult> {
  const input = createIncidentInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const incidentId = randomUUID()
  const incidentPublicId = randomUUID()
  const incidentUpdateId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "create_incident",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseCreateResult(existingResultRef)

    const isPublic = input.publication.mode === "public"
    const references: ComponentReference[] = []

    for (const guard of input.affectedComponents) {
      const expectedMetadataPublicationVersion =
        "expectedComponentMetadataPublicationVersion" in guard
          ? guard.expectedComponentMetadataPublicationVersion
          : null
      references.push(
        await readComponentReference(
          transaction,
          guard,
          expectedMetadataPublicationVersion,
        ),
      )
    }

    for (const reference of references.toSorted((left, right) =>
      left.componentId.localeCompare(right.componentId),
    )) {
      await compareAndSwapComponent(transaction, reference, recordedAt)
    }

    const allocation = await allocateOrdinals(
      transaction,
      isPublic ? 2 : 1,
      isPublic ? 1 : 0,
      recordedAt,
    )
    const updateOwnerOrdinal = allocation.ownerOrdinal - (isPublic ? 1 : 0)
    const publicSnapshot =
      input.publication.mode === "public"
        ? createIncidentPublicSnapshot({
            schemaVersion: 1,
            incidentPublicId,
            publicEntryId,
            title: input.publication.publicTitle,
            phase: input.initialPhase,
            severity: input.publication.publicSeverity,
            summary: input.publication.publicSummary,
            affectedComponents: references.map((reference, position) => ({
              componentPublicId: reference.componentPublicId,
              name: requirePublicComponentName(reference),
              position,
            })),
            effectiveAt: input.effectiveAt,
          })
        : null

    await transaction.execute({
      sql: "INSERT INTO incidents (id, public_id, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      args: [incidentId, incidentPublicId, recordedAt, recordedAt],
    })
    await insertIncidentUpdate(transaction, {
      updateId: incidentUpdateId,
      incidentId,
      incidentVersion: 1,
      kind: "created",
      phase: input.initialPhase,
      severity: input.severity,
      title: input.title,
      ownerSummary: input.ownerSummary,
      privateNote: input.privateNote,
      reason: null,
      publicSnapshot,
      effectiveAt: input.effectiveAt,
      recordedAt,
      ownerOrdinal: updateOwnerOrdinal,
      publicEntryId,
      correlationId,
    })

    for (const [position, reference] of references.entries()) {
      await insertIncidentReference(transaction, incidentUpdateId, {
        position,
        componentId: reference.componentId,
        componentVersion: reference.nextComponentVersion,
        componentRevisionId: reference.componentRevisionId,
        ownerName: reference.ownerName,
      })

      if (
        isPublic &&
        reference.publicName !== null &&
        reference.componentMetadataPublicationVersion !== null
      ) {
        await insertIncidentPublicReference(transaction, incidentUpdateId, {
          position,
          componentId: reference.componentId,
          publicComponentId: reference.componentPublicId,
          publicName: reference.publicName,
          componentMetadataPublicationVersion:
            reference.componentMetadataPublicationVersion,
        })
      }
    }

    if (publicSnapshot) {
      await insertIncidentPublication(transaction, {
        publicationEventId,
        incidentId,
        publicationVersion: 1,
        updateId: incidentUpdateId,
        incidentVersion: 1,
        snapshot: publicSnapshot,
        effectiveAt: input.effectiveAt,
        recordedAt,
        ownerOrdinal: allocation.ownerOrdinal,
        publicOrdinal: allocation.publicOrdinal,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
    }

    const result: CreateIncidentResult = {
      incidentId,
      incidentPublicId,
      incidentVersion: 1,
      incidentUpdateId,
      incidentPublicationVersion: isPublic ? 1 : 0,
      componentVersions: references.map((reference) => ({
        componentId: reference.componentId,
        componentVersion: reference.nextComponentVersion,
      })),
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "create_incident",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}

export async function appendIncidentUpdateForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<AppendIncidentUpdateResult> {
  const input = appendIncidentUpdateInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const updateId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "append_incident_update",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseAppendResult(existingResultRef)

    const incident = await readCurrentIncident(transaction, input.incidentId)
    if (incident.version !== input.expectedIncidentVersion) {
      throw new CommandConflictError(
        "INCIDENT_VERSION_CONFLICT",
        "The incident changed after the update was prepared",
      )
    }

    const currentReferences = await readIncidentReferences(
      transaction,
      incident.updateId,
    )
    const publicationState = await readIncidentPublicationState(
      transaction,
      incident.id,
    )
    if (
      publicationState.snapshot &&
      publicationState.snapshot.incidentPublicId !== incident.publicId
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public incident data is invalid",
      )
    }
    const isLifecycleOperation = input.operation !== "note"

    if (
      isLifecycleOperation &&
      publicationState.isPublished &&
      input.publication.mode !== "public"
    ) {
      throw new CommandValidationError(
        "PUBLIC_INCIDENT_LIFECYCLE_REQUIRES_PUBLICATION",
        "A public incident lifecycle change must be published atomically",
      )
    }

    if (input.publication.mode === "public") {
      if (!publicationState.isPublished || !publicationState.snapshot) {
        throw new CommandValidationError(
          "INCIDENT_NOT_PUBLIC",
          "Only a currently public incident can publish an appended update",
        )
      }

      if (
        publicationState.version !== input.publication.expectedPublicationVersion
      ) {
        throw new CommandConflictError(
          "INCIDENT_PUBLICATION_VERSION_CONFLICT",
          "The public incident changed after the update was prepared",
        )
      }
    }

    const preparedResolveOutcomes =
      input.operation === "resolve"
        ? await prepareResolveComponentOutcomes(
            transaction,
            currentReferences,
            input.componentOutcomes,
          )
        : null

    if (input.operation === "reopen") {
      await validateCurrentComponentGuards(
        transaction,
        currentReferences,
        input.affectedComponents,
      )
    }

    const phase = nextIncidentPhase(incident, input)
    const isPublic = input.publication.mode === "public"
    const nextIncidentVersion = incident.version + 1
    const appliedResolveOutcomes = preparedResolveOutcomes
      ? await applyResolveComponentOutcomes(
          transaction,
          preparedResolveOutcomes,
          {
            effectiveAt: input.effectiveAt,
            recordedAt,
            correlationId,
          },
        )
      : null
    const references =
      appliedResolveOutcomes?.references ?? currentReferences
    const allocation = await allocateOrdinals(
      transaction,
      isPublic ? 2 : 1,
      isPublic ? 1 : 0,
      recordedAt,
    )
    const updateOwnerOrdinal = allocation.ownerOrdinal - (isPublic ? 1 : 0)
    const updateResult = await transaction.execute({
      sql: "UPDATE incidents SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextIncidentVersion,
        recordedAt,
        incident.id,
        incident.version,
      ],
    })
    if (!updateResult.rows[0]) {
      throw new CommandConflictError(
        "INCIDENT_VERSION_CONFLICT",
        "The incident changed during the update",
      )
    }

    const previousPublicSnapshot = publicationState.snapshot
    const publicSnapshot =
      input.publication.mode === "public" && previousPublicSnapshot
        ? createIncidentPublicSnapshot({
            ...previousPublicSnapshot,
            publicEntryId,
            phase,
            summary: input.publication.publicSummary,
            effectiveAt: input.effectiveAt,
          })
        : null

    await insertIncidentUpdate(transaction, {
      updateId,
      incidentId: incident.id,
      incidentVersion: nextIncidentVersion,
      kind: incidentKind(input.operation),
      phase,
      severity: incident.severity,
      title: incident.title,
      ownerSummary: input.ownerSummary,
      privateNote: input.privateNote,
      reason: input.operation === "note" ? null : input.reason,
      publicSnapshot,
      effectiveAt: input.effectiveAt,
      recordedAt,
      ownerOrdinal: updateOwnerOrdinal,
      publicEntryId,
      correlationId,
    })

    let publicReferences: StoredPublicIncidentReference[] = []
    if (publicSnapshot && publicationState.sourceId) {
      publicReferences = await readIncidentPublicReferences(
        transaction,
        publicationState.sourceId,
      )
      validatePublicIncidentReferences(publicReferences, publicSnapshot)
    }
    for (const reference of references) {
      await insertIncidentReference(transaction, updateId, {
        ...reference,
      })
    }

    if (publicSnapshot) {
      for (const publicReference of publicReferences) {
        await insertIncidentPublicReference(transaction, updateId, {
          ...publicReference,
        })
      }
    }

    const nextPublicationVersion = isPublic
      ? publicationState.version + 1
      : publicationState.version
    if (publicSnapshot) {
      await insertIncidentPublication(transaction, {
        publicationEventId,
        incidentId: incident.id,
        publicationVersion: nextPublicationVersion,
        updateId,
        incidentVersion: nextIncidentVersion,
        snapshot: publicSnapshot,
        effectiveAt: input.effectiveAt,
        recordedAt,
        ownerOrdinal: allocation.ownerOrdinal,
        publicOrdinal: allocation.publicOrdinal,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
    }

    const result: AppendIncidentUpdateResult = {
      incidentId: incident.id,
      incidentVersion: nextIncidentVersion,
      incidentUpdateId: updateId,
      phase,
      incidentPublicationVersion: nextPublicationVersion,
      componentVersions: appliedResolveOutcomes?.componentVersions ?? [],
      statusTransitions: appliedResolveOutcomes?.statusTransitions ?? [],
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "append_incident_update",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}

export async function reviseIncidentMetadataForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<ReviseIncidentMetadataResult> {
  const parsedInput = reviseIncidentMetadataInputSchema.parse(rawInput)
  const input = {
    ...parsedInput,
    currentAffectedComponents: parsedInput.currentAffectedComponents.toSorted(
      (left, right) => left.componentId.localeCompare(right.componentId),
    ),
  }
  const payloadHash = hashCommandPayload(input)
  const updateId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "revise_incident_metadata",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) {
      return parseReviseMetadataResult(existingResultRef)
    }

    const incident = await readCurrentIncident(transaction, input.incidentId)
    if (incident.version !== input.expectedIncidentVersion) {
      throw new CommandConflictError(
        "INCIDENT_VERSION_CONFLICT",
        "The incident changed after the metadata revision was prepared",
      )
    }

    const currentReferences = await readIncidentReferences(
      transaction,
      incident.updateId,
    )
    assertReviewedReferenceSet(
      currentReferences,
      input.currentAffectedComponents,
      "INCIDENT_REFERENCE_SET_CONFLICT",
      "The incident references changed after the metadata revision was prepared",
    )

    const publicationState = await readIncidentPublicationState(
      transaction,
      incident.id,
    )
    if (
      publicationState.snapshot &&
      publicationState.snapshot.incidentPublicId !== incident.publicId
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public incident data is invalid",
      )
    }

    if (
      input.publication.mode === "public" &&
      publicationState.version !== input.publication.expectedPublicationVersion
    ) {
      throw new CommandConflictError(
        "INCIDENT_PUBLICATION_VERSION_CONFLICT",
        "The public incident changed after the metadata revision was prepared",
      )
    }

    if (
      publicationState.isPublished &&
      publicationState.sourceId &&
      publicationState.snapshot
    ) {
      const currentPublicReferences = await readIncidentPublicReferences(
        transaction,
        publicationState.sourceId,
      )
      validatePublicIncidentReferences(
        currentPublicReferences,
        publicationState.snapshot,
      )
    }

    const reviewedGuardByComponentId = new Map<
      string,
      z.infer<typeof componentGuardSchema>
    >()
    addReviewedComponentGuards(
      reviewedGuardByComponentId,
      input.currentAffectedComponents,
    )
    addReviewedComponentGuards(
      reviewedGuardByComponentId,
      input.affectedComponents,
    )

    const ownerChangedIds = changedComponentIds(
      currentReferences,
      input.affectedComponents,
    )
    const requiresActiveOwnerReferences =
      ownerChangedIds.size > 0 || incident.severity !== input.severity
    const nextReferences: ComponentReference[] = []

    for (const guard of input.affectedComponents) {
      const expectedMetadataPublicationVersion =
        "expectedComponentMetadataPublicationVersion" in guard
          ? guard.expectedComponentMetadataPublicationVersion
          : null
      nextReferences.push(
        await readComponentReference(
          transaction,
          guard,
          expectedMetadataPublicationVersion,
          input.publication.mode === "public" ||
            requiresActiveOwnerReferences,
        ),
      )
    }

    const nextReferenceIds = new Set(
      nextReferences.map((reference) => reference.componentId),
    )
    for (const guard of reviewedGuardByComponentId.values()) {
      if (!nextReferenceIds.has(guard.componentId)) {
        await assertReviewedComponentVersion(transaction, guard)
      }
    }

    const changedIds = new Set(ownerChangedIds)
    if (input.publication.mode === "public") {
      const historicalPublicComponentIds =
        await readIncidentHistoricalPublicComponentIds(
          transaction,
          incident.id,
        )

      for (const reference of nextReferences) {
        if (!historicalPublicComponentIds.has(reference.componentId)) {
          changedIds.add(reference.componentId)
        }
      }
    }

    const isPublic = input.publication.mode === "public"
    const nextIncidentVersion = incident.version + 1
    const nextPublicationVersion = isPublic
      ? publicationState.version + 1
      : publicationState.version
    const allocation = await allocateOrdinals(
      transaction,
      isPublic ? 2 : 1,
      isPublic ? 1 : 0,
      recordedAt,
    )
    const updateOwnerOrdinal = allocation.ownerOrdinal - (isPublic ? 1 : 0)
    const incidentResult = await transaction.execute({
      sql: "UPDATE incidents SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextIncidentVersion,
        recordedAt,
        incident.id,
        incident.version,
      ],
    })
    if (!incidentResult.rows[0]) {
      throw new CommandConflictError(
        "INCIDENT_VERSION_CONFLICT",
        "The incident changed during the metadata revision",
      )
    }

    for (const componentId of [...changedIds].toSorted()) {
      const guard = reviewedGuardByComponentId.get(componentId)
      if (!guard) {
        throw new CommandValidationError(
          "INVALID_INCIDENT_REFERENCE_REVIEW",
          "The incident component review is incomplete",
        )
      }
      await compareAndSwapReviewedComponent(transaction, guard, recordedAt)
    }

    const publicSnapshot =
      input.publication.mode === "public"
        ? createIncidentPublicSnapshot({
            schemaVersion: 1,
            incidentPublicId: incident.publicId,
            publicEntryId,
            title: input.publication.publicTitle,
            phase: incident.phase,
            severity: input.publication.publicSeverity,
            summary: input.publication.publicSummary,
            affectedComponents: nextReferences.map((reference, position) => ({
              componentPublicId: reference.componentPublicId,
              name: requirePublicComponentName(reference),
              position,
            })),
            effectiveAt: input.effectiveAt,
          })
        : null

    await insertIncidentUpdate(transaction, {
      updateId,
      incidentId: incident.id,
      incidentVersion: nextIncidentVersion,
      kind: "metadata",
      phase: incident.phase,
      severity: input.severity,
      title: input.title,
      ownerSummary: input.ownerSummary,
      privateNote: input.privateNote,
      reason: null,
      publicSnapshot,
      effectiveAt: input.effectiveAt,
      recordedAt,
      ownerOrdinal: updateOwnerOrdinal,
      publicEntryId,
      correlationId,
    })

    for (const [position, reference] of nextReferences.entries()) {
      const componentVersion =
        reference.expectedComponentVersion +
        Number(changedIds.has(reference.componentId))
      await insertIncidentReference(transaction, updateId, {
        position,
        componentId: reference.componentId,
        componentVersion,
        componentRevisionId: reference.componentRevisionId,
        ownerName: reference.ownerName,
      })

      if (
        publicSnapshot &&
        reference.publicName !== null &&
        reference.componentMetadataPublicationVersion !== null
      ) {
        await insertIncidentPublicReference(transaction, updateId, {
          position,
          componentId: reference.componentId,
          publicComponentId: reference.componentPublicId,
          publicName: reference.publicName,
          componentMetadataPublicationVersion:
            reference.componentMetadataPublicationVersion,
        })
      }
    }

    if (publicSnapshot) {
      await insertIncidentPublication(transaction, {
        publicationEventId,
        incidentId: incident.id,
        publicationVersion: nextPublicationVersion,
        updateId,
        incidentVersion: nextIncidentVersion,
        snapshot: publicSnapshot,
        effectiveAt: input.effectiveAt,
        recordedAt,
        ownerOrdinal: allocation.ownerOrdinal,
        publicOrdinal: allocation.publicOrdinal,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
    }

    const componentVersions = [...reviewedGuardByComponentId.values()]
      .toSorted((left, right) =>
        left.componentId.localeCompare(right.componentId),
      )
      .map((guard) => ({
        componentId: guard.componentId,
        componentVersion:
          guard.expectedComponentVersion +
          Number(changedIds.has(guard.componentId)),
      }))
    const result: ReviseIncidentMetadataResult = {
      incidentId: incident.id,
      incidentVersion: nextIncidentVersion,
      incidentUpdateId: updateId,
      incidentPublicationVersion: nextPublicationVersion,
      componentVersions,
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "revise_incident_metadata",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
