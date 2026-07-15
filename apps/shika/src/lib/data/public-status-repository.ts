import { z } from "zod"

import {
  deriveOverallStatus,
  projectPublicStatus,
  type PublicDisposition,
  type PublicStatusTransitionCandidate,
  type StatusProjection,
} from "@/domain/status"
import type { DatabaseConnection } from "@/lib/db/create-database"
import { maintenancePublicSnapshotSchema } from "@/lib/public/maintenance-snapshots"
import {
  componentPublicSnapshotSchema,
  statusPublicSnapshotSchema,
  type ComponentPublicSnapshot,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

export class PublicDataIntegrityError extends Error {
  constructor() {
    super("Published data is invalid")
    this.name = "PublicDataIntegrityError"
  }
}

type WithoutSelectedTransition<T> = T extends StatusProjection
  ? Omit<T, "selectedTransitionId">
  : never

export type PublicStatusProjection = WithoutSelectedTransition<StatusProjection>

export interface PublicComponentStatusDto extends ComponentPublicSnapshot {
  status: PublicStatusProjection
  statusSummary: string | null
}

export interface PublicStatusPageDto {
  overall: ReturnType<typeof deriveOverallStatus>
  components: readonly PublicComponentStatusDto[]
  lastPublicChangeAt: number | null
}

interface PublicComponentRecord {
  internalId: string
  snapshot: ComponentPublicSnapshot
}

interface PublicStatusRecord {
  componentInternalId: string
  candidate: PublicStatusTransitionCandidate
  snapshot: StatusPublicSnapshot
}

const publicStatusSourceRowSchema = z
  .object({
    stream_id: z.string().uuid(),
    latest_action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    latest_source_revision: z.number().int().positive().safe(),
    latest_publication_version: z.number().int().positive().safe(),
    source_source_revision: z.number().int().positive().safe(),
    source_publication_version: z.number().int().positive().safe(),
    source_snapshot_json: z.string(),
    source_timeline_entry_id: z.string().uuid(),
    source_timeline_effective_at: z.number().int().nonnegative().safe(),
    source_timeline_recorded_at: z.number().int().nonnegative().safe(),
    source_timeline_snapshot_json: z.string(),
    source_snapshot_schema_version: z.number().int().positive().safe(),
    source_public_ordinal: z.number().int().positive().safe(),
    publish_count: z.number().int().positive().safe(),
  })
  .strict()

const publicChangeRowSchema = z
  .object({
    stream_type: z.enum([
      "site_profile",
      "component_metadata",
      "component_status",
      "incident",
      "maintenance",
    ]),
    action: z.enum(["publish", "withdraw", "redact"]),
    timeline_effective_at: z.number().int().nonnegative().safe(),
    timeline_snapshot_json: z.string(),
    snapshot_schema_version: z.number().int().positive().safe(),
    recorded_at: z.number().int().nonnegative().safe(),
  })
  .strict()

const publicMaintenanceHeadRowSchema = z
  .object({
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_current_snapshot_json: z.string().nullable(),
  })
  .strict()

const latestStreamChangeRowSchema = z
  .object({
    action: z.enum(["publish", "withdraw", "redact"]),
    recorded_at: z.number().int().nonnegative().safe(),
  })
  .strict()

async function readPublicComponents(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    WITH ranked AS (
      SELECT
        stream_id,
        resulting_disposition,
        resulting_current_snapshot_json,
        row_number() OVER (
          PARTITION BY stream_id
          ORDER BY publication_version DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'component_metadata'
    )
    SELECT stream_id, resulting_current_snapshot_json
    FROM ranked
    WHERE rank = 1 AND resulting_disposition = 'published'
  `)

  return result.rows.map<PublicComponentRecord>((row) => {
    const snapshot = parseStoredJson(
      componentPublicSnapshotSchema,
      row.resulting_current_snapshot_json,
      () => new PublicDataIntegrityError(),
    )

    return {
      internalId: String(row.stream_id),
      snapshot,
    }
  })
}

function actionToDisposition(action: unknown): PublicDisposition {
  switch (action) {
    case "publish":
      return "published"
    case "withdraw":
      return "withdrawn"
    case "redact":
      return "redacted"
    case "suppress":
      return "suppressed"
    default:
      throw new PublicDataIntegrityError()
  }
}

async function readPublicStatusRecords(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    WITH latest_actions AS (
      SELECT
        stream_id,
        target_source_id,
        target_source_revision,
        action,
        publication_version,
        row_number() OVER (
          PARTITION BY stream_id, target_source_id
          ORDER BY publication_version DESC, id DESC
        ) AS latest_rank
      FROM publication_events
      WHERE stream_type = 'component_status'
    ),
    published_sources AS (
      SELECT
        stream_id,
        target_source_id,
        target_source_revision,
        target_snapshot_json,
        timeline_entry_id,
        timeline_effective_at,
        timeline_recorded_at,
        timeline_snapshot_json,
        snapshot_schema_version,
        public_ordinal,
        publication_version,
        count(*) OVER (
          PARTITION BY stream_id, target_source_id
        ) AS publish_count,
        row_number() OVER (
          PARTITION BY stream_id, target_source_id
          ORDER BY publication_version ASC, id ASC
        ) AS publish_rank
      FROM publication_events
      WHERE stream_type = 'component_status' AND action = 'publish'
    )
    SELECT
      latest.stream_id,
      latest.action AS latest_action,
      latest.target_source_revision AS latest_source_revision,
      latest.publication_version AS latest_publication_version,
      source.target_source_revision AS source_source_revision,
      source.publication_version AS source_publication_version,
      source.target_snapshot_json AS source_snapshot_json,
      source.timeline_entry_id AS source_timeline_entry_id,
      source.timeline_effective_at AS source_timeline_effective_at,
      source.timeline_recorded_at AS source_timeline_recorded_at,
      source.timeline_snapshot_json AS source_timeline_snapshot_json,
      source.snapshot_schema_version AS source_snapshot_schema_version,
      source.public_ordinal AS source_public_ordinal,
      source.publish_count
    FROM latest_actions AS latest
    LEFT JOIN published_sources AS source
      ON source.stream_id = latest.stream_id
      AND source.target_source_id = latest.target_source_id
      AND source.publish_rank = 1
    WHERE latest.latest_rank = 1
  `)

  return result.rows.map<PublicStatusRecord>((rawRow) => {
    const result = publicStatusSourceRowSchema.safeParse(rawRow)
    if (!result.success) throw new PublicDataIntegrityError()
    const row = result.data
    const disposition = actionToDisposition(row.latest_action)
    const snapshot = parseStoredJson(
      statusPublicSnapshotSchema,
      row.source_snapshot_json,
      () => new PublicDataIntegrityError(),
    )
    const timelineSnapshot = parseStoredJson(
      statusPublicSnapshotSchema,
      row.source_timeline_snapshot_json,
      () => new PublicDataIntegrityError(),
    )

    if (
      row.publish_count !== 1 ||
      row.latest_source_revision !== row.source_source_revision ||
      row.latest_publication_version < row.source_publication_version ||
      snapshot.schemaVersion !== row.source_snapshot_schema_version ||
      snapshot.publicEntryId !== row.source_timeline_entry_id ||
      snapshot.effectiveAt !== row.source_timeline_effective_at ||
      snapshot.validUntil !== null &&
        snapshot.validUntil <= snapshot.effectiveAt ||
      JSON.stringify(snapshot) !== JSON.stringify(timelineSnapshot)
    ) {
      throw new PublicDataIntegrityError()
    }

    return {
      componentInternalId: String(row.stream_id),
      candidate: {
        id: snapshot.publicEntryId,
        condition: snapshot.condition,
        effectiveAt: snapshot.effectiveAt,
        validUntil: snapshot.validUntil,
        recordedAt: row.source_timeline_recorded_at,
        audienceOrdinal: row.source_public_ordinal,
        publicDisposition: disposition,
      },
      snapshot,
    }
  })
}

async function readLastPublicChangeAt(
  connection: DatabaseConnection,
  now: number,
) {
  const [timelineResult, streamResult] = await Promise.all([
    connection.client.execute(`
      WITH ranked_timeline_state AS (
        SELECT
          id,
          stream_type,
          target_source_type,
          target_source_id,
          action,
          timeline_entry_id,
          timeline_effective_at,
          timeline_snapshot_json,
          snapshot_schema_version,
          recorded_at,
          public_ordinal,
          publication_version,
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
        timeline.timeline_effective_at,
        timeline.timeline_snapshot_json,
        timeline.snapshot_schema_version,
        timeline.recorded_at
      FROM latest_timeline_state AS timeline
      LEFT JOIN latest_source_privacy AS privacy
        ON privacy.target_source_type = timeline.target_source_type
        AND privacy.target_source_id = timeline.target_source_id
      WHERE timeline.action != 'suppress'
        AND timeline.timeline_snapshot_json IS NOT NULL
        AND (
          privacy.id IS NULL
          OR (privacy.action = 'redact' AND privacy.id = timeline.id)
        )
    `),
    connection.client.execute(`
      WITH ranked AS (
        SELECT
          action,
          recorded_at,
          row_number() OVER (
            PARTITION BY stream_type, stream_id
            ORDER BY publication_version DESC, id DESC
          ) AS rank
        FROM publication_events
      )
      SELECT action, recorded_at
      FROM ranked
      WHERE rank = 1 AND action != 'suppress'
    `),
  ])
  const candidates: number[] = []

  for (const rawRow of timelineResult.rows) {
    const result = publicChangeRowSchema.safeParse(rawRow)
    if (!result.success) throw new PublicDataIntegrityError()
    const row = result.data

    if (row.timeline_effective_at <= now) {
      candidates.push(row.timeline_effective_at)
    }
    if (row.recorded_at <= now) candidates.push(row.recorded_at)

    if (row.stream_type === "component_status" && row.action === "publish") {
      const snapshot = parseStoredJson(
        statusPublicSnapshotSchema,
        row.timeline_snapshot_json,
        () => new PublicDataIntegrityError(),
      )
      if (
        snapshot.schemaVersion !== row.snapshot_schema_version ||
        snapshot.effectiveAt !== row.timeline_effective_at
      ) {
        throw new PublicDataIntegrityError()
      }
      if (snapshot.validUntil !== null && snapshot.validUntil <= now) {
        candidates.push(snapshot.validUntil)
      }
    }
  }

  for (const rawRow of streamResult.rows) {
    const result = latestStreamChangeRowSchema.safeParse(rawRow)
    if (!result.success) throw new PublicDataIntegrityError()
    if (result.data.recorded_at <= now) {
      candidates.push(result.data.recorded_at)
    }
  }

  return candidates.reduce<number | null>(
    (latest, candidate) =>
      latest === null || candidate > latest ? candidate : latest,
    null,
  )
}

async function readHasActiveMaintenance(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    WITH ranked_publications AS (
      SELECT
        action,
        resulting_disposition,
        resulting_current_snapshot_json,
        row_number() OVER (
          PARTITION BY stream_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'maintenance'
    )
    SELECT
      action,
      resulting_disposition,
      resulting_current_snapshot_json
    FROM ranked_publications
    WHERE rank = 1
  `)

  return result.rows.some((rawRow) => {
    const row = publicMaintenanceHeadRowSchema.safeParse(rawRow)
    if (!row.success) throw new PublicDataIntegrityError()

    if (row.data.action !== "publish") {
      if (
        row.data.resulting_disposition !== "closed" ||
        row.data.resulting_current_snapshot_json !== null
      ) {
        throw new PublicDataIntegrityError()
      }

      return false
    }

    if (
      row.data.resulting_disposition !== "published" ||
      row.data.resulting_current_snapshot_json === null
    ) {
      throw new PublicDataIntegrityError()
    }

    const snapshot = parseStoredJson(
      maintenancePublicSnapshotSchema,
      row.data.resulting_current_snapshot_json,
      () => new PublicDataIntegrityError(),
    )

    return snapshot.phase === "in_progress"
  })
}

function createPublicProjection(
  projection: StatusProjection,
): PublicStatusProjection {
  if (projection.unknownReason === "suppressed") {
    return {
      condition: "unknown",
      effectiveAt: null,
      validUntil: null,
      unknownReason: "not_reported",
    }
  }

  if (projection.condition === "unknown") {
    return {
      condition: projection.condition,
      effectiveAt: projection.effectiveAt,
      validUntil: projection.validUntil,
      unknownReason: projection.unknownReason,
    }
  }

  return {
    condition: projection.condition,
    effectiveAt: projection.effectiveAt,
    validUntil: projection.validUntil,
    unknownReason: projection.unknownReason,
  }
}

export async function readPublicStatusPage(
  connection: DatabaseConnection,
  now: number,
): Promise<PublicStatusPageDto> {
  const [
    componentRecords,
    statusRecords,
    lastPublicChangeAt,
    hasActiveMaintenance,
  ] = await Promise.all([
    readPublicComponents(connection),
    readPublicStatusRecords(connection),
    readLastPublicChangeAt(connection, now),
    readHasActiveMaintenance(connection),
  ])
  const projections: StatusProjection[] = []
  const components = componentRecords
    .map<PublicComponentStatusDto>((component) => {
      const records = statusRecords.filter(
        (status) => status.componentInternalId === component.internalId,
      )
      if (
        records.some(
          (record) =>
            record.snapshot.componentPublicId !==
            component.snapshot.componentPublicId,
        )
      ) {
        throw new PublicDataIntegrityError()
      }
      const projection = projectPublicStatus(
        records.map((record) => record.candidate),
        now,
      )
      projections.push(projection)
      const selected = records.find(
        (record) => record.candidate.id === projection.selectedTransitionId,
      )
      const publicProjection = createPublicProjection(projection)

      return {
        ...component.snapshot,
        status: publicProjection,
        statusSummary:
          projection.condition === "unknown"
            ? null
            : selected?.snapshot.summary ?? null,
      }
    })
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.componentPublicId.localeCompare(right.componentPublicId),
    )

  return {
    components,
    overall: deriveOverallStatus(projections, hasActiveMaintenance),
    lastPublicChangeAt,
  }
}
