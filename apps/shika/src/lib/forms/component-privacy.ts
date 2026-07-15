import { z } from "zod"

const positiveNumber = z.number().int().positive().safe()
const naturalNumber = z.number().int().nonnegative().safe()

const parentGuardSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("incident"),
      incidentId: z.uuid(),
      expectedIncidentVersion: positiveNumber,
      expectedIncidentPublicationVersion: positiveNumber,
    })
    .strict(),
  z
    .object({
      kind: z.literal("maintenance"),
      maintenanceWindowId: z.uuid(),
      expectedMaintenanceVersion: positiveNumber,
      expectedMaintenancePublicationVersion: positiveNumber,
    })
    .strict(),
])

const relatedComponentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: positiveNumber,
    expectedComponentMetadataPublicationVersion: positiveNumber,
  })
  .strict()

const sharedFields = {
  idempotencyKey: z.uuid(),
  componentId: z.uuid(),
  expectedComponentVersion: positiveNumber,
  expectedMetadataPublicationVersion: positiveNumber,
  expectedStatusPublicationVersion: naturalNumber,
  dependentParents: z.array(parentGuardSchema).max(100),
  relatedComponents: z.array(relatedComponentGuardSchema).max(100),
  externalCopiesAcknowledged: z.literal("confirmed"),
}

const withdrawPayloadSchema = z
  .object({
    ...sharedFields,
    action: z.literal("withdraw"),
    ownerName: z.string().trim().min(1).max(80),
    confirmationName: z.null(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.dependentParents.length === 0 &&
      payload.relatedComponents.length === 0,
    {
      path: ["dependentParents"],
      message: "Withdrawal cannot include dependant privacy closures",
    },
  )

const privacyPayloadSchema = z
  .object({
    ...sharedFields,
    action: z.enum(["redact", "suppress"]),
    ownerName: z.string().trim().min(1).max(80),
    confirmationName: z.string().trim().min(1).max(80),
  })
  .strict()
  .refine((payload) => payload.confirmationName === payload.ownerName, {
    path: ["confirmationName"],
    message: "The confirmation name must match the component name",
  })

export const closeComponentPublicationFormPayloadSchema =
  z.discriminatedUnion("action", [withdrawPayloadSchema, privacyPayloadSchema])

export type CloseComponentPublicationFormPayload = z.infer<
  typeof closeComponentPublicationFormPayloadSchema
>
