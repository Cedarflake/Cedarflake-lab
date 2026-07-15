import { z } from "zod"

import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  maintenancePublicSnapshotSchema,
  type MaintenancePublicComponentSnapshot,
} from "@/lib/public/maintenance-snapshots"

const publicationRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_current_snapshot_json: z.string().nullable(),
  })
  .strict()

export class PublicMaintenanceDataIntegrityError extends Error {
  constructor() {
    super("Published maintenance data is invalid")
    this.name = "PublicMaintenanceDataIntegrityError"
  }
}

export interface PublicMaintenanceWindowDto {
  maintenancePublicId: string
  latestKind:
    | "scheduled"
    | "rescheduled"
    | "started"
    | "completed"
    | "cancelled"
    | "note"
  phase: "scheduled" | "in_progress"
  title: string
  summary: string | null
  startsAt: number
  endsAt: number
  timezone: string
  effectiveAt: number
  affectedComponents: readonly MaintenancePublicComponentSnapshot[]
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new PublicMaintenanceDataIntegrityError()
  }
}

function parseRow(row: unknown) {
  const parsed = publicationRowSchema.safeParse(row)
  if (!parsed.success) throw new PublicMaintenanceDataIntegrityError()
  return parsed.data
}

export async function readPublicMaintenanceWindows(
  connection: DatabaseConnection,
): Promise<readonly PublicMaintenanceWindowDto[]> {
  const result = await connection.client.execute(`
    WITH ranked_publications AS (
      SELECT
        publication_version,
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
      publication_version,
      action,
      resulting_disposition,
      resulting_current_snapshot_json
    FROM ranked_publications
    WHERE rank = 1
  `)

  const windows: PublicMaintenanceWindowDto[] = []

  for (const rawRow of result.rows) {
    const row = parseRow(rawRow)

    if (row.action !== "publish") {
      if (
        row.resulting_disposition !== "closed" ||
        row.resulting_current_snapshot_json !== null
      ) {
        throw new PublicMaintenanceDataIntegrityError()
      }

      continue
    }

    if (
      row.resulting_disposition !== "published" ||
      row.resulting_current_snapshot_json === null
    ) {
      throw new PublicMaintenanceDataIntegrityError()
    }

    const snapshot = maintenancePublicSnapshotSchema.safeParse(
      parseJson(row.resulting_current_snapshot_json),
    )

    if (!snapshot.success) throw new PublicMaintenanceDataIntegrityError()
    if (
      snapshot.data.phase !== "scheduled" &&
      snapshot.data.phase !== "in_progress"
    ) {
      continue
    }

    windows.push({
      maintenancePublicId: snapshot.data.maintenancePublicId,
      latestKind: snapshot.data.kind,
      phase: snapshot.data.phase,
      title: snapshot.data.title,
      summary: snapshot.data.summary,
      startsAt: snapshot.data.startsAt,
      endsAt: snapshot.data.endsAt,
      timezone: snapshot.data.timezone,
      effectiveAt: snapshot.data.effectiveAt,
      affectedComponents: snapshot.data.affectedComponents,
    })
  }

  return windows.toSorted(
    (left, right) =>
      Number(left.phase !== "in_progress") -
        Number(right.phase !== "in_progress") ||
      left.startsAt - right.startsAt ||
      left.maintenancePublicId.localeCompare(right.maintenancePublicId),
  )
}
