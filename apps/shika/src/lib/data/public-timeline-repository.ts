import { z } from "zod"

import type { PublicTimelineCursor } from "@/domain/timeline"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  componentStatusTimelineSnapshotSchema,
  incidentTimelineSnapshotSchema,
  maintenanceTimelineSnapshotSchema,
  redactedTimelineSnapshotSchema,
  type IncidentTimelineSnapshot,
  type MaintenanceTimelineSnapshot,
  withdrawnTimelineSnapshotSchema,
} from "@/lib/public/timeline-snapshots"
import type { PublicCursorCodec } from "@/lib/timeline/public-cursor"

const MAXIMUM_PAGE_SIZE = 100

const nonnegativeSafeInteger = z.number().int().nonnegative().safe()
const clockRowSchema = z
  .object({
    public_ordinal: nonnegativeSafeInteger,
    public_privacy_epoch: nonnegativeSafeInteger,
  })
  .strict()

const timelineRowSchema = z
  .object({
    stream_type: z.enum([
      "site_profile",
      "component_metadata",
      "component_status",
      "incident",
      "maintenance",
    ]),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    timeline_entry_id: z.string().min(1).max(256),
    timeline_effective_at: nonnegativeSafeInteger,
    timeline_recorded_at: nonnegativeSafeInteger,
    timeline_snapshot_json: z.string(),
    snapshot_schema_version: z.number().int().positive().safe(),
    public_ordinal: z.number().int().positive().safe(),
    incident_detail_available: z.union([z.literal(0), z.literal(1)]),
  })
  .strict()

type TimelineRow = z.infer<typeof timelineRowSchema>

interface PublicTimelineEntryBase {
  schemaVersion: 1
  publicEntryId: string
  publicOrdinal: number
  effectiveAt: number
  recordedAt: number
}

export interface PublicComponentStatusTimelineEntry
  extends PublicTimelineEntryBase {
  kind: "component_status"
  componentPublicId: string
  componentName: string
  condition: "available" | "limited" | "degraded" | "unavailable"
  summary: string | null
  validUntil: number | null
}

export interface PublicIncidentTimelineEntry extends PublicTimelineEntryBase {
  kind: "incident"
  detailAvailable: boolean
  incidentPublicId: string
  title: string
  phase: IncidentTimelineSnapshot["phase"]
  severity: IncidentTimelineSnapshot["severity"]
  summary: string | null
  affectedComponents: IncidentTimelineSnapshot["affectedComponents"]
}

export interface PublicMaintenanceTimelineEntry
  extends PublicTimelineEntryBase {
  kind: "maintenance"
  maintenancePublicId: string
  maintenanceKind: MaintenanceTimelineSnapshot["kind"]
  phase: MaintenanceTimelineSnapshot["phase"]
  title: string
  summary: string | null
  startsAt: number
  endsAt: number
  timezone: string
  affectedComponents: MaintenanceTimelineSnapshot["affectedComponents"]
}

export interface PublicRedactedTimelineEntry extends PublicTimelineEntryBase {
  kind: "redacted"
}

export interface PublicWithdrawnTimelineEntry extends PublicTimelineEntryBase {
  kind: "withdrawn"
}

export type PublicTimelineEntryDto =
  | PublicComponentStatusTimelineEntry
  | PublicIncidentTimelineEntry
  | PublicMaintenanceTimelineEntry
  | PublicRedactedTimelineEntry
  | PublicWithdrawnTimelineEntry

export type PublicTimelinePageDto =
  | {
      kind: "page"
      entries: readonly PublicTimelineEntryDto[]
      nextCursor: string | null
    }
  | {
      kind: "reset"
      entries: readonly []
      nextCursor: null
    }

export interface ReadPublicTimelinePageInput {
  limit: number
  cursor?: string | null
  cursorCodec: PublicCursorCodec
}

export class PublicTimelineDataIntegrityError extends Error {
  constructor() {
    super("Published timeline data is invalid")
    this.name = "PublicTimelineDataIntegrityError"
  }
}

export class PublicTimelineRequestError extends Error {
  constructor() {
    super("Public timeline request is invalid")
    this.name = "PublicTimelineRequestError"
  }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new PublicTimelineDataIntegrityError()
  }
}

function parseClockRow(row: unknown) {
  const result = clockRowSchema.safeParse(row)
  if (!result.success) throw new PublicTimelineDataIntegrityError()
  return result.data
}

function parseTimelineRow(row: unknown) {
  const result = timelineRowSchema.safeParse(row)
  if (!result.success) throw new PublicTimelineDataIntegrityError()
  return result.data
}

function assertValidPageRequest(
  limit: number,
  cursor: PublicTimelineCursor | null,
  latestPublicOrdinal: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_PAGE_SIZE) {
    throw new PublicTimelineRequestError()
  }

  if (!cursor) return

  const last = cursor.last
  const isValid =
    cursor.version === 1 &&
    Number.isSafeInteger(cursor.asOfPublicOrdinal) &&
    cursor.asOfPublicOrdinal >= 0 &&
    cursor.asOfPublicOrdinal <= latestPublicOrdinal &&
    Number.isSafeInteger(cursor.privacyEpoch) &&
    cursor.privacyEpoch >= 0 &&
    (last === null ||
      (Number.isSafeInteger(last.effectiveAt) &&
        last.effectiveAt >= 0 &&
        Number.isSafeInteger(last.recordedAt) &&
        last.recordedAt >= 0 &&
        Number.isSafeInteger(last.publicOrdinal) &&
        last.publicOrdinal > 0 &&
        last.publicOrdinal <= cursor.asOfPublicOrdinal &&
        last.publicEntryId.length > 0 &&
        last.publicEntryId.length <= 256))

  if (!isValid) throw new PublicTimelineRequestError()
}

function baseEntry(row: TimelineRow): PublicTimelineEntryBase {
  return {
    schemaVersion: 1,
    publicEntryId: row.timeline_entry_id,
    publicOrdinal: row.public_ordinal,
    effectiveAt: row.timeline_effective_at,
    recordedAt: row.timeline_recorded_at,
  }
}

function mapTimelineRow(row: TimelineRow): PublicTimelineEntryDto {
  const snapshot = parseJson(row.timeline_snapshot_json)

  if (row.action === "redact") {
    const result = redactedTimelineSnapshotSchema.safeParse(snapshot)
    if (
      !result.success ||
      result.data.schemaVersion !== row.snapshot_schema_version ||
      result.data.publicEntryId !== row.timeline_entry_id
    ) {
      throw new PublicTimelineDataIntegrityError()
    }

    return { ...baseEntry(row), kind: "redacted" }
  }

  if (row.action === "withdraw") {
    const result = withdrawnTimelineSnapshotSchema.safeParse(snapshot)
    if (
      !result.success ||
      result.data.schemaVersion !== row.snapshot_schema_version ||
      result.data.publicEntryId !== row.timeline_entry_id
    ) {
      throw new PublicTimelineDataIntegrityError()
    }

    return { ...baseEntry(row), kind: "withdrawn" }
  }

  if (row.action !== "publish") {
    throw new PublicTimelineDataIntegrityError()
  }

  if (row.stream_type === "component_status") {
    const result = componentStatusTimelineSnapshotSchema.safeParse(snapshot)
    if (
      !result.success ||
      result.data.schemaVersion !== row.snapshot_schema_version ||
      result.data.publicEntryId !== row.timeline_entry_id ||
      result.data.effectiveAt !== row.timeline_effective_at
    ) {
      throw new PublicTimelineDataIntegrityError()
    }

    return {
      ...baseEntry(row),
      kind: "component_status",
      componentPublicId: result.data.componentPublicId,
      componentName: result.data.componentName,
      condition: result.data.condition,
      summary: result.data.summary,
      validUntil: result.data.validUntil,
    }
  }

  if (row.stream_type === "incident") {
    const result = incidentTimelineSnapshotSchema.safeParse(snapshot)
    if (
      !result.success ||
      result.data.schemaVersion !== row.snapshot_schema_version ||
      result.data.publicEntryId !== row.timeline_entry_id ||
      result.data.effectiveAt !== row.timeline_effective_at
    ) {
      throw new PublicTimelineDataIntegrityError()
    }

    return {
      ...baseEntry(row),
      kind: "incident",
      detailAvailable: row.incident_detail_available === 1,
      incidentPublicId: result.data.incidentPublicId,
      title: result.data.title,
      phase: result.data.phase,
      severity: result.data.severity,
      summary: result.data.summary,
      affectedComponents: result.data.affectedComponents,
    }
  }

  if (row.stream_type === "maintenance") {
    const result = maintenanceTimelineSnapshotSchema.safeParse(snapshot)
    if (
      !result.success ||
      result.data.schemaVersion !== row.snapshot_schema_version ||
      result.data.publicEntryId !== row.timeline_entry_id ||
      result.data.effectiveAt !== row.timeline_effective_at
    ) {
      throw new PublicTimelineDataIntegrityError()
    }

    return {
      ...baseEntry(row),
      kind: "maintenance",
      maintenancePublicId: result.data.maintenancePublicId,
      maintenanceKind: result.data.kind,
      phase: result.data.phase,
      title: result.data.title,
      summary: result.data.summary,
      startsAt: result.data.startsAt,
      endsAt: result.data.endsAt,
      timezone: result.data.timezone,
      affectedComponents: result.data.affectedComponents,
    }
  }

  throw new PublicTimelineDataIntegrityError()
}

function createNextCursor(
  cursorCodec: PublicCursorCodec,
  asOfPublicOrdinal: number,
  privacyEpoch: number,
  last: PublicTimelineEntryDto,
) {
  return cursorCodec.encode({
    version: 1,
    asOfPublicOrdinal,
    privacyEpoch,
    last: {
      effectiveAt: last.effectiveAt,
      recordedAt: last.recordedAt,
      publicOrdinal: last.publicOrdinal,
      publicEntryId: last.publicEntryId,
    },
  })
}

export async function readPublicTimelinePage(
  connection: DatabaseConnection,
  input: ReadPublicTimelinePageInput,
): Promise<PublicTimelinePageDto> {
  const clockResult = await connection.client.execute(
    "SELECT public_ordinal, public_privacy_epoch FROM timeline_clock WHERE id = 1",
  )
  const clock = parseClockRow(clockResult.rows[0])
  const encodedCursor = input.cursor ?? null
  const cursor =
    encodedCursor === null ? null : input.cursorCodec.decode(encodedCursor)

  assertValidPageRequest(input.limit, cursor, clock.public_ordinal)

  if (cursor && cursor.privacyEpoch !== clock.public_privacy_epoch) {
    return { kind: "reset", entries: [], nextCursor: null }
  }

  const asOfPublicOrdinal = cursor?.asOfPublicOrdinal ?? clock.public_ordinal
  const last = cursor?.last ?? null
  const seekClause = last
    ? `
      AND (
        timeline.timeline_effective_at < ?
        OR (
          timeline.timeline_effective_at = ?
          AND timeline.timeline_recorded_at < ?
        )
        OR (
          timeline.timeline_effective_at = ?
          AND timeline.timeline_recorded_at = ?
          AND timeline.public_ordinal < ?
        )
        OR (
          timeline.timeline_effective_at = ?
          AND timeline.timeline_recorded_at = ?
          AND timeline.public_ordinal = ?
          AND timeline.timeline_entry_id < ?
        )
      )
    `
    : ""
  const args: Array<number | string> = [asOfPublicOrdinal]

  if (last) {
    args.push(
      last.effectiveAt,
      last.effectiveAt,
      last.recordedAt,
      last.effectiveAt,
      last.recordedAt,
      last.publicOrdinal,
      last.effectiveAt,
      last.recordedAt,
      last.publicOrdinal,
      last.publicEntryId,
    )
  }

  args.push(input.limit + 1)

  const result = await connection.client.execute({
    sql: `
      WITH ranked_timeline_state AS (
        SELECT
          id,
          stream_type,
          stream_id,
          target_source_type,
          target_source_id,
          action,
          timeline_entry_id,
          timeline_effective_at,
          timeline_recorded_at,
          timeline_snapshot_json,
          snapshot_schema_version,
          public_ordinal,
          row_number() OVER (
            PARTITION BY timeline_entry_id
            ORDER BY public_ordinal DESC, publication_version DESC, id DESC
          ) AS closure_rank
        FROM publication_events
        WHERE timeline_entry_id IS NOT NULL
      ),
      latest_timeline_state AS (
        SELECT *
        FROM ranked_timeline_state
        WHERE closure_rank = 1
      ),
      ranked_stream_state AS (
        SELECT
          stream_type,
          stream_id,
          action,
          resulting_disposition,
          row_number() OVER (
            PARTITION BY stream_type, stream_id
            ORDER BY publication_version DESC, id DESC
          ) AS stream_rank
        FROM publication_events
      ),
      latest_stream_state AS (
        SELECT *
        FROM ranked_stream_state
        WHERE stream_rank = 1
      ),
      ranked_source_privacy AS (
        SELECT
          id,
          target_source_type,
          target_source_id,
          action,
          row_number() OVER (
            PARTITION BY target_source_type, target_source_id
            ORDER BY public_ordinal DESC, publication_version DESC, id DESC
          ) AS privacy_rank
        FROM publication_events
        WHERE action IN ('redact', 'suppress')
      ),
      latest_source_privacy AS (
        SELECT *
        FROM ranked_source_privacy
        WHERE privacy_rank = 1
      )
      SELECT
        timeline.stream_type,
        timeline.action,
        timeline.timeline_entry_id,
        timeline.timeline_effective_at,
        timeline.timeline_recorded_at,
        timeline.timeline_snapshot_json,
        timeline.snapshot_schema_version,
        timeline.public_ordinal,
        CASE
          WHEN timeline.stream_type = 'incident'
            AND stream.action = 'publish'
            AND stream.resulting_disposition = 'published'
          THEN 1
          ELSE 0
        END AS incident_detail_available
      FROM latest_timeline_state AS timeline
      LEFT JOIN latest_stream_state AS stream
        ON stream.stream_type = timeline.stream_type
        AND stream.stream_id = timeline.stream_id
      LEFT JOIN latest_source_privacy AS privacy
        ON privacy.target_source_type = timeline.target_source_type
        AND privacy.target_source_id = timeline.target_source_id
      WHERE timeline.public_ordinal <= ?
        AND timeline.action != 'suppress'
        AND timeline.timeline_snapshot_json IS NOT NULL
        AND (
          privacy.id IS NULL
          OR (privacy.action = 'redact' AND privacy.id = timeline.id)
        )
        ${seekClause}
      ORDER BY
        timeline.timeline_effective_at DESC,
        timeline.timeline_recorded_at DESC,
        timeline.public_ordinal DESC,
        timeline.timeline_entry_id DESC
      LIMIT ?
    `,
    args,
  })
  const rows = result.rows.map(parseTimelineRow)
  const hasMore = rows.length > input.limit
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows
  const entries = pageRows.map(mapTimelineRow)
  const finalEntry = entries.at(-1)

  return {
    kind: "page",
    entries,
    nextCursor:
      hasMore && finalEntry
        ? createNextCursor(
            input.cursorCodec,
            asOfPublicOrdinal,
            clock.public_privacy_epoch,
            finalEntry,
          )
        : null,
  }
}
