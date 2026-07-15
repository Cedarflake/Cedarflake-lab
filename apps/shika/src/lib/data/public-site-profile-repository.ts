import { z } from "zod"

import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  siteProfilePublicSnapshotSchema,
  type SiteProfilePublicSnapshot,
} from "@/lib/public/site-profile-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

const publicSiteProfileRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    target_source_type: z.literal("site_profile_revision"),
    target_source_id: z.uuid(),
    target_source_revision: z.number().int().positive().safe(),
    target_snapshot_json: z.string().nullable(),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_type: z.literal("site_profile_revision").nullable(),
    resulting_source_id: z.uuid().nullable(),
    resulting_source_revision: z.number().int().positive().safe().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
    snapshot_schema_version: z.literal(1),
  })
  .strict()
  .superRefine((row, context) => {
    const sourceFields = [
      row.resulting_source_type,
      row.resulting_source_id,
      row.resulting_source_revision,
      row.resulting_current_snapshot_json,
    ]

    if (
      row.resulting_disposition === "published" &&
      (row.action !== "publish" ||
        sourceFields.some((field) => field === null) ||
        row.target_snapshot_json === null ||
        row.resulting_source_id !== row.target_source_id ||
        row.resulting_source_revision !== row.target_source_revision)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_disposition"],
        message: "Published site profile source is incomplete",
      })
    }

    if (
      row.resulting_disposition === "closed" &&
      (row.action === "publish" ||
        sourceFields.some((field) => field !== null) ||
        (row.action === "suppress") !== (row.target_snapshot_json === null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_source_id"],
        message: "Closed site profile retains a public source",
      })
    }
  })

export class PublicSiteProfileDataIntegrityError extends Error {
  constructor() {
    super("Public site profile data is invalid")
    this.name = "PublicSiteProfileDataIntegrityError"
  }
}

function parseSnapshot(value: unknown) {
  return parseStoredJson(
    siteProfilePublicSnapshotSchema,
    value,
    () => new PublicSiteProfileDataIntegrityError(),
  )
}

export async function readPublicSiteProfile(
  connection: DatabaseConnection,
): Promise<SiteProfilePublicSnapshot | null> {
  const result = await connection.client.execute(`
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
      resulting_current_snapshot_json,
      snapshot_schema_version
    FROM publication_events
    WHERE stream_type = 'site_profile' AND stream_id = 'site'
    ORDER BY publication_version DESC, id DESC
    LIMIT 1
  `)
  const row = result.rows[0]
  if (!row) return null

  const parsed = publicSiteProfileRowSchema.safeParse(row)
  if (!parsed.success) throw new PublicSiteProfileDataIntegrityError()
  const data = parsed.data
  if (data.resulting_disposition === "closed") {
    if (data.target_snapshot_json !== null) parseSnapshot(data.target_snapshot_json)
    return null
  }

  const targetSnapshot = parseSnapshot(data.target_snapshot_json)
  const currentSnapshot = parseSnapshot(data.resulting_current_snapshot_json)
  if (JSON.stringify(targetSnapshot) !== JSON.stringify(currentSnapshot)) {
    throw new PublicSiteProfileDataIntegrityError()
  }

  return currentSnapshot
}
