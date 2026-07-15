import { z } from "zod"

import { statusConditions } from "@/domain/status"

export const componentPublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    componentPublicId: z.string().uuid(),
    name: z.string().min(1).max(80),
    summary: z.string().max(280).nullable(),
    sortOrder: z.number().int().nonnegative().safe(),
  })
  .strict()

export const statusPublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    publicEntryId: z.string().uuid(),
    componentPublicId: z.string().uuid(),
    componentName: z.string().min(1).max(80),
    condition: z.enum(statusConditions),
    summary: z.string().max(280).nullable(),
    effectiveAt: z.number().int().nonnegative().safe(),
    validUntil: z.number().int().nonnegative().safe().nullable(),
  })
  .strict()

export type ComponentPublicSnapshot = z.infer<
  typeof componentPublicSnapshotSchema
>
export type StatusPublicSnapshot = z.infer<typeof statusPublicSnapshotSchema>

export function createComponentPublicSnapshot(
  snapshot: ComponentPublicSnapshot,
) {
  return componentPublicSnapshotSchema.parse(snapshot)
}

export function createStatusPublicSnapshot(snapshot: StatusPublicSnapshot) {
  return statusPublicSnapshotSchema.parse(snapshot)
}
