import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  assertMaintenanceWindow,
  maintenancePhases,
  nextMaintenancePhase,
  type MaintenancePhase,
} from "@/domain/maintenance"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  createMaintenancePublicSnapshot,
  maintenancePublicSnapshotSchema,
  type MaintenancePublicKind,
  type MaintenancePublicSnapshot,
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
const timezoneSchema = z.string().trim().min(1).max(80)
const titleSchema = z.string().trim().min(1).max(120)
const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)

const privateComponentReferenceSchema = z
  .object({
    componentId: z.string().uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
  })
  .strict()

const publicComponentReferenceSchema = privateComponentReferenceSchema
  .extend({
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

const scheduleBaseSchema = z.object({
  idempotencyKey: z.string().uuid(),
  title: titleSchema,
  ownerSummary: nullableText(280),
  privateNote: nullableText(2_000),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  timezone: timezoneSchema,
  effectiveAt: timestampSchema,
})

const privateScheduleSchema = scheduleBaseSchema
  .extend({
    publication: z.object({ mode: z.literal("private") }).strict(),
    affectedComponents: z
      .array(privateComponentReferenceSchema)
      .min(1)
      .max(50),
  })
  .strict()

const publicScheduleSchema = scheduleBaseSchema
  .extend({
    publication: z
      .object({
        mode: z.literal("public"),
        expectedMaintenancePublicationVersion: z.literal(0),
        title: titleSchema,
        summary: nullableText(280),
        startsAt: timestampSchema,
        endsAt: timestampSchema,
        timezone: timezoneSchema,
      })
      .strict(),
    affectedComponents: z
      .array(publicComponentReferenceSchema)
      .min(1)
      .max(50),
  })
  .strict()

function addDuplicateComponentIssues(
  components: readonly { componentId: string }[],
  context: z.RefinementCtx,
) {
  const ids = new Set<string>()

  components.forEach((component, index) => {
    if (ids.has(component.componentId)) {
      context.addIssue({
        code: "custom",
        path: ["affectedComponents", index, "componentId"],
        message: "Affected components must be unique",
      })
    }

    ids.add(component.componentId)
  })
}

const scheduleMaintenanceUnionSchema = z.union([
  privateScheduleSchema,
  publicScheduleSchema,
])

export const scheduleMaintenanceInputSchema =
  scheduleMaintenanceUnionSchema.superRefine((input, context) => {
    try {
      assertMaintenanceWindow(input.startsAt, input.endsAt)
    } catch {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be later than startsAt",
      })
    }

    if (input.publication.mode === "public") {
      try {
        assertMaintenanceWindow(
          input.publication.startsAt,
          input.publication.endsAt,
        )
      } catch {
        context.addIssue({
          code: "custom",
          path: ["publication", "endsAt"],
          message: "Public endsAt must be later than public startsAt",
        })
      }
    }

    addDuplicateComponentIssues(input.affectedComponents, context)
  })

export type ScheduleMaintenanceInput = z.infer<
  typeof scheduleMaintenanceInputSchema
>

const unchangedAppendComponentReferenceSchema = z
  .object({
    componentId: z.string().uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable()
      .default(null),
    outcome: z.literal("unchanged"),
  })
  .strict()

const transitionAppendComponentReferenceSchema = z
  .object({
    componentId: z.string().uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable()
      .default(null),
    outcome: z.literal("transition"),
    transition: statusTransitionPayloadSchema,
  })
  .strict()

const appendComponentReferenceSchema = z.discriminatedUnion("outcome", [
  unchangedAppendComponentReferenceSchema,
  transitionAppendComponentReferenceSchema,
])

const privateAppendPublicationSchema = z
  .object({ mode: z.literal("private") })
  .strict()

const publicAppendPublicationSchema = z
  .object({
    mode: z.literal("public"),
    expectedMaintenancePublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
    summary: nullableText(280),
  })
  .strict()

const publicReschedulePublicationSchema = publicAppendPublicationSchema
  .extend({
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    timezone: timezoneSchema,
  })
  .strict()

const appendBaseSchema = z.object({
  idempotencyKey: z.string().uuid(),
  maintenanceWindowId: z.string().uuid(),
  expectedMaintenanceVersion: z.number().int().positive().safe(),
  effectiveAt: timestampSchema,
  ownerSummary: nullableText(280),
  privateNote: nullableText(2_000),
  affectedComponents: z
    .array(appendComponentReferenceSchema)
    .min(1)
    .max(50),
})

const rescheduleMaintenanceSchema = appendBaseSchema
  .extend({
    operation: z.literal("reschedule"),
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    timezone: timezoneSchema,
    publication: z.union([
      privateAppendPublicationSchema,
      publicReschedulePublicationSchema,
    ]),
  })
  .strict()

const startMaintenanceSchema = appendBaseSchema
  .extend({
    operation: z.literal("start"),
    publication: z.union([
      privateAppendPublicationSchema,
      publicAppendPublicationSchema,
    ]),
  })
  .strict()

const completeMaintenanceSchema = appendBaseSchema
  .extend({
    operation: z.literal("complete"),
    publication: z.union([
      privateAppendPublicationSchema,
      publicAppendPublicationSchema,
    ]),
  })
  .strict()

const cancelMaintenanceSchema = appendBaseSchema
  .extend({
    operation: z.literal("cancel"),
    publication: z.union([
      privateAppendPublicationSchema,
      publicAppendPublicationSchema,
    ]),
  })
  .strict()

const noteMaintenanceSchema = appendBaseSchema
  .extend({
    operation: z.literal("note"),
    publication: z.union([
      privateAppendPublicationSchema,
      publicAppendPublicationSchema,
    ]),
  })
  .strict()

export const appendMaintenanceEventInputSchema = z
  .discriminatedUnion("operation", [
    rescheduleMaintenanceSchema,
    startMaintenanceSchema,
    completeMaintenanceSchema,
    cancelMaintenanceSchema,
    noteMaintenanceSchema,
  ])
  .superRefine((input, context) => {
    addDuplicateComponentIssues(input.affectedComponents, context)

    const isPublic = input.publication.mode === "public"

    input.affectedComponents.forEach((component, index) => {
      const metadataVersion =
        component.expectedComponentMetadataPublicationVersion

      if (isPublic && metadataVersion === null) {
        context.addIssue({
          code: "custom",
          path: [
            "affectedComponents",
            index,
            "expectedComponentMetadataPublicationVersion",
          ],
          message: "Public operations require the reviewed component publication version",
        })
      }

      if (!isPublic && metadataVersion !== null) {
        context.addIssue({
          code: "custom",
          path: [
            "affectedComponents",
            index,
            "expectedComponentMetadataPublicationVersion",
          ],
          message: "Private operations must not carry public component state",
        })
      }

      if (
        component.outcome === "transition" &&
        input.operation !== "start" &&
        input.operation !== "complete"
      ) {
        context.addIssue({
          code: "custom",
          path: ["affectedComponents", index, "outcome"],
          message: "Only start and complete operations may change component status",
        })
      }

      if (component.outcome === "transition") {
        addStatusTransitionIntervalIssue(
          component.transition,
          input.effectiveAt,
          context,
          ["affectedComponents", index, "transition"],
        )
      }
    })

    if (input.operation === "reschedule") {
      try {
        assertMaintenanceWindow(input.startsAt, input.endsAt)
      } catch {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "endsAt must be later than startsAt",
        })
      }

      if (input.publication.mode === "public") {
        try {
          assertMaintenanceWindow(
            input.publication.startsAt,
            input.publication.endsAt,
          )
        } catch {
          context.addIssue({
            code: "custom",
            path: ["publication", "endsAt"],
            message: "Public endsAt must be later than public startsAt",
          })
        }
      }
    }
  })

export type AppendMaintenanceEventInput = z.infer<
  typeof appendMaintenanceEventInputSchema
>

export interface MaintenanceCommandResult {
  maintenanceWindowId: string
  maintenancePublicId: string
  maintenanceEventId: string
  maintenanceVersion: number
  maintenancePublicationVersion: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
  statusTransitions: readonly StatusTransitionWriteResult[]
}

interface ComponentRequirement {
  componentId: string
  expectedComponentVersion: number
  expectedComponentMetadataPublicationVersion: number | null
}

interface ComponentRecord extends ComponentRequirement {
  componentPublicId: string
  componentRevisionId: string
  ownerName: string
  referenceVersion: number
  publicSnapshot: ComponentPublicSnapshot | null
}

interface CurrentMaintenance {
  maintenanceWindowId: string
  maintenancePublicId: string
  maintenanceVersion: number
  eventId: string
  phase: MaintenancePhase
  title: string
  startsAt: number
  endsAt: number
  timezone: string
  componentIds: readonly string[]
}

interface MaintenancePublicationHead {
  publicationVersion: number
  isPublished: boolean
  snapshot: MaintenancePublicSnapshot | null
}

const resultSchema = z
  .object({
    maintenanceWindowId: z.string().uuid(),
    maintenancePublicId: z.string().uuid(),
    maintenanceEventId: z.string().uuid(),
    maintenanceVersion: z.number().int().positive(),
    maintenancePublicationVersion: z.number().int().nonnegative(),
    componentVersions: z.array(
      z
        .object({
          componentId: z.string().uuid(),
          componentVersion: z.number().int().positive(),
        })
        .strict(),
    ),
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

function parseReceiptResult(resultRef: string): MaintenanceCommandResult {
  try {
    return resultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored maintenance command receipt is invalid",
    )
  }
}

function parseJson(value: unknown) {
  if (typeof value !== "string") {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public snapshot is invalid",
    )
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new CommandValidationError(
      "INVALID_PUBLIC_SNAPSHOT",
      "Stored public snapshot is invalid",
    )
  }
}

async function readComponents(
  transaction: StatementExecutor,
  requirements: readonly ComponentRequirement[],
  requirePublic: boolean,
): Promise<ComponentRecord[]> {
  const placeholders = requirements.map(() => "?").join(", ")
  const result = await transaction.execute({
    sql: `
      WITH ranked_revisions AS (
        SELECT
          id,
          component_id,
          component_version,
          lifecycle,
          owner_name,
          row_number() OVER (
            PARTITION BY component_id
            ORDER BY component_version DESC
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
            ORDER BY publication_version DESC
          ) AS rank
        FROM publication_events
        WHERE stream_type = 'component_metadata'
      )
      SELECT
        components.id,
        components.public_id,
        components.version,
        ranked_revisions.id AS revision_id,
        ranked_revisions.lifecycle,
        ranked_revisions.owner_name,
        ranked_publications.publication_version,
        ranked_publications.resulting_disposition,
        ranked_publications.resulting_current_snapshot_json
      FROM components
      LEFT JOIN ranked_revisions
        ON ranked_revisions.component_id = components.id
        AND ranked_revisions.rank = 1
      LEFT JOIN ranked_publications
        ON ranked_publications.stream_id = components.id
        AND ranked_publications.rank = 1
      WHERE components.id IN (${placeholders})
    `,
    args: requirements.map((requirement) => requirement.componentId),
  })
  const rowsById = new Map(result.rows.map((row) => [String(row.id), row]))

  return requirements.map((requirement) => {
    const row = rowsById.get(requirement.componentId)

    if (!row) {
      throw new CommandNotFoundError(
        "COMPONENT_NOT_FOUND",
        "An affected component does not exist",
      )
    }

    if (
      row.revision_id === null ||
      row.revision_id === undefined ||
      row.owner_name === null ||
      row.owner_name === undefined
    ) {
      throw new CommandValidationError(
        "INVALID_COMPONENT_STATE",
        "An affected component has no current revision",
      )
    }

    if (String(row.lifecycle) !== "active") {
      throw new CommandValidationError(
        "COMPONENT_ARCHIVED",
        "Archived components cannot be referenced by maintenance",
      )
    }

    if (Number(row.version) !== requirement.expectedComponentVersion) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed after maintenance was reviewed",
      )
    }

    let publicSnapshot: ComponentPublicSnapshot | null = null

    if (requirePublic) {
      if (String(row.resulting_disposition) !== "published") {
        throw new CommandValidationError(
          "COMPONENT_NOT_PUBLIC",
          "Public maintenance can reference only public components",
        )
      }

      if (
        Number(row.publication_version) !==
        requirement.expectedComponentMetadataPublicationVersion
      ) {
        throw new CommandConflictError(
          "COMPONENT_PUBLICATION_VERSION_CONFLICT",
          "An affected component publication changed after maintenance was reviewed",
        )
      }

      const parsed = componentPublicSnapshotSchema.safeParse(
        parseJson(row.resulting_current_snapshot_json),
      )

      if (
        !parsed.success ||
        parsed.data.componentPublicId !== String(row.public_id)
      ) {
        throw new CommandValidationError(
          "INVALID_PUBLIC_SNAPSHOT",
          "Stored public component snapshot is invalid",
        )
      }

      publicSnapshot = parsed.data
    }

    return {
      ...requirement,
      componentPublicId: String(row.public_id),
      componentRevisionId: String(row.revision_id),
      ownerName: String(row.owner_name),
      referenceVersion: requirement.expectedComponentVersion,
      publicSnapshot,
    }
  })
}

async function incrementPublicDependencyVersions(
  transaction: StatementExecutor,
  components: readonly ComponentRecord[],
  recordedAt: number,
) {
  const updated: ComponentRecord[] = []

  for (const component of components) {
    const nextVersion = component.expectedComponentVersion + 1
    const result = await transaction.execute({
      sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextVersion,
        recordedAt,
        component.componentId,
        component.expectedComponentVersion,
      ],
    })

    if (!result.rows[0]) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed while maintenance was being scheduled",
      )
    }

    updated.push({ ...component, referenceVersion: nextVersion })
  }

  return updated
}

async function insertComponentSnapshots(
  transaction: StatementExecutor,
  maintenanceEventId: string,
  components: readonly ComponentRecord[],
  isPublic: boolean,
) {
  for (const [position, component] of components.entries()) {
    const publicSnapshot = isPublic ? component.publicSnapshot : null

    if (isPublic && !publicSnapshot) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "A public maintenance component snapshot is missing",
      )
    }

    await transaction.execute({
      sql: "INSERT INTO maintenance_event_components (maintenance_event_id, position, component_id, component_version, component_revision_id, owner_name_snapshot, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        maintenanceEventId,
        position,
        component.componentId,
        component.referenceVersion,
        component.componentRevisionId,
        component.ownerName,
        publicSnapshot?.componentPublicId ?? null,
        publicSnapshot?.name ?? null,
        isPublic
          ? component.expectedComponentMetadataPublicationVersion
          : null,
      ],
    })
  }
}

function publicAffectedComponents(components: readonly ComponentRecord[]) {
  return components.map((component) => {
    if (!component.publicSnapshot) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "A public maintenance component snapshot is missing",
      )
    }

    return {
      componentPublicId: component.publicSnapshot.componentPublicId,
      name: component.publicSnapshot.name,
    }
  })
}

async function insertPublicationEvent(
  transaction: StatementExecutor,
  input: {
    id: string
    maintenanceWindowId: string
    maintenanceEventId: string
    maintenanceVersion: number
    publicationVersion: number
    snapshot: MaintenancePublicSnapshot
    recordedAt: number
    ownerOrdinal: number
    publicOrdinal: number
    publicPrivacyEpoch: number
    correlationId: string
  },
) {
  const snapshotJson = JSON.stringify(input.snapshot)

  await transaction.execute({
    sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'maintenance', ?, ?, 'publish', 'maintenance_event', ?, ?, ?, 'published', 'maintenance_event', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    args: [
      input.id,
      input.maintenanceWindowId,
      input.publicationVersion,
      input.maintenanceEventId,
      input.maintenanceVersion,
      snapshotJson,
      input.maintenanceEventId,
      input.maintenanceVersion,
      snapshotJson,
      input.snapshot.publicEntryId,
      input.snapshot.effectiveAt,
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

function componentResults(components: readonly ComponentRecord[]) {
  return components.map((component) => ({
    componentId: component.componentId,
    componentVersion: component.referenceVersion,
  }))
}

function normalizedScheduleRequirements(
  input: ScheduleMaintenanceInput,
): ComponentRequirement[] {
  return input.affectedComponents.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.expectedComponentVersion,
    expectedComponentMetadataPublicationVersion:
      "expectedComponentMetadataPublicationVersion" in component
        ? component.expectedComponentMetadataPublicationVersion
        : null,
  }))
}

function normalizedAppendRequirements(
  input: AppendMaintenanceEventInput,
): ComponentRequirement[] {
  return input.affectedComponents.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.expectedComponentVersion,
    expectedComponentMetadataPublicationVersion:
      component.expectedComponentMetadataPublicationVersion,
  }))
}

type AppendComponentOutcome =
  AppendMaintenanceEventInput["affectedComponents"][number]

async function applyAppendComponentOutcomes(
  transaction: StatementExecutor,
  components: readonly ComponentRecord[],
  outcomes: readonly AppendComponentOutcome[],
  context: {
    effectiveAt: number
    recordedAt: number
    correlationId: string
  },
) {
  const outcomesByComponentId = new Map(
    outcomes.map((outcome) => [outcome.componentId, outcome]),
  )
  const updatedComponents: ComponentRecord[] = []
  const statusTransitions: StatusTransitionWriteResult[] = []

  for (const component of components) {
    const outcome = outcomesByComponentId.get(component.componentId)

    if (!outcome) {
      throw new CommandValidationError(
        "AFFECTED_COMPONENT_CHANGE_UNSUPPORTED",
        "Every maintenance component requires an explicit outcome",
      )
    }

    if (outcome.outcome === "unchanged") {
      updatedComponents.push(component)
      continue
    }

    const transition = await writeStatusTransition(
      transaction,
      {
        componentId: outcome.componentId,
        expectedComponentVersion: outcome.expectedComponentVersion,
        effectiveAt: context.effectiveAt,
        ...outcome.transition,
      },
      {
        recordedAt: context.recordedAt,
        correlationId: context.correlationId,
      },
    )
    statusTransitions.push(transition)
    updatedComponents.push({
      ...component,
      referenceVersion: transition.componentVersion,
    })
  }

  return { components: updatedComponents, statusTransitions }
}

export async function scheduleMaintenanceForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<MaintenanceCommandResult> {
  const input = scheduleMaintenanceInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const maintenanceWindowId = randomUUID()
  const maintenancePublicId = randomUUID()
  const maintenanceEventId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "schedule_maintenance",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseReceiptResult(existingResultRef)

    const publicPublication =
      input.publication.mode === "public" ? input.publication : null
    const isPublic = publicPublication !== null
    let affectedComponents = await readComponents(
      transaction,
      normalizedScheduleRequirements(input),
      isPublic,
    )

    if (isPublic) {
      affectedComponents = await incrementPublicDependencyVersions(
        transaction,
        affectedComponents,
        recordedAt,
      )
    }

    const allocation = await allocateOrdinals(
      transaction,
      isPublic ? 2 : 1,
      isPublic ? 1 : 0,
      recordedAt,
    )
    const eventOwnerOrdinal = allocation.ownerOrdinal - (isPublic ? 1 : 0)

    await transaction.execute({
      sql: "INSERT INTO maintenance_windows (id, public_id, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      args: [
        maintenanceWindowId,
        maintenancePublicId,
        recordedAt,
        recordedAt,
      ],
    })
    await transaction.execute({
      sql: "INSERT INTO maintenance_events (id, maintenance_window_id, maintenance_version, kind, phase, title, owner_summary, private_note, starts_at, ends_at, timezone, public_title, public_phase, public_summary, public_starts_at, public_ends_at, public_timezone, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, 1, 'scheduled', 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        maintenanceEventId,
        maintenanceWindowId,
        input.title,
        input.ownerSummary,
        input.privateNote,
        input.startsAt,
        input.endsAt,
        input.timezone,
        publicPublication?.title ?? null,
        isPublic ? "scheduled" : null,
        publicPublication?.summary ?? null,
        publicPublication?.startsAt ?? null,
        publicPublication?.endsAt ?? null,
        publicPublication?.timezone ?? null,
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
      isPublic,
    )

    if (publicPublication) {
      const snapshot = createMaintenancePublicSnapshot({
        schemaVersion: 1,
        publicEntryId,
        maintenancePublicId,
        kind: "scheduled",
        phase: "scheduled",
        title: publicPublication.title,
        summary: publicPublication.summary,
        startsAt: publicPublication.startsAt,
        endsAt: publicPublication.endsAt,
        timezone: publicPublication.timezone,
        effectiveAt: input.effectiveAt,
        affectedComponents: publicAffectedComponents(affectedComponents),
      })

      await insertPublicationEvent(transaction, {
        id: publicationEventId,
        maintenanceWindowId,
        maintenanceEventId,
        maintenanceVersion: 1,
        publicationVersion: 1,
        snapshot,
        recordedAt,
        ownerOrdinal: allocation.ownerOrdinal,
        publicOrdinal: allocation.publicOrdinal,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
    }

    const result: MaintenanceCommandResult = {
      maintenanceWindowId,
      maintenancePublicId,
      maintenanceEventId,
      maintenanceVersion: 1,
      maintenancePublicationVersion: isPublic ? 1 : 0,
      componentVersions: componentResults(affectedComponents),
      statusTransitions: [],
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "schedule_maintenance",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}

async function readCurrentMaintenance(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
): Promise<CurrentMaintenance> {
  const result = await transaction.execute({
    sql: `
      SELECT
        maintenance_windows.id,
        maintenance_windows.public_id,
        maintenance_windows.version,
        maintenance_events.id AS event_id,
        maintenance_events.phase,
        maintenance_events.title,
        maintenance_events.starts_at,
        maintenance_events.ends_at,
        maintenance_events.timezone
      FROM maintenance_windows
      LEFT JOIN maintenance_events
        ON maintenance_events.maintenance_window_id = maintenance_windows.id
      WHERE maintenance_windows.id = ?
      ORDER BY maintenance_events.maintenance_version DESC
      LIMIT 1
    `,
    args: [maintenanceWindowId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandNotFoundError(
      "MAINTENANCE_NOT_FOUND",
      "The maintenance window does not exist",
    )
  }

  if (row.event_id === null || row.event_id === undefined) {
    throw new CommandValidationError(
      "INVALID_MAINTENANCE_STATE",
      "The maintenance window has no current event",
    )
  }

  const phase = z.enum(maintenancePhases).safeParse(row.phase)

  if (!phase.success) {
    throw new CommandValidationError(
      "INVALID_MAINTENANCE_STATE",
      "The maintenance window phase is invalid",
    )
  }

  const componentResult = await transaction.execute({
    sql: "SELECT component_id FROM maintenance_event_components WHERE maintenance_event_id = ? ORDER BY position",
    args: [String(row.event_id)],
  })

  if (componentResult.rows.length === 0) {
    throw new CommandValidationError(
      "INVALID_MAINTENANCE_STATE",
      "The maintenance window has no affected components",
    )
  }

  return {
    maintenanceWindowId: String(row.id),
    maintenancePublicId: String(row.public_id),
    maintenanceVersion: Number(row.version),
    eventId: String(row.event_id),
    phase: phase.data,
    title: String(row.title),
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    timezone: String(row.timezone),
    componentIds: componentResult.rows.map((component) =>
      String(component.component_id),
    ),
  }
}

async function readMaintenancePublicationHead(
  transaction: StatementExecutor,
  maintenanceWindowId: string,
): Promise<MaintenancePublicationHead> {
  const result = await transaction.execute({
    sql: "SELECT publication_version, resulting_disposition, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
    args: [maintenanceWindowId],
  })
  const row = result.rows[0]

  if (!row) {
    return { publicationVersion: 0, isPublished: false, snapshot: null }
  }

  const isPublished = String(row.resulting_disposition) === "published"
  let snapshot: MaintenancePublicSnapshot | null = null

  if (isPublished) {
    const parsed = maintenancePublicSnapshotSchema.safeParse(
      parseJson(row.resulting_current_snapshot_json),
    )

    if (!parsed.success) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public maintenance snapshot is invalid",
      )
    }

    snapshot = parsed.data
  }

  return {
    publicationVersion: Number(row.publication_version),
    isPublished,
    snapshot,
  }
}

function assertSameAffectedComponents(
  currentIds: readonly string[],
  requirements: readonly ComponentRequirement[],
) {
  const submittedIds = new Set(
    requirements.map((requirement) => requirement.componentId),
  )

  if (
    currentIds.length !== requirements.length ||
    currentIds.some((id) => !submittedIds.has(id))
  ) {
    throw new CommandValidationError(
      "AFFECTED_COMPONENT_CHANGE_UNSUPPORTED",
      "Maintenance event commands currently require unchanged affected components",
    )
  }
}

function nextPhaseForOperation(
  phase: MaintenancePhase,
  operation: AppendMaintenanceEventInput["operation"],
) {
  if (operation === "note") return phase

  try {
    return nextMaintenancePhase({ phase, operation })
  } catch {
    throw new CommandValidationError(
      "INVALID_MAINTENANCE_TRANSITION",
      `Cannot ${operation} maintenance in phase ${phase}`,
    )
  }
}

function kindForOperation(
  operation: AppendMaintenanceEventInput["operation"],
): MaintenancePublicKind {
  switch (operation) {
    case "reschedule":
      return "rescheduled"
    case "start":
      return "started"
    case "complete":
      return "completed"
    case "cancel":
      return "cancelled"
    case "note":
      return "note"
  }
}

function orderRequirements(
  currentIds: readonly string[],
  requirements: readonly ComponentRequirement[],
) {
  const byId = new Map(
    requirements.map((requirement) => [requirement.componentId, requirement]),
  )

  return currentIds.map((id) => {
    const requirement = byId.get(id)

    if (!requirement) {
      throw new CommandValidationError(
        "AFFECTED_COMPONENT_CHANGE_UNSUPPORTED",
        "Maintenance event commands currently require unchanged affected components",
      )
    }

    return requirement
  })
}

export async function appendMaintenanceEventForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<MaintenanceCommandResult> {
  const input = appendMaintenanceEventInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const maintenanceEventId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "append_maintenance_event",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseReceiptResult(existingResultRef)

    const current = await readCurrentMaintenance(
      transaction,
      input.maintenanceWindowId,
    )

    if (current.maintenanceVersion !== input.expectedMaintenanceVersion) {
      throw new CommandConflictError(
        "MAINTENANCE_VERSION_CONFLICT",
        "Maintenance changed after the operation was prepared",
      )
    }

    const requirements = normalizedAppendRequirements(input)
    assertSameAffectedComponents(current.componentIds, requirements)
    const orderedRequirements = orderRequirements(
      current.componentIds,
      requirements,
    )
    const publicationHead = await readMaintenancePublicationHead(
      transaction,
      current.maintenanceWindowId,
    )

    if (
      publicationHead.snapshot &&
      (publicationHead.snapshot.maintenancePublicId !==
        current.maintenancePublicId ||
        publicationHead.snapshot.phase !== current.phase)
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public maintenance snapshot does not match the owner state",
      )
    }

    const publicPublication =
      input.publication.mode === "public" ? input.publication : null
    const publicReschedule =
      input.operation === "reschedule" &&
      input.publication.mode === "public"
        ? input.publication
        : null
    const isPublicOutput = publicPublication !== null
    const isLifecycleOperation = input.operation !== "note"

    if (
      publicationHead.isPublished &&
      isLifecycleOperation &&
      !isPublicOutput
    ) {
      throw new CommandValidationError(
        "PUBLIC_LIFECYCLE_REQUIRES_PUBLICATION",
        "A public maintenance lifecycle change must be published atomically",
      )
    }

    if (isPublicOutput && !publicationHead.isPublished) {
      throw new CommandValidationError(
        "MAINTENANCE_NOT_PUBLIC",
        "Only a currently public maintenance window can publish an appended event",
      )
    }

    if (
      isPublicOutput &&
      publicationHead.publicationVersion !==
        publicPublication?.expectedMaintenancePublicationVersion
    ) {
      throw new CommandConflictError(
        "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
        "Maintenance publication changed after the operation was prepared",
      )
    }

    const reviewedComponents = await readComponents(
      transaction,
      orderedRequirements,
      isPublicOutput,
    )
    const nextPhase = nextPhaseForOperation(current.phase, input.operation)
    const appliedComponentOutcomes = await applyAppendComponentOutcomes(
      transaction,
      reviewedComponents,
      input.affectedComponents,
      {
        effectiveAt: input.effectiveAt,
        recordedAt,
        correlationId,
      },
    )
    const affectedComponents = appliedComponentOutcomes.components
    const nextVersion = current.maintenanceVersion + 1
    const kind = kindForOperation(input.operation)
    const ownerStartsAt =
      input.operation === "reschedule" ? input.startsAt : current.startsAt
    const ownerEndsAt =
      input.operation === "reschedule" ? input.endsAt : current.endsAt
    const ownerTimezone =
      input.operation === "reschedule" ? input.timezone : current.timezone

    const allocation = await allocateOrdinals(
      transaction,
      isPublicOutput ? 2 : 1,
      isPublicOutput ? 1 : 0,
      recordedAt,
    )
    const eventOwnerOrdinal =
      allocation.ownerOrdinal - (isPublicOutput ? 1 : 0)
    const updateResult = await transaction.execute({
      sql: "UPDATE maintenance_windows SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextVersion,
        recordedAt,
        current.maintenanceWindowId,
        input.expectedMaintenanceVersion,
      ],
    })

    if (!updateResult.rows[0]) {
      throw new CommandConflictError(
        "MAINTENANCE_VERSION_CONFLICT",
        "Maintenance changed while the operation was being saved",
      )
    }

    const previousPublicSnapshot = publicationHead.snapshot
    const publicStartsAt =
      publicReschedule
        ? publicReschedule.startsAt
        : previousPublicSnapshot?.startsAt ?? null
    const publicEndsAt =
      publicReschedule
        ? publicReschedule.endsAt
        : previousPublicSnapshot?.endsAt ?? null
    const publicTimezone =
      publicReschedule
        ? publicReschedule.timezone
        : previousPublicSnapshot?.timezone ?? null
    const publicTitle = isPublicOutput
      ? previousPublicSnapshot?.title ?? null
      : null
    const publicSummary = publicPublication?.summary ?? null

    if (
      isPublicOutput &&
      (!publicTitle ||
        publicStartsAt === null ||
        publicEndsAt === null ||
        publicTimezone === null)
    ) {
      throw new CommandValidationError(
        "INVALID_PUBLIC_SNAPSHOT",
        "Stored public maintenance snapshot is incomplete",
      )
    }

    await transaction.execute({
      sql: "INSERT INTO maintenance_events (id, maintenance_window_id, maintenance_version, kind, phase, title, owner_summary, private_note, starts_at, ends_at, timezone, public_title, public_phase, public_summary, public_starts_at, public_ends_at, public_timezone, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        maintenanceEventId,
        current.maintenanceWindowId,
        nextVersion,
        kind,
        nextPhase,
        current.title,
        input.ownerSummary,
        input.privateNote,
        ownerStartsAt,
        ownerEndsAt,
        ownerTimezone,
        publicTitle,
        isPublicOutput ? nextPhase : null,
        publicSummary,
        isPublicOutput ? publicStartsAt : null,
        isPublicOutput ? publicEndsAt : null,
        isPublicOutput ? publicTimezone : null,
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
      isPublicOutput,
    )

    const nextPublicationVersion = isPublicOutput
      ? publicationHead.publicationVersion + 1
      : publicationHead.publicationVersion

    if (
      isPublicOutput &&
      publicTitle &&
      publicStartsAt !== null &&
      publicEndsAt !== null &&
      publicTimezone !== null
    ) {
      const snapshot = createMaintenancePublicSnapshot({
        schemaVersion: 1,
        publicEntryId,
        maintenancePublicId: current.maintenancePublicId,
        kind,
        phase: nextPhase,
        title: publicTitle,
        summary: publicPublication?.summary ?? null,
        startsAt: publicStartsAt,
        endsAt: publicEndsAt,
        timezone: publicTimezone,
        effectiveAt: input.effectiveAt,
        affectedComponents: publicAffectedComponents(affectedComponents),
      })

      await insertPublicationEvent(transaction, {
        id: publicationEventId,
        maintenanceWindowId: current.maintenanceWindowId,
        maintenanceEventId,
        maintenanceVersion: nextVersion,
        publicationVersion: nextPublicationVersion,
        snapshot,
        recordedAt,
        ownerOrdinal: allocation.ownerOrdinal,
        publicOrdinal: allocation.publicOrdinal,
        publicPrivacyEpoch: allocation.publicPrivacyEpoch,
        correlationId,
      })
    }

    const result: MaintenanceCommandResult = {
      maintenanceWindowId: current.maintenanceWindowId,
      maintenancePublicId: current.maintenancePublicId,
      maintenanceEventId,
      maintenanceVersion: nextVersion,
      maintenancePublicationVersion: nextPublicationVersion,
      componentVersions: componentResults(affectedComponents),
      statusTransitions: appliedComponentOutcomes.statusTransitions,
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "append_maintenance_event",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
