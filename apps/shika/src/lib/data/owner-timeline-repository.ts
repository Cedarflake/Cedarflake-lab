import { z } from "zod"

import {
  assertOwnerTimelinePageRequest,
  pageOwnerTimeline,
  type OwnerTimelineCursor,
  type OwnerTimelineSourceType,
} from "@/domain/owner-timeline"
import { incidentPhases, incidentSeverities } from "@/domain/incidents"
import { maintenancePhases } from "@/domain/maintenance"
import { statusConditions } from "@/domain/status"
import type { DatabaseConnection } from "@/lib/db/create-database"

const publicationActions = [
  "publish",
  "withdraw",
  "redact",
  "suppress",
] as const
const incidentUpdateKinds = [
  "created",
  "note",
  "phase",
  "metadata",
  "resolved",
  "reopened",
] as const
const maintenanceEventKinds = [
  "scheduled",
  "rescheduled",
  "started",
  "completed",
  "cancelled",
  "note",
  "metadata",
] as const

const nonnegativeSafeInteger = z.number().int().nonnegative().safe()
const positiveSafeInteger = z.number().int().positive().safe()
const publicationActionSchema = z.enum(publicationActions)
const publicationDispositionSchema = z.enum(["published", "closed"])

const clockRowSchema = z
  .object({
    owner_ordinal: nonnegativeSafeInteger,
    maximum_source_ordinal: positiveSafeInteger.nullable(),
  })
  .strict()

const sourcePublicationFields = {
  source_publication_version: positiveSafeInteger.nullable(),
  source_publication_action: publicationActionSchema.nullable(),
  source_resulting_disposition: publicationDispositionSchema.nullable(),
}

const sourceRowFields = {
  source_id: z.string().min(1),
  source_revision: positiveSafeInteger,
  effective_at: nonnegativeSafeInteger,
  recorded_at: nonnegativeSafeInteger,
  owner_ordinal: positiveSafeInteger,
  correlation_id: z.string().min(1),
  owner_summary: z.string().nullable(),
  private_note: z.string().nullable(),
  ...sourcePublicationFields,
}

function addPublicationIntegrityIssues(
  value: {
    source_publication_version: number | null
    source_publication_action: OwnerTimelinePublicationAction | null
    source_resulting_disposition: "published" | "closed" | null
  },
  context: z.RefinementCtx,
) {
  const publication = [
    value.source_publication_version,
    value.source_publication_action,
    value.source_resulting_disposition,
  ]
  const isEmpty = publication.every((field) => field === null)
  const isComplete = publication.every((field) => field !== null)

  if (!isEmpty && !isComplete) {
    context.addIssue({
      code: "custom",
      path: ["source_publication_version"],
      message: "Owner timeline publication state is incomplete",
    })
    return
  }

  if (
    value.source_publication_action === "publish" &&
    value.source_resulting_disposition !== "published"
  ) {
    context.addIssue({
      code: "custom",
      path: ["source_resulting_disposition"],
      message: "Published owner source is not publicly exposed",
    })
  }

  if (
    value.source_publication_action !== null &&
    value.source_publication_action !== "publish" &&
    value.source_resulting_disposition !== "closed"
  ) {
    context.addIssue({
      code: "custom",
      path: ["source_resulting_disposition"],
      message: "Closed owner source is still publicly exposed",
    })
  }
}

const statusRowSchema = z
  .object({
    ...sourceRowFields,
    component_id: z.string().min(1),
    component_public_id: z.string().min(1),
    owner_name_snapshot: z.string().trim().min(1),
    condition: z.enum(statusConditions),
    public_summary: z.string().nullable(),
    valid_until: nonnegativeSafeInteger.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    addPublicationIntegrityIssues(value, context)

    if (value.valid_until !== null && value.valid_until <= value.effective_at) {
      context.addIssue({
        code: "custom",
        path: ["valid_until"],
        message: "Owner status interval is invalid",
      })
    }
  })

const incidentRowSchema = z
  .object({
    ...sourceRowFields,
    incident_id: z.string().min(1),
    incident_public_id: z.string().min(1),
    update_kind: z.enum(incidentUpdateKinds),
    phase: z.enum(incidentPhases),
    severity: z.enum(incidentSeverities),
    title: z.string().trim().min(1),
    reason: z.string().nullable(),
    public_title: z.string().nullable(),
    public_phase: z.enum(incidentPhases).nullable(),
    public_severity: z.enum(incidentSeverities).nullable(),
    public_summary: z.string().nullable(),
    detail_available: z.union([z.literal(0), z.literal(1)]),
  })
  .strict()
  .superRefine((value, context) => {
    addPublicationIntegrityIssues(value, context)

    const identity = [
      value.public_title,
      value.public_phase,
      value.public_severity,
    ]
    const isEmpty = identity.every((field) => field === null)
    const isComplete = identity.every((field) => field !== null)

    if (!isEmpty && !isComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_title"],
        message: "Owner incident public candidate is incomplete",
      })
    }
  })

const maintenanceRowSchema = z
  .object({
    ...sourceRowFields,
    maintenance_window_id: z.string().min(1),
    maintenance_public_id: z.string().min(1),
    event_kind: z.enum(maintenanceEventKinds),
    phase: z.enum(maintenancePhases),
    title: z.string().trim().min(1),
    starts_at: nonnegativeSafeInteger,
    ends_at: nonnegativeSafeInteger,
    timezone: z.string().trim().min(1),
    public_title: z.string().nullable(),
    public_phase: z.enum(maintenancePhases).nullable(),
    public_summary: z.string().nullable(),
    public_starts_at: nonnegativeSafeInteger.nullable(),
    public_ends_at: nonnegativeSafeInteger.nullable(),
    public_timezone: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    addPublicationIntegrityIssues(value, context)

    if (value.starts_at >= value.ends_at) {
      context.addIssue({
        code: "custom",
        path: ["starts_at"],
        message: "Owner maintenance interval is invalid",
      })
    }

    const candidate = [
      value.public_title,
      value.public_phase,
      value.public_starts_at,
      value.public_ends_at,
      value.public_timezone,
    ]
    const isEmpty = candidate.every((field) => field === null)
    const isComplete = candidate.every((field) => field !== null)

    if (!isEmpty && !isComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_title"],
        message: "Owner maintenance public candidate is incomplete",
      })
    }

    if (
      value.public_starts_at !== null &&
      value.public_ends_at !== null &&
      value.public_starts_at >= value.public_ends_at
    ) {
      context.addIssue({
        code: "custom",
        path: ["public_starts_at"],
        message: "Owner maintenance public interval is invalid",
      })
    }
  })

const incidentReferenceRowSchema = z
  .object({
    incident_update_id: z.string().min(1),
    position: nonnegativeSafeInteger,
    component_id: z.string().min(1),
    component_version: positiveSafeInteger,
    component_revision_id: z.string().min(1),
    owner_name_snapshot: z.string().trim().min(1),
  })
  .strict()

const incidentPublicReferenceRowSchema = z
  .object({
    incident_update_id: z.string().min(1),
    position: nonnegativeSafeInteger,
    public_component_id_snapshot: z.string().min(1),
    public_name_snapshot: z.string().trim().min(1),
    component_metadata_publication_version: positiveSafeInteger,
  })
  .strict()

const maintenanceReferenceRowSchema = z
  .object({
    maintenance_event_id: z.string().min(1),
    position: nonnegativeSafeInteger,
    component_id: z.string().min(1),
    component_version: positiveSafeInteger,
    component_revision_id: z.string().min(1),
    owner_name_snapshot: z.string().trim().min(1),
    public_component_id_snapshot: z.string().nullable(),
    public_name_snapshot: z.string().nullable(),
    component_metadata_publication_version: positiveSafeInteger.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const publicSnapshot = [
      value.public_component_id_snapshot,
      value.public_name_snapshot,
      value.component_metadata_publication_version,
    ]
    const isEmpty = publicSnapshot.every((field) => field === null)
    const isComplete = publicSnapshot.every((field) => field !== null)

    if (!isEmpty && !isComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_component_id_snapshot"],
        message: "Owner maintenance public reference is incomplete",
      })
    }
  })

export type OwnerTimelinePublicationAction =
  (typeof publicationActions)[number]

export type OwnerTimelinePublicDisposition =
  | "private"
  | "published"
  | "withdrawn"
  | "redacted"
  | "suppressed"

export interface OwnerTimelinePublicStateDto {
  publicationVersion: number
  lastAction: OwnerTimelinePublicationAction | null
  exposure: "private" | "public" | "closed"
  disposition: OwnerTimelinePublicDisposition
}

export interface OwnerTimelineAffectedComponentDto {
  position: number
  componentId: string
  componentVersion: number
  componentRevisionId: string
  ownerName: string
}

export interface OwnerTimelinePublicComponentDto {
  position: number
  componentPublicId: string
  name: string
  componentMetadataPublicationVersion: number
}

interface OwnerTimelineEntryBaseDto {
  schemaVersion: 1
  entryId: string
  sourceType: OwnerTimelineSourceType
  sourceId: string
  sourceRevision: number
  correlationId: string
  effectiveAt: number
  recordedAt: number
  ownerOrdinal: number
  ownerSummary: string | null
  privateNote: string | null
  publicState: OwnerTimelinePublicStateDto
  publicDetailHref: string | null
}

export interface OwnerStatusTimelineEntryDto
  extends OwnerTimelineEntryBaseDto {
  kind: "component_status"
  sourceType: "status_transition"
  componentId: string
  componentPublicId: string
  ownerNameSnapshot: string
  condition: (typeof statusConditions)[number]
  publicSummaryCandidate: string | null
  validUntil: number | null
}

export interface OwnerIncidentTimelineEntryDto
  extends OwnerTimelineEntryBaseDto {
  kind: "incident"
  sourceType: "incident_update"
  incidentId: string
  incidentPublicId: string
  updateKind: (typeof incidentUpdateKinds)[number]
  phase: (typeof incidentPhases)[number]
  severity: (typeof incidentSeverities)[number]
  title: string
  reason: string | null
  publicCandidate: {
    title: string
    phase: (typeof incidentPhases)[number]
    severity: (typeof incidentSeverities)[number]
    summary: string | null
  } | null
  affectedComponents: readonly OwnerTimelineAffectedComponentDto[]
  publicAffectedComponents: readonly OwnerTimelinePublicComponentDto[]
}

export interface OwnerMaintenanceTimelineEntryDto
  extends OwnerTimelineEntryBaseDto {
  kind: "maintenance"
  sourceType: "maintenance_event"
  maintenanceWindowId: string
  maintenancePublicId: string
  eventKind: (typeof maintenanceEventKinds)[number]
  phase: (typeof maintenancePhases)[number]
  title: string
  startsAt: number
  endsAt: number
  timezone: string
  publicCandidate: {
    title: string
    phase: (typeof maintenancePhases)[number]
    summary: string | null
    startsAt: number
    endsAt: number
    timezone: string
  } | null
  affectedComponents: readonly (OwnerTimelineAffectedComponentDto & {
    publicSnapshot: Omit<OwnerTimelinePublicComponentDto, "position"> | null
  })[]
}

export type OwnerTimelineEntryDto =
  | OwnerStatusTimelineEntryDto
  | OwnerIncidentTimelineEntryDto
  | OwnerMaintenanceTimelineEntryDto

export interface OwnerTimelinePageDto {
  entries: readonly OwnerTimelineEntryDto[]
  nextCursor: OwnerTimelineCursor | null
}

export interface ReadOwnerTimelinePageInput {
  limit: number
  cursor?: OwnerTimelineCursor | null
}

export class OwnerTimelineDataIntegrityError extends Error {
  constructor() {
    super("Owner timeline data is invalid")
    this.name = "OwnerTimelineDataIntegrityError"
  }
}

function parseRow<Output>(schema: z.ZodType<Output>, row: unknown) {
  const result = schema.safeParse(row)
  if (!result.success) throw new OwnerTimelineDataIntegrityError()
  return result.data
}

function createPublicState(input: {
  version: number | null
  action: OwnerTimelinePublicationAction | null
  resultingDisposition: "published" | "closed" | null
}): OwnerTimelinePublicStateDto {
  if (
    input.version === null ||
    input.action === null ||
    input.resultingDisposition === null
  ) {
    return {
      publicationVersion: 0,
      lastAction: null,
      exposure: "private",
      disposition: "private",
    }
  }

  return {
    publicationVersion: input.version,
    lastAction: input.action,
    exposure: input.resultingDisposition === "published" ? "public" : "closed",
    disposition:
      input.action === "publish"
        ? "published"
        : input.action === "withdraw"
          ? "withdrawn"
          : input.action === "redact"
            ? "redacted"
            : "suppressed",
  }
}

interface SourceBaseRow {
  source_id: string
  source_revision: number
  effective_at: number
  recorded_at: number
  owner_ordinal: number
  correlation_id: string
  owner_summary: string | null
  private_note: string | null
  source_publication_version: number | null
  source_publication_action: OwnerTimelinePublicationAction | null
  source_resulting_disposition: "published" | "closed" | null
}

function createBaseEntry(
  sourceType: OwnerTimelineSourceType,
  row: SourceBaseRow,
): OwnerTimelineEntryBaseDto {
  return {
    schemaVersion: 1,
    entryId: `${sourceType}:${row.source_id}`,
    sourceType,
    sourceId: row.source_id,
    sourceRevision: row.source_revision,
    correlationId: row.correlation_id,
    effectiveAt: row.effective_at,
    recordedAt: row.recorded_at,
    ownerOrdinal: row.owner_ordinal,
    ownerSummary: row.owner_summary,
    privateNote: row.private_note,
    publicState: createPublicState({
      version: row.source_publication_version,
      action: row.source_publication_action,
      resultingDisposition: row.source_resulting_disposition,
    }),
    publicDetailHref: null,
  }
}

function pageBounds(input: {
  limit: number
  asOfOwnerOrdinal: number
  lastOwnerOrdinal: number | null
}) {
  const seekClause =
    input.lastOwnerOrdinal === null ? "" : "AND source.owner_ordinal < ?"
  const args: Array<number> = [input.asOfOwnerOrdinal]
  if (input.lastOwnerOrdinal !== null) args.push(input.lastOwnerOrdinal)
  args.push(input.limit + 1)
  return { seekClause, args }
}

async function readClock(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    SELECT
      timeline_clock.owner_ordinal,
      (
        SELECT max(owner_ordinal)
        FROM (
          SELECT owner_ordinal FROM status_transitions
          UNION ALL
          SELECT owner_ordinal FROM incident_updates
          UNION ALL
          SELECT owner_ordinal FROM maintenance_events
        ) AS owner_sources
      ) AS maximum_source_ordinal
    FROM timeline_clock
    WHERE timeline_clock.id = 1
  `)
  const clock = parseRow(clockRowSchema, result.rows[0])

  if (
    clock.maximum_source_ordinal !== null &&
    clock.maximum_source_ordinal > clock.owner_ordinal
  ) {
    throw new OwnerTimelineDataIntegrityError()
  }

  return clock.owner_ordinal
}

async function readStatusEntries(
  connection: DatabaseConnection,
  bounds: ReturnType<typeof pageBounds>,
) {
  const result = await connection.client.execute({
    sql: `
      WITH ranked_source_publications AS (
        SELECT
          target_source_id,
          publication_version,
          action,
          resulting_disposition,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS publication_rank
        FROM publication_events
        WHERE target_source_type = 'status_transition'
      ),
      latest_source_publications AS (
        SELECT *
        FROM ranked_source_publications
        WHERE publication_rank = 1
      ),
      source AS (
        SELECT
          status_transitions.id AS source_id,
          status_transitions.component_version AS source_revision,
          status_transitions.component_id,
          components.public_id AS component_public_id,
          (
            SELECT component_revisions.owner_name
            FROM component_revisions
            WHERE component_revisions.component_id = status_transitions.component_id
              AND component_revisions.component_version <= status_transitions.component_version
            ORDER BY component_revisions.component_version DESC, component_revisions.id DESC
            LIMIT 1
          ) AS owner_name_snapshot,
          status_transitions.condition,
          status_transitions.owner_summary,
          status_transitions.public_summary,
          status_transitions.private_note,
          status_transitions.effective_at,
          status_transitions.valid_until,
          status_transitions.recorded_at,
          status_transitions.owner_ordinal,
          status_transitions.correlation_id,
          latest_source_publications.publication_version AS source_publication_version,
          latest_source_publications.action AS source_publication_action,
          latest_source_publications.resulting_disposition AS source_resulting_disposition
        FROM status_transitions
        INNER JOIN components
          ON components.id = status_transitions.component_id
        LEFT JOIN latest_source_publications
          ON latest_source_publications.target_source_id = status_transitions.id
      )
      SELECT *
      FROM source
      WHERE source.owner_ordinal <= ?
        ${bounds.seekClause}
      ORDER BY source.owner_ordinal DESC, source.source_id DESC
      LIMIT ?
    `,
    args: bounds.args,
  })

  return result.rows.map((row) => parseRow(statusRowSchema, row))
}

async function readIncidentEntries(
  connection: DatabaseConnection,
  bounds: ReturnType<typeof pageBounds>,
) {
  const result = await connection.client.execute({
    sql: `
      WITH ranked_source_publications AS (
        SELECT
          target_source_id,
          publication_version,
          action,
          resulting_disposition,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS publication_rank
        FROM publication_events
        WHERE target_source_type = 'incident_update'
      ),
      latest_source_publications AS (
        SELECT *
        FROM ranked_source_publications
        WHERE publication_rank = 1
      ),
      ranked_stream_publications AS (
        SELECT
          stream_id,
          action,
          resulting_disposition,
          row_number() OVER (
            PARTITION BY stream_id
            ORDER BY publication_version DESC, id DESC
          ) AS stream_rank
        FROM publication_events
        WHERE stream_type = 'incident'
      ),
      latest_stream_publications AS (
        SELECT *
        FROM ranked_stream_publications
        WHERE stream_rank = 1
      ),
      source AS (
        SELECT
          incident_updates.id AS source_id,
          incident_updates.incident_version AS source_revision,
          incident_updates.incident_id,
          incidents.public_id AS incident_public_id,
          incident_updates.kind AS update_kind,
          incident_updates.phase,
          incident_updates.severity,
          incident_updates.title,
          incident_updates.owner_summary,
          incident_updates.private_note,
          incident_updates.reason,
          incident_updates.public_title,
          incident_updates.public_phase,
          incident_updates.public_severity,
          incident_updates.public_summary,
          incident_updates.effective_at,
          incident_updates.recorded_at,
          incident_updates.owner_ordinal,
          incident_updates.correlation_id,
          latest_source_publications.publication_version AS source_publication_version,
          latest_source_publications.action AS source_publication_action,
          latest_source_publications.resulting_disposition AS source_resulting_disposition,
          CASE
            WHEN latest_stream_publications.action = 'publish'
              AND latest_stream_publications.resulting_disposition = 'published'
            THEN 1
            ELSE 0
          END AS detail_available
        FROM incident_updates
        INNER JOIN incidents
          ON incidents.id = incident_updates.incident_id
        LEFT JOIN latest_source_publications
          ON latest_source_publications.target_source_id = incident_updates.id
        LEFT JOIN latest_stream_publications
          ON latest_stream_publications.stream_id = incident_updates.incident_id
      )
      SELECT *
      FROM source
      WHERE source.owner_ordinal <= ?
        ${bounds.seekClause}
      ORDER BY source.owner_ordinal DESC, source.source_id DESC
      LIMIT ?
    `,
    args: bounds.args,
  })

  return result.rows.map((row) => parseRow(incidentRowSchema, row))
}

async function readMaintenanceEntries(
  connection: DatabaseConnection,
  bounds: ReturnType<typeof pageBounds>,
) {
  const result = await connection.client.execute({
    sql: `
      WITH ranked_source_publications AS (
        SELECT
          target_source_id,
          publication_version,
          action,
          resulting_disposition,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS publication_rank
        FROM publication_events
        WHERE target_source_type = 'maintenance_event'
      ),
      latest_source_publications AS (
        SELECT *
        FROM ranked_source_publications
        WHERE publication_rank = 1
      ),
      source AS (
        SELECT
          maintenance_events.id AS source_id,
          maintenance_events.maintenance_version AS source_revision,
          maintenance_events.maintenance_window_id,
          maintenance_windows.public_id AS maintenance_public_id,
          maintenance_events.kind AS event_kind,
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
          maintenance_events.correlation_id,
          latest_source_publications.publication_version AS source_publication_version,
          latest_source_publications.action AS source_publication_action,
          latest_source_publications.resulting_disposition AS source_resulting_disposition
        FROM maintenance_events
        INNER JOIN maintenance_windows
          ON maintenance_windows.id = maintenance_events.maintenance_window_id
        LEFT JOIN latest_source_publications
          ON latest_source_publications.target_source_id = maintenance_events.id
      )
      SELECT *
      FROM source
      WHERE source.owner_ordinal <= ?
        ${bounds.seekClause}
      ORDER BY source.owner_ordinal DESC, source.source_id DESC
      LIMIT ?
    `,
    args: bounds.args,
  })

  return result.rows.map((row) => parseRow(maintenanceRowSchema, row))
}

function placeholders(ids: readonly string[]) {
  return ids.map(() => "?").join(", ")
}

async function readIncidentReferences(
  connection: DatabaseConnection,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return []

  const result = await connection.client.execute({
    sql: `
      SELECT
        incident_update_id,
        position,
        component_id,
        component_version,
        component_revision_id,
        owner_name_snapshot
      FROM incident_update_components
      WHERE incident_update_id IN (${placeholders(sourceIds)})
      ORDER BY incident_update_id, position, component_id
    `,
    args: [...sourceIds],
  })

  return result.rows.map((row) => parseRow(incidentReferenceRowSchema, row))
}

async function readIncidentPublicReferences(
  connection: DatabaseConnection,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return []

  const result = await connection.client.execute({
    sql: `
      SELECT
        incident_update_id,
        position,
        public_component_id_snapshot,
        public_name_snapshot,
        component_metadata_publication_version
      FROM incident_update_public_components
      WHERE incident_update_id IN (${placeholders(sourceIds)})
      ORDER BY incident_update_id, position, public_component_id_snapshot
    `,
    args: [...sourceIds],
  })

  return result.rows.map((row) =>
    parseRow(incidentPublicReferenceRowSchema, row),
  )
}

async function readMaintenanceReferences(
  connection: DatabaseConnection,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return []

  const result = await connection.client.execute({
    sql: `
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
      WHERE maintenance_event_id IN (${placeholders(sourceIds)})
      ORDER BY maintenance_event_id, position, component_id
    `,
    args: [...sourceIds],
  })

  return result.rows.map((row) =>
    parseRow(maintenanceReferenceRowSchema, row),
  )
}

function mapStatusEntry(
  row: z.infer<typeof statusRowSchema>,
): OwnerStatusTimelineEntryDto {
  return {
    ...createBaseEntry("status_transition", row),
    kind: "component_status",
    sourceType: "status_transition",
    componentId: row.component_id,
    componentPublicId: row.component_public_id,
    ownerNameSnapshot: row.owner_name_snapshot,
    condition: row.condition,
    publicSummaryCandidate: row.public_summary,
    validUntil: row.valid_until,
  }
}

function mapIncidentEntry(
  row: z.infer<typeof incidentRowSchema>,
): OwnerIncidentTimelineEntryDto {
  const base = createBaseEntry("incident_update", row)

  return {
    ...base,
    kind: "incident",
    sourceType: "incident_update",
    incidentId: row.incident_id,
    incidentPublicId: row.incident_public_id,
    updateKind: row.update_kind,
    phase: row.phase,
    severity: row.severity,
    title: row.title,
    reason: row.reason,
    publicCandidate:
      row.public_title === null ||
      row.public_phase === null ||
      row.public_severity === null
        ? null
        : {
            title: row.public_title,
            phase: row.public_phase,
            severity: row.public_severity,
            summary: row.public_summary,
          },
    affectedComponents: [],
    publicAffectedComponents: [],
    publicDetailHref:
      row.detail_available === 1
        ? `/incidents/${encodeURIComponent(row.incident_public_id)}`
        : null,
  }
}

function mapMaintenanceEntry(
  row: z.infer<typeof maintenanceRowSchema>,
): OwnerMaintenanceTimelineEntryDto {
  return {
    ...createBaseEntry("maintenance_event", row),
    kind: "maintenance",
    sourceType: "maintenance_event",
    maintenanceWindowId: row.maintenance_window_id,
    maintenancePublicId: row.maintenance_public_id,
    eventKind: row.event_kind,
    phase: row.phase,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    publicCandidate:
      row.public_title === null ||
      row.public_phase === null ||
      row.public_starts_at === null ||
      row.public_ends_at === null ||
      row.public_timezone === null
        ? null
        : {
            title: row.public_title,
            phase: row.public_phase,
            summary: row.public_summary,
            startsAt: row.public_starts_at,
            endsAt: row.public_ends_at,
            timezone: row.public_timezone,
          },
    affectedComponents: [],
  }
}

async function attachReferences(
  connection: DatabaseConnection,
  entries: readonly OwnerTimelineEntryDto[],
) {
  const incidentIds = entries
    .filter(
      (entry): entry is OwnerIncidentTimelineEntryDto =>
        entry.kind === "incident",
    )
    .map((entry) => entry.sourceId)
  const maintenanceIds = entries
    .filter(
      (entry): entry is OwnerMaintenanceTimelineEntryDto =>
        entry.kind === "maintenance",
    )
    .map((entry) => entry.sourceId)
  const [incidentReferences, incidentPublicReferences, maintenanceReferences] =
    await Promise.all([
      readIncidentReferences(connection, incidentIds),
      readIncidentPublicReferences(connection, incidentIds),
      readMaintenanceReferences(connection, maintenanceIds),
    ])

  return entries.map<OwnerTimelineEntryDto>((entry) => {
    if (entry.kind === "incident") {
      return {
        ...entry,
        affectedComponents: incidentReferences
          .filter((reference) => reference.incident_update_id === entry.sourceId)
          .map((reference) => ({
            position: reference.position,
            componentId: reference.component_id,
            componentVersion: reference.component_version,
            componentRevisionId: reference.component_revision_id,
            ownerName: reference.owner_name_snapshot,
          })),
        publicAffectedComponents: incidentPublicReferences
          .filter((reference) => reference.incident_update_id === entry.sourceId)
          .map((reference) => ({
            position: reference.position,
            componentPublicId: reference.public_component_id_snapshot,
            name: reference.public_name_snapshot,
            componentMetadataPublicationVersion:
              reference.component_metadata_publication_version,
          })),
      }
    }

    if (entry.kind === "maintenance") {
      return {
        ...entry,
        affectedComponents: maintenanceReferences
          .filter(
            (reference) =>
              reference.maintenance_event_id === entry.sourceId,
          )
          .map((reference) => ({
            position: reference.position,
            componentId: reference.component_id,
            componentVersion: reference.component_version,
            componentRevisionId: reference.component_revision_id,
            ownerName: reference.owner_name_snapshot,
            publicSnapshot:
              reference.public_component_id_snapshot === null ||
              reference.public_name_snapshot === null ||
              reference.component_metadata_publication_version === null
                ? null
                : {
                    componentPublicId:
                      reference.public_component_id_snapshot,
                    name: reference.public_name_snapshot,
                    componentMetadataPublicationVersion:
                      reference.component_metadata_publication_version,
                  },
          })),
      }
    }

    return entry
  })
}

export async function readOwnerTimelinePage(
  connection: DatabaseConnection,
  input: ReadOwnerTimelinePageInput,
): Promise<OwnerTimelinePageDto> {
  const latestOwnerOrdinal = await readClock(connection)
  const cursor = input.cursor ?? null
  assertOwnerTimelinePageRequest({
    limit: input.limit,
    latestOwnerOrdinal,
    cursor,
  })
  const bounds = pageBounds({
    limit: input.limit,
    asOfOwnerOrdinal: cursor?.asOfOwnerOrdinal ?? latestOwnerOrdinal,
    lastOwnerOrdinal: cursor?.lastOwnerOrdinal ?? null,
  })
  const [statusRows, incidentRows, maintenanceRows] = await Promise.all([
    readStatusEntries(connection, bounds),
    readIncidentEntries(connection, bounds),
    readMaintenanceEntries(connection, bounds),
  ])
  const candidates: OwnerTimelineEntryDto[] = [
    ...statusRows.map(mapStatusEntry),
    ...incidentRows.map(mapIncidentEntry),
    ...maintenanceRows.map(mapMaintenanceEntry),
  ]
  const page = pageOwnerTimeline({
    entries: candidates,
    limit: input.limit,
    latestOwnerOrdinal,
    cursor,
  })

  return {
    entries: await attachReferences(connection, page.entries),
    nextCursor: page.nextCursor,
  }
}
