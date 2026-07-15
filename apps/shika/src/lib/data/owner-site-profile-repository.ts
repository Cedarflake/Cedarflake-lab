import { z } from "zod"

import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  siteProfilePublicSnapshotSchema,
  type SiteProfilePublicSnapshot,
} from "@/lib/public/site-profile-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

const ownerSiteProfileRowSchema = z
  .object({
    id: z.literal("site"),
    version: z.number().int().positive().safe(),
    created_at: z.number().int().nonnegative().safe(),
    updated_at: z.number().int().nonnegative().safe(),
    revision_id: z.uuid(),
    revision_site_profile_version: z.number().int().positive().safe(),
    owner_title: z.string().trim().min(1).max(80),
    owner_summary: z.string().max(280).nullable(),
    public_title: z.string().trim().min(1).max(80).nullable(),
    public_summary: z.string().max(280).nullable(),
    timezone: z.literal("Asia/Shanghai"),
    private_note: z.string().max(2_000).nullable(),
    revision_recorded_at: z.number().int().nonnegative().safe(),
    publication_version: z.number().int().positive().safe().nullable(),
    publication_action: publicationActionSchema.nullable(),
    resulting_disposition: z.enum(["published", "closed"]).nullable(),
    resulting_source_type: z.literal("site_profile_revision").nullable(),
    resulting_source_id: z.uuid().nullable(),
    resulting_source_revision: z.number().int().positive().safe().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
    publication_snapshot_schema_version: z.literal(1).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.updated_at < row.created_at ||
      row.revision_site_profile_version !== row.version ||
      row.revision_recorded_at > row.updated_at
    ) {
      context.addIssue({
        code: "custom",
        path: ["version"],
        message: "Site profile revision is not current",
      })
    }

    if (row.public_title === null && row.public_summary !== null) {
      context.addIssue({
        code: "custom",
        path: ["public_summary"],
        message: "Site profile public draft is incomplete",
      })
    }

    const publicationFields = [
      row.publication_version,
      row.publication_action,
      row.resulting_disposition,
      row.publication_snapshot_schema_version,
    ]
    const sourceFields = [
      row.resulting_source_type,
      row.resulting_source_id,
      row.resulting_source_revision,
      row.resulting_current_snapshot_json,
    ]
    const hasNoPublication = publicationFields.every((field) => field === null)
    const hasCompletePublication = publicationFields.every(
      (field) => field !== null,
    )

    if (!hasNoPublication && !hasCompletePublication) {
      context.addIssue({
        code: "custom",
        path: ["publication_version"],
        message: "Site profile publication state is incomplete",
      })
    }

    if (hasNoPublication && sourceFields.some((field) => field !== null)) {
      context.addIssue({
        code: "custom",
        path: ["resulting_source_id"],
        message: "Unpublished site profile has a public source",
      })
    }

    if (
      row.resulting_disposition === "published" &&
      (row.publication_action !== "publish" ||
        sourceFields.some((field) => field === null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_disposition"],
        message: "Published site profile source is incomplete",
      })
    }

    if (
      row.resulting_disposition === "closed" &&
      (row.publication_action === "publish" ||
        sourceFields.some((field) => field !== null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_source_id"],
        message: "Closed site profile retains a public source",
      })
    }

    if (
      row.resulting_source_revision !== null &&
      row.resulting_source_revision > row.version
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_source_revision"],
        message: "Site profile publication is ahead of the owner aggregate",
      })
    }
  })

export class OwnerSiteProfileDataIntegrityError extends Error {
  constructor() {
    super("Owner site profile data is invalid")
    this.name = "OwnerSiteProfileDataIntegrityError"
  }
}

export interface OwnerSiteProfileDto {
  siteProfileId: "site"
  version: number
  createdAt: number
  updatedAt: number
  revision: {
    revisionId: string
    siteProfileVersion: number
    ownerTitle: string
    ownerSummary: string | null
    publicDraft: {
      title: string
      summary: string | null
    } | null
    timezone: string
    privateNote: string | null
    recordedAt: number
  }
  publication: {
    version: number
    lastAction: z.infer<typeof publicationActionSchema> | null
    resultingDisposition: "private" | "published" | "closed"
    currentSource: {
      sourceId: string
      sourceRevision: number
      snapshot: SiteProfilePublicSnapshot
    } | null
  }
}

export async function readOwnerSiteProfile(
  connection: DatabaseConnection,
): Promise<OwnerSiteProfileDto | null> {
  const result = await connection.client.execute(`
    WITH latest_revision AS (
      SELECT *
      FROM site_profile_revisions
      WHERE site_profile_id = 'site'
      ORDER BY site_profile_version DESC, id DESC
      LIMIT 1
    ),
    latest_publication AS (
      SELECT *
      FROM publication_events
      WHERE stream_type = 'site_profile' AND stream_id = 'site'
      ORDER BY publication_version DESC, id DESC
      LIMIT 1
    )
    SELECT
      site_profile.id,
      site_profile.version,
      site_profile.created_at,
      site_profile.updated_at,
      latest_revision.id AS revision_id,
      latest_revision.site_profile_version AS revision_site_profile_version,
      latest_revision.owner_title,
      latest_revision.owner_summary,
      latest_revision.public_title,
      latest_revision.public_summary,
      latest_revision.timezone,
      latest_revision.private_note,
      latest_revision.recorded_at AS revision_recorded_at,
      latest_publication.publication_version,
      latest_publication.action AS publication_action,
      latest_publication.resulting_disposition,
      latest_publication.resulting_source_type,
      latest_publication.resulting_source_id,
      latest_publication.resulting_source_revision,
      latest_publication.resulting_current_snapshot_json,
      latest_publication.snapshot_schema_version AS publication_snapshot_schema_version
    FROM site_profile
    LEFT JOIN latest_revision ON latest_revision.site_profile_id = site_profile.id
    LEFT JOIN latest_publication ON latest_publication.stream_id = site_profile.id
    WHERE site_profile.id = 'site'
    LIMIT 1
  `)
  const row = result.rows[0]
  if (!row) return null

  const parsed = ownerSiteProfileRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerSiteProfileDataIntegrityError()

  const data = parsed.data
  const currentSource =
    data.resulting_disposition === "published" &&
    data.resulting_source_id !== null &&
    data.resulting_source_revision !== null &&
    data.resulting_current_snapshot_json !== null
      ? {
          sourceId: data.resulting_source_id,
          sourceRevision: data.resulting_source_revision,
          snapshot: parseStoredJson(
            siteProfilePublicSnapshotSchema,
            data.resulting_current_snapshot_json,
            () => new OwnerSiteProfileDataIntegrityError(),
          ),
        }
      : null

  return {
    siteProfileId: data.id,
    version: data.version,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    revision: {
      revisionId: data.revision_id,
      siteProfileVersion: data.revision_site_profile_version,
      ownerTitle: data.owner_title,
      ownerSummary: data.owner_summary,
      publicDraft:
        data.public_title === null
          ? null
          : {
              title: data.public_title,
              summary: data.public_summary,
            },
      timezone: data.timezone,
      privateNote: data.private_note,
      recordedAt: data.revision_recorded_at,
    },
    publication: {
      version: data.publication_version ?? 0,
      lastAction: data.publication_action,
      resultingDisposition: data.resulting_disposition ?? "private",
      currentSource,
    },
  }
}
