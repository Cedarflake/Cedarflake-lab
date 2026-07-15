import { z } from "zod"

import { maintenancePhases } from "@/domain/maintenance"
import type { DatabaseConnection } from "@/lib/db/create-database"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])
const maintenanceKindSchema = z.enum([
  "scheduled",
  "rescheduled",
  "started",
  "completed",
  "cancelled",
  "note",
  "metadata",
])

const rootRowSchema = z
  .object({
    maintenance_window_id: z.string().uuid(),
    maintenance_public_id: z.string().uuid(),
    maintenance_version: z.number().int().positive().safe(),
    created_at: z.number().int().nonnegative().safe(),
    updated_at: z.number().int().nonnegative().safe(),
    publication_version: z.number().int().positive().safe().nullable(),
    publication_action: publicationActionSchema.nullable(),
    resulting_disposition: z.enum(["published", "closed"]).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    const publicationFields = [
      row.publication_version,
      row.publication_action,
      row.resulting_disposition,
    ]
    const isEmpty = publicationFields.every((field) => field === null)
    const isComplete = publicationFields.every((field) => field !== null)

    if (!isEmpty && !isComplete) {
      context.addIssue({
        code: "custom",
        path: ["publication_version"],
        message: "Maintenance publication state is incomplete",
      })
    }

    if (
      isComplete &&
      ((row.publication_action === "publish" &&
        row.resulting_disposition !== "published") ||
        (row.publication_action !== "publish" &&
          row.resulting_disposition !== "closed"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_disposition"],
        message: "Maintenance publication disposition is invalid",
      })
    }

    if (row.updated_at < row.created_at) {
      context.addIssue({
        code: "custom",
        path: ["updated_at"],
        message: "Maintenance timestamps are invalid",
      })
    }
  })

const eventRowSchema = z
  .object({
    id: z.string().uuid(),
    maintenance_window_id: z.string().uuid(),
    maintenance_version: z.number().int().positive().safe(),
    kind: maintenanceKindSchema,
    phase: z.enum(maintenancePhases),
    title: z.string().min(1).max(120),
    owner_summary: z.string().nullable(),
    private_note: z.string().nullable(),
    starts_at: z.number().int().nonnegative().safe(),
    ends_at: z.number().int().nonnegative().safe(),
    timezone: z.string().min(1).max(80),
    public_title: z.string().nullable(),
    public_phase: z.enum(maintenancePhases).nullable(),
    public_summary: z.string().nullable(),
    public_starts_at: z.number().int().nonnegative().safe().nullable(),
    public_ends_at: z.number().int().nonnegative().safe().nullable(),
    public_timezone: z.string().nullable(),
    effective_at: z.number().int().nonnegative().safe(),
    recorded_at: z.number().int().nonnegative().safe(),
    owner_ordinal: z.number().int().positive().safe(),
    public_entry_id: z.string().uuid(),
    correlation_id: z.string().uuid(),
    publication_version: z.number().int().positive().safe().nullable(),
    publication_action: publicationActionSchema.nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.starts_at >= row.ends_at) {
      context.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "Maintenance interval is invalid",
      })
    }

    const requiredPublicFields = [
      row.public_title,
      row.public_phase,
      row.public_starts_at,
      row.public_ends_at,
      row.public_timezone,
    ]
    const hasNoPublicDraft = requiredPublicFields.every(
      (field) => field === null,
    )
    const hasCompletePublicDraft = requiredPublicFields.every(
      (field) => field !== null,
    )

    if (!hasNoPublicDraft && !hasCompletePublicDraft) {
      context.addIssue({
        code: "custom",
        path: ["public_title"],
        message: "Maintenance public draft is incomplete",
      })
    }

    if (hasNoPublicDraft && row.public_summary !== null) {
      context.addIssue({
        code: "custom",
        path: ["public_summary"],
        message: "Maintenance public draft is incomplete",
      })
    }

    if (
      hasCompletePublicDraft &&
      row.public_starts_at !== null &&
      row.public_ends_at !== null &&
      row.public_starts_at >= row.public_ends_at
    ) {
      context.addIssue({
        code: "custom",
        path: ["public_ends_at"],
        message: "Maintenance public interval is invalid",
      })
    }

    if (
      (row.publication_version === null) !==
      (row.publication_action === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["publication_version"],
        message: "Maintenance event publication state is incomplete",
      })
    }

    if (row.publication_action === "publish" && !hasCompletePublicDraft) {
      context.addIssue({
        code: "custom",
        path: ["public_title"],
        message: "A published maintenance event requires a public draft",
      })
    }

    if (
      row.publication_action === "publish" &&
      row.public_phase !== row.phase
    ) {
      context.addIssue({
        code: "custom",
        path: ["public_phase"],
        message: "Published maintenance phase is not authoritative",
      })
    }
  })

const referenceRowSchema = z
  .object({
    maintenance_event_id: z.string().uuid(),
    position: z.number().int().nonnegative().safe(),
    component_id: z.string().uuid(),
    component_version: z.number().int().positive().safe(),
    component_revision_id: z.string().uuid(),
    owner_name_snapshot: z.string().min(1).max(80),
    public_component_id_snapshot: z.string().uuid().nullable(),
    public_name_snapshot: z.string().min(1).max(80).nullable(),
    component_metadata_publication_version: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    const publicFields = [
      row.public_component_id_snapshot,
      row.public_name_snapshot,
      row.component_metadata_publication_version,
    ]
    const isEmpty = publicFields.every((field) => field === null)
    const isComplete = publicFields.every((field) => field !== null)

    if (!isEmpty && !isComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_component_id_snapshot"],
        message: "Maintenance component public snapshot is incomplete",
      })
    }
  })

export class OwnerMaintenanceDataIntegrityError extends Error {
  constructor() {
    super("Owner maintenance data is invalid")
    this.name = "OwnerMaintenanceDataIntegrityError"
  }
}

export type MaintenancePublicationAction = z.infer<
  typeof publicationActionSchema
>

export interface OwnerMaintenancePublicationDto {
  version: number
  lastAction: MaintenancePublicationAction | null
  disposition:
    | "private"
    | "published"
    | "withdrawn"
    | "redacted"
    | "suppressed"
}

export interface OwnerMaintenanceComponentReferenceDto {
  position: number
  componentId: string
  componentVersion: number
  componentRevisionId: string
  ownerNameSnapshot: string
  publicSnapshot: {
    componentPublicId: string
    name: string
    componentMetadataPublicationVersion: number
  } | null
}

export interface OwnerMaintenanceEventDto {
  eventId: string
  maintenanceVersion: number
  kind: z.infer<typeof maintenanceKindSchema>
  phase: z.infer<typeof eventRowSchema>["phase"]
  title: string
  ownerSummary: string | null
  privateNote: string | null
  startsAt: number
  endsAt: number
  timezone: string
  publicDraft: {
    title: string
    phase: z.infer<typeof eventRowSchema>["phase"]
    summary: string | null
    startsAt: number
    endsAt: number
    timezone: string
  } | null
  effectiveAt: number
  recordedAt: number
  ownerOrdinal: number
  publicEntryId: string
  correlationId: string
  publication: OwnerMaintenancePublicationDto
  affectedComponents: readonly OwnerMaintenanceComponentReferenceDto[]
}

export interface OwnerMaintenanceWindowDto {
  maintenanceWindowId: string
  maintenancePublicId: string
  maintenanceVersion: number
  createdAt: number
  updatedAt: number
  phase: z.infer<typeof eventRowSchema>["phase"]
  isOverdue: boolean
  overdueReason: "awaiting_start" | "awaiting_completion" | null
  publication: OwnerMaintenancePublicationDto & {
    resultingDisposition: "private" | "published" | "closed"
  }
  latestEvent: OwnerMaintenanceEventDto
  events: readonly OwnerMaintenanceEventDto[]
}

function parseRootRow(row: unknown) {
  const parsed = rootRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerMaintenanceDataIntegrityError()
  return parsed.data
}

function parseEventRow(row: unknown) {
  const parsed = eventRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerMaintenanceDataIntegrityError()
  return parsed.data
}

function parseReferenceRow(row: unknown) {
  const parsed = referenceRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerMaintenanceDataIntegrityError()
  return parsed.data
}

function actionToDisposition(
  action: MaintenancePublicationAction | null,
): OwnerMaintenancePublicationDto["disposition"] {
  switch (action) {
    case null:
      return "private"
    case "publish":
      return "published"
    case "withdraw":
      return "withdrawn"
    case "redact":
      return "redacted"
    case "suppress":
      return "suppressed"
  }
}

function createPublicationState(
  version: number | null,
  action: MaintenancePublicationAction | null,
): OwnerMaintenancePublicationDto {
  return {
    version: version ?? 0,
    lastAction: action,
    disposition: actionToDisposition(action),
  }
}

async function readRoots(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked_publications AS (
      SELECT
        stream_id,
        publication_version,
        action,
        resulting_disposition,
        row_number() OVER (
          PARTITION BY stream_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'maintenance'
    )
    SELECT
      maintenance_windows.id AS maintenance_window_id,
      maintenance_windows.public_id AS maintenance_public_id,
      maintenance_windows.version AS maintenance_version,
      maintenance_windows.created_at,
      maintenance_windows.updated_at,
      ranked_publications.publication_version,
      ranked_publications.action AS publication_action,
      ranked_publications.resulting_disposition
    FROM maintenance_windows
    LEFT JOIN ranked_publications
      ON ranked_publications.stream_id = maintenance_windows.id
      AND ranked_publications.rank = 1
  `)
}

async function readEvents(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked_publications AS (
      SELECT
        target_source_id,
        publication_version,
        action,
        row_number() OVER (
          PARTITION BY target_source_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'maintenance'
    )
    SELECT
      maintenance_events.id,
      maintenance_events.maintenance_window_id,
      maintenance_events.maintenance_version,
      maintenance_events.kind,
      maintenance_events.phase,
      maintenance_events.title,
      maintenance_events.owner_summary,
      maintenance_events.private_note,
      maintenance_events.starts_at,
      maintenance_events.ends_at,
      maintenance_events.timezone,
      maintenance_events.public_title,
      maintenance_events.public_phase,
      maintenance_events.public_summary,
      maintenance_events.public_starts_at,
      maintenance_events.public_ends_at,
      maintenance_events.public_timezone,
      maintenance_events.effective_at,
      maintenance_events.recorded_at,
      maintenance_events.owner_ordinal,
      maintenance_events.public_entry_id,
      maintenance_events.correlation_id,
      ranked_publications.publication_version,
      ranked_publications.action AS publication_action
    FROM maintenance_events
    LEFT JOIN ranked_publications
      ON ranked_publications.target_source_id = maintenance_events.id
      AND ranked_publications.rank = 1
    ORDER BY
      maintenance_events.maintenance_window_id,
      maintenance_events.maintenance_version DESC,
      maintenance_events.id DESC
  `)
}

async function readReferences(connection: DatabaseConnection) {
  return connection.client.execute(`
    SELECT
      maintenance_event_id,
      position,
      component_id,
      component_version,
      component_revision_id,
      owner_name_snapshot,
      public_component_id_snapshot,
      public_name_snapshot,
      component_metadata_publication_version
    FROM maintenance_event_components
    ORDER BY maintenance_event_id, position
  `)
}

function createReferenceDtos(
  eventId: string,
  referenceRows: readonly z.infer<typeof referenceRowSchema>[],
) {
  const rows = referenceRows.filter(
    (reference) => reference.maintenance_event_id === eventId,
  )
  const componentIds = new Set<string>()

  if (rows.length === 0) throw new OwnerMaintenanceDataIntegrityError()

  return rows.map<OwnerMaintenanceComponentReferenceDto>(
    (reference, index) => {
      if (
        reference.position !== index ||
        componentIds.has(reference.component_id)
      ) {
        throw new OwnerMaintenanceDataIntegrityError()
      }

      componentIds.add(reference.component_id)

      return {
        position: reference.position,
        componentId: reference.component_id,
        componentVersion: reference.component_version,
        componentRevisionId: reference.component_revision_id,
        ownerNameSnapshot: reference.owner_name_snapshot,
        publicSnapshot:
          reference.public_component_id_snapshot === null ||
          reference.public_name_snapshot === null ||
          reference.component_metadata_publication_version === null
            ? null
            : {
                componentPublicId: reference.public_component_id_snapshot,
                name: reference.public_name_snapshot,
                componentMetadataPublicationVersion:
                  reference.component_metadata_publication_version,
              },
      }
    },
  )
}

function createEventDto(
  event: z.infer<typeof eventRowSchema>,
  referenceRows: readonly z.infer<typeof referenceRowSchema>[],
): OwnerMaintenanceEventDto {
  const hasPublicDraft =
    event.public_title !== null &&
    event.public_phase !== null &&
    event.public_starts_at !== null &&
    event.public_ends_at !== null &&
    event.public_timezone !== null
  const affectedComponents = createReferenceDtos(event.id, referenceRows)

  if (
    event.publication_action === "publish" &&
    affectedComponents.some((reference) => reference.publicSnapshot === null)
  ) {
    throw new OwnerMaintenanceDataIntegrityError()
  }

  return {
    eventId: event.id,
    maintenanceVersion: event.maintenance_version,
    kind: event.kind,
    phase: event.phase,
    title: event.title,
    ownerSummary: event.owner_summary,
    privateNote: event.private_note,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timezone: event.timezone,
    publicDraft: hasPublicDraft
      ? {
          title: event.public_title as string,
          phase: event.public_phase as z.infer<typeof eventRowSchema>["phase"],
          summary: event.public_summary,
          startsAt: event.public_starts_at as number,
          endsAt: event.public_ends_at as number,
          timezone: event.public_timezone as string,
        }
      : null,
    effectiveAt: event.effective_at,
    recordedAt: event.recorded_at,
    ownerOrdinal: event.owner_ordinal,
    publicEntryId: event.public_entry_id,
    correlationId: event.correlation_id,
    publication: createPublicationState(
      event.publication_version,
      event.publication_action,
    ),
    affectedComponents,
  }
}

function deriveOverdue(
  event: OwnerMaintenanceEventDto,
  now: number,
): Pick<OwnerMaintenanceWindowDto, "isOverdue" | "overdueReason"> {
  if (event.phase === "scheduled" && event.startsAt <= now) {
    return { isOverdue: true, overdueReason: "awaiting_start" }
  }

  if (event.phase === "in_progress" && event.endsAt <= now) {
    return { isOverdue: true, overdueReason: "awaiting_completion" }
  }

  return { isOverdue: false, overdueReason: null }
}

export async function readOwnerMaintenanceWindows(
  connection: DatabaseConnection,
  now: number,
): Promise<readonly OwnerMaintenanceWindowDto[]> {
  const [rootResult, eventResult, referenceResult] = await Promise.all([
    readRoots(connection),
    readEvents(connection),
    readReferences(connection),
  ])
  const roots = rootResult.rows.map(parseRootRow)
  const eventRows = eventResult.rows.map(parseEventRow)
  const referenceRows = referenceResult.rows.map(parseReferenceRow)

  return roots
    .map<OwnerMaintenanceWindowDto>((root) => {
      const events = eventRows
        .filter(
          (event) =>
            event.maintenance_window_id === root.maintenance_window_id,
        )
        .map((event) => createEventDto(event, referenceRows))

      if (
        events.length !== root.maintenance_version ||
        events[0]?.maintenanceVersion !== root.maintenance_version ||
        events.some(
          (event, index) =>
            event.maintenanceVersion !== root.maintenance_version - index,
        )
      ) {
        throw new OwnerMaintenanceDataIntegrityError()
      }

      const latestEvent = events[0]
      if (!latestEvent) throw new OwnerMaintenanceDataIntegrityError()

      const publication = createPublicationState(
        root.publication_version,
        root.publication_action,
      )

      return {
        maintenanceWindowId: root.maintenance_window_id,
        maintenancePublicId: root.maintenance_public_id,
        maintenanceVersion: root.maintenance_version,
        createdAt: root.created_at,
        updatedAt: root.updated_at,
        phase: latestEvent.phase,
        ...deriveOverdue(latestEvent, now),
        publication: {
          ...publication,
          resultingDisposition: root.resulting_disposition ?? "private",
        },
        latestEvent,
        events,
      }
    })
    .toSorted(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        left.maintenanceWindowId.localeCompare(right.maintenanceWindowId),
    )
}
