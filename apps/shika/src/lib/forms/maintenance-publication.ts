import { z } from "zod"

const naturalNumber = z.number().int().nonnegative().safe()
const positiveNumber = z.number().int().positive().safe()
const publicComponentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: positiveNumber,
    expectedComponentMetadataPublicationVersion: positiveNumber,
  })
  .strict()

export const publishMaintenanceFormPayloadSchema = z
  .object({
    idempotencyKey: z.uuid(),
    maintenanceWindowId: z.uuid(),
    expectedMaintenanceVersion: positiveNumber,
    expectedMaintenancePublicationVersion: naturalNumber,
    effectiveAt: naturalNumber,
    publicTitle: z.string().trim().min(1).max(120),
    publicSummary: z.string().trim().max(280).nullable(),
    publicStartsAt: naturalNumber,
    publicEndsAt: naturalNumber,
    publicTimezone: z.string().trim().min(1).max(80),
    affectedComponents: z.array(publicComponentGuardSchema).min(1).max(50),
    confirmation: z.literal("confirmed"),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.publicStartsAt >= payload.publicEndsAt) {
      context.addIssue({
        code: "custom",
        path: ["publicEndsAt"],
        message: "Public maintenance must end after it starts",
      })
    }

    const componentIds = new Set<string>()
    payload.affectedComponents.forEach((component, index) => {
      if (componentIds.has(component.componentId)) {
        context.addIssue({
          code: "custom",
          path: ["affectedComponents", index, "componentId"],
          message: "Affected components must be unique",
        })
      }

      componentIds.add(component.componentId)
    })
  })

export type PublishMaintenanceFormPayload = z.infer<
  typeof publishMaintenanceFormPayloadSchema
>

export function toPublishMaintenanceCommand(rawPayload: unknown) {
  const payload = publishMaintenanceFormPayloadSchema.parse(rawPayload)

  return {
    idempotencyKey: payload.idempotencyKey,
    maintenanceWindowId: payload.maintenanceWindowId,
    expectedMaintenanceVersion: payload.expectedMaintenanceVersion,
    expectedMaintenancePublicationVersion:
      payload.expectedMaintenancePublicationVersion,
    effectiveAt: payload.effectiveAt,
    publicTitle: payload.publicTitle,
    publicSummary: payload.publicSummary,
    publicStartsAt: payload.publicStartsAt,
    publicEndsAt: payload.publicEndsAt,
    publicTimezone: payload.publicTimezone,
    affectedComponents: payload.affectedComponents,
  }
}

export function createMaintenancePublicationAdminHref(
  maintenanceWindowId: string,
  notice?: string,
) {
  const parameters = new URLSearchParams({
    view: "maintenance",
    item: maintenanceWindowId,
    task: "publish",
  })
  if (notice) parameters.set("notice", notice)

  return `/admin?${parameters.toString()}`
}
