import { z } from "zod"

import { maintenancePhases } from "@/domain/maintenance"

export const maintenancePublicKinds = [
  "scheduled",
  "rescheduled",
  "started",
  "completed",
  "cancelled",
  "note",
] as const

export type MaintenancePublicKind = (typeof maintenancePublicKinds)[number]

export const maintenancePublicComponentSnapshotSchema = z
  .object({
    componentPublicId: z.string().uuid(),
    name: z.string().min(1).max(80),
  })
  .strict()

export const maintenancePublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    publicEntryId: z.string().uuid(),
    maintenancePublicId: z.string().uuid(),
    kind: z.enum(maintenancePublicKinds),
    phase: z.enum(maintenancePhases),
    title: z.string().min(1).max(120),
    summary: z.string().max(280).nullable(),
    startsAt: z.number().int().nonnegative().safe(),
    endsAt: z.number().int().nonnegative().safe(),
    timezone: z.string().min(1).max(80),
    effectiveAt: z.number().int().nonnegative().safe(),
    affectedComponents: z
      .array(maintenancePublicComponentSnapshotSchema)
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.startsAt >= snapshot.endsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be later than startsAt",
      })
    }

    const ids = new Set<string>()

    snapshot.affectedComponents.forEach((component, index) => {
      if (ids.has(component.componentPublicId)) {
        context.addIssue({
          code: "custom",
          path: ["affectedComponents", index, "componentPublicId"],
          message: "Affected components must be unique",
        })
      }

      ids.add(component.componentPublicId)
    })
  })

export type MaintenancePublicComponentSnapshot = z.infer<
  typeof maintenancePublicComponentSnapshotSchema
>
export type MaintenancePublicSnapshot = z.infer<
  typeof maintenancePublicSnapshotSchema
>

export function createMaintenancePublicSnapshot(
  snapshot: MaintenancePublicSnapshot,
) {
  return maintenancePublicSnapshotSchema.parse(snapshot)
}
