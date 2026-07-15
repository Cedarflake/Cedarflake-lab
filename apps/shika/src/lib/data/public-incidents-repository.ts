import { z } from "zod"

import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  incidentPublicSnapshotSchema,
  type IncidentPublicSnapshot,
} from "@/lib/public/incident-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

const publicationRowSchema = z
  .object({
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_current_snapshot_json: z.string().nullable(),
  })
  .strict()

const detailPublicationRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    target_source_id: z.string().min(1),
    target_source_revision: z.number().int().positive().safe(),
    target_snapshot_json: z.string().nullable(),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_id: z.string().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
    timeline_entry_id: z.string().nullable(),
    timeline_effective_at: z.number().int().nonnegative().safe().nullable(),
    timeline_recorded_at: z.number().int().nonnegative().safe().nullable(),
  })
  .strict()

export class PublicIncidentDataIntegrityError extends Error {
  constructor() {
    super("Published incident data is invalid")
    this.name = "PublicIncidentDataIntegrityError"
  }
}

export type PublicIncidentDto = IncidentPublicSnapshot

export interface PublicIncidentUpdateDto extends IncidentPublicSnapshot {
  recordedAt: number
}

export type PublicIncidentDetailDto =
  | {
      kind: "published"
      current: PublicIncidentDto
      updates: readonly PublicIncidentUpdateDto[]
    }
  | {
      kind: "redacted"
    }

interface PublicIncidentSourceState {
  sourceId: string
  sourceRevision: number
  firstPublicationVersion: number
  latestAction: "publish" | "withdraw" | "redact" | "suppress"
  snapshot: IncidentPublicSnapshot
  recordedAt: number
}

function parsePublicationRow(row: unknown) {
  const parsed = publicationRowSchema.safeParse(row)
  if (!parsed.success) throw new PublicIncidentDataIntegrityError()
  return parsed.data
}

function mapCurrentPublication(row: unknown): PublicIncidentDto | null {
  const publication = parsePublicationRow(row)

  if (publication.action !== "publish") {
    if (publication.resulting_disposition !== "closed") {
      throw new PublicIncidentDataIntegrityError()
    }

    return null
  }

  if (
    publication.resulting_disposition !== "published" ||
    publication.resulting_current_snapshot_json === null
  ) {
    throw new PublicIncidentDataIntegrityError()
  }

  return parseStoredJson(
    incidentPublicSnapshotSchema,
    publication.resulting_current_snapshot_json,
    () => new PublicIncidentDataIntegrityError(),
  )
}

async function readLatestIncidentPublications(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked AS (
      SELECT
        action,
        resulting_disposition,
        resulting_current_snapshot_json,
        row_number() OVER (
          PARTITION BY stream_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'incident'
    )
    SELECT action, resulting_disposition, resulting_current_snapshot_json
    FROM ranked
    WHERE rank = 1
  `)
}

export async function readPublicIncidentDiscovery(
  connection: DatabaseConnection,
): Promise<readonly PublicIncidentDto[]> {
  const result = await readLatestIncidentPublications(connection)
  const incidents = result.rows
    .map(mapCurrentPublication)
    .filter((incident): incident is PublicIncidentDto => incident !== null)

  const publicIds = new Set<string>()
  for (const incident of incidents) {
    if (publicIds.has(incident.incidentPublicId)) {
      throw new PublicIncidentDataIntegrityError()
    }
    publicIds.add(incident.incidentPublicId)
  }

  return incidents.toSorted(
    (left, right) =>
      right.effectiveAt - left.effectiveAt ||
      right.publicEntryId.localeCompare(left.publicEntryId),
  )
}

export async function readPublicActiveIncidents(
  connection: DatabaseConnection,
) {
  const incidents = await readPublicIncidentDiscovery(connection)
  return incidents.filter((incident) => incident.phase !== "resolved")
}

export async function readPublicIncidentDetail(
  connection: DatabaseConnection,
  incidentPublicId: string,
): Promise<PublicIncidentDetailDto | null> {
  const result = await connection.client.execute({
    sql: `
      SELECT
        publication_events.publication_version,
        publication_events.action,
        publication_events.target_source_id,
        publication_events.target_source_revision,
        publication_events.target_snapshot_json,
        publication_events.resulting_disposition,
        publication_events.resulting_source_id,
        publication_events.resulting_current_snapshot_json,
        publication_events.timeline_entry_id,
        publication_events.timeline_effective_at,
        publication_events.timeline_recorded_at
      FROM publication_events
      INNER JOIN incidents
        ON incidents.id = publication_events.stream_id
      WHERE publication_events.stream_type = 'incident'
        AND incidents.public_id = ?
      ORDER BY
        publication_events.publication_version,
        publication_events.id
    `,
    args: [incidentPublicId],
  })

  if (result.rows.length === 0) return null

  const rows = result.rows.map((row) => {
    const parsed = detailPublicationRowSchema.safeParse(row)
    if (!parsed.success) throw new PublicIncidentDataIntegrityError()
    return parsed.data
  })
  const sources = new Map<string, PublicIncidentSourceState>()

  for (const row of rows) {
    const existing = sources.get(row.target_source_id)

    if (row.action === "publish") {
      if (
        row.target_snapshot_json === null ||
        row.timeline_entry_id === null ||
        row.timeline_effective_at === null ||
        row.timeline_recorded_at === null
      ) {
        throw new PublicIncidentDataIntegrityError()
      }

      const snapshot = parseStoredJson(
        incidentPublicSnapshotSchema,
        row.target_snapshot_json,
        () => new PublicIncidentDataIntegrityError(),
      )
      if (
        snapshot.incidentPublicId !== incidentPublicId ||
        snapshot.publicEntryId !== row.timeline_entry_id ||
        snapshot.effectiveAt !== row.timeline_effective_at
      ) {
        throw new PublicIncidentDataIntegrityError()
      }

      if (existing) {
        if (
          existing.sourceRevision !== row.target_source_revision ||
          JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot)
        ) {
          throw new PublicIncidentDataIntegrityError()
        }
        existing.latestAction = "publish"
      } else {
        sources.set(row.target_source_id, {
          sourceId: row.target_source_id,
          sourceRevision: row.target_source_revision,
          firstPublicationVersion: row.publication_version,
          latestAction: "publish",
          snapshot,
          recordedAt: row.timeline_recorded_at,
        })
      }
      continue
    }

    if (
      !existing ||
      existing.sourceRevision !== row.target_source_revision
    ) {
      throw new PublicIncidentDataIntegrityError()
    }
    existing.latestAction = row.action
  }

  const latest = rows.at(-1)
  if (!latest || sources.size === 0) {
    throw new PublicIncidentDataIntegrityError()
  }

  const isClosed =
    latest.resulting_disposition === "closed" &&
    latest.resulting_source_id === null &&
    latest.resulting_current_snapshot_json === null

  if (latest.action === "withdraw") {
    if (!isClosed) throw new PublicIncidentDataIntegrityError()
    return null
  }

  if (latest.action === "redact") {
    if (
      !isClosed ||
      [...sources.values()].some((source) => source.latestAction !== "redact")
    ) {
      throw new PublicIncidentDataIntegrityError()
    }
    return { kind: "redacted" }
  }

  if (latest.action === "suppress") {
    if (
      !isClosed ||
      [...sources.values()].some((source) => source.latestAction !== "suppress")
    ) {
      throw new PublicIncidentDataIntegrityError()
    }
    return null
  }

  if (
    latest.resulting_disposition !== "published" ||
    latest.resulting_source_id === null ||
    latest.resulting_current_snapshot_json === null
  ) {
    throw new PublicIncidentDataIntegrityError()
  }

  const current = parseStoredJson(
    incidentPublicSnapshotSchema,
    latest.resulting_current_snapshot_json,
    () => new PublicIncidentDataIntegrityError(),
  )
  const currentSource = sources.get(latest.resulting_source_id)
  if (
    current.incidentPublicId !== incidentPublicId ||
    !currentSource ||
    currentSource.latestAction !== "publish" ||
    JSON.stringify(currentSource.snapshot) !== JSON.stringify(current)
  ) {
    throw new PublicIncidentDataIntegrityError()
  }

  const updates = [...sources.values()]
    .filter((source) => source.latestAction === "publish")
    .toSorted(
      (left, right) =>
        left.snapshot.effectiveAt - right.snapshot.effectiveAt ||
        left.recordedAt - right.recordedAt ||
        left.firstPublicationVersion - right.firstPublicationVersion ||
        left.snapshot.publicEntryId.localeCompare(right.snapshot.publicEntryId),
    )
    .map<PublicIncidentUpdateDto>((source) => ({
      ...source.snapshot,
      recordedAt: source.recordedAt,
    }))

  if (updates.length === 0) throw new PublicIncidentDataIntegrityError()

  return { kind: "published", current, updates }
}
