import { z } from "zod"

import { incidentPhases, incidentSeverities } from "@/domain/incidents"

export const incidentPublicComponentSnapshotSchema = z
  .object({
    componentPublicId: z.string().uuid(),
    name: z.string().min(1).max(80),
    position: z.number().int().nonnegative().safe(),
  })
  .strict()

export const incidentPublicSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    incidentPublicId: z.string().uuid(),
    publicEntryId: z.string().uuid(),
    title: z.string().min(1).max(120),
    phase: z.enum(incidentPhases),
    severity: z.enum(incidentSeverities),
    summary: z.string().max(1_000).nullable(),
    affectedComponents: z
      .array(incidentPublicComponentSnapshotSchema)
      .min(1)
      .max(100)
      .superRefine((components, context) => {
        const componentIds = new Set<string>()
        const positions = new Set<number>()

        for (const [index, component] of components.entries()) {
          if (componentIds.has(component.componentPublicId)) {
            context.addIssue({
              code: "custom",
              path: [index, "componentPublicId"],
              message: "Affected public components must be unique",
            })
          }

          if (positions.has(component.position)) {
            context.addIssue({
              code: "custom",
              path: [index, "position"],
              message: "Affected component positions must be unique",
            })
          }

          componentIds.add(component.componentPublicId)
          positions.add(component.position)
        }
      }),
    effectiveAt: z.number().int().nonnegative().safe(),
  })
  .strict()

export type IncidentPublicComponentSnapshot = z.infer<
  typeof incidentPublicComponentSnapshotSchema
>
export type IncidentPublicSnapshot = z.infer<
  typeof incidentPublicSnapshotSchema
>

export function createIncidentPublicSnapshot(
  snapshot: IncidentPublicSnapshot,
) {
  return incidentPublicSnapshotSchema.parse(snapshot)
}
