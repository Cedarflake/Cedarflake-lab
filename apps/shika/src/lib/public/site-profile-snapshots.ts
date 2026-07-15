import { z } from "zod"

export const siteProfilePublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(80),
    summary: z.string().max(280).nullable(),
    timezone: z.literal("Asia/Shanghai"),
  })
  .strict()

export type SiteProfilePublicSnapshot = z.infer<
  typeof siteProfilePublicSnapshotSchema
>

export function createSiteProfilePublicSnapshot(
  snapshot: SiteProfilePublicSnapshot,
) {
  return siteProfilePublicSnapshotSchema.parse(snapshot)
}
