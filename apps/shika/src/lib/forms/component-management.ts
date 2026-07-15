import { z } from "zod"

import { statusConditions } from "@/domain/status"

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable()

const naturalNumber = z.number().int().nonnegative().safe()
const positiveNumber = z.number().int().positive().safe()

const componentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: positiveNumber,
    expectedMetadataPublicationVersion: naturalNumber,
  })
  .strict()

const publicDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    summary: nullableText(280),
    sortOrder: naturalNumber,
  })
  .strict()

export const saveComponentMetadataFormPayloadSchema = componentGuardSchema
  .extend({
    idempotencyKey: z.uuid(),
    ownerName: z.string().trim().min(1).max(80),
    ownerSummary: nullableText(280),
    ownerSortOrder: naturalNumber,
    defaultValidityMs: positiveNumber.nullable(),
    privateNote: nullableText(2_000),
    publicDraft: publicDraftSchema.nullable(),
  })
  .strict()

export const publishComponentFormPayloadSchema = componentGuardSchema
  .extend({
    idempotencyKey: z.uuid(),
    expectedStatusPublicationVersion: naturalNumber,
    startingReport: z
      .object({
        condition: z.enum(statusConditions),
        effectiveAt: naturalNumber,
        validUntil: naturalNumber.nullable(),
        ownerSummary: nullableText(280),
        publicSummary: nullableText(280),
        privateNote: nullableText(2_000),
      })
      .strict()
      .refine(
        (report) =>
          report.validUntil === null || report.validUntil > report.effectiveAt,
        {
          path: ["validUntil"],
          message: "validUntil must be later than effectiveAt",
        },
      ),
    confirmation: z.literal("confirmed"),
  })
  .strict()

const lifecycleFields = componentGuardSchema.extend({
  idempotencyKey: z.uuid(),
  expectedStatusPublicationVersion: naturalNumber,
})

export const changeComponentLifecycleFormPayloadSchema = z.discriminatedUnion(
  "operation",
  [
    lifecycleFields
      .extend({
        operation: z.literal("archive"),
        confirmation: z.literal("confirmed"),
      })
      .strict(),
    lifecycleFields
      .extend({
        operation: z.literal("unarchive"),
        confirmation: z.null(),
      })
      .strict(),
  ],
)

export type SaveComponentMetadataFormPayload = z.infer<
  typeof saveComponentMetadataFormPayloadSchema
>
export type PublishComponentFormPayload = z.infer<
  typeof publishComponentFormPayloadSchema
>
export type ChangeComponentLifecycleFormPayload = z.infer<
  typeof changeComponentLifecycleFormPayloadSchema
>

export function createComponentAdminRedirect(
  componentId: string,
  notice: string,
  task?: string,
) {
  const parameters = new URLSearchParams({
    view: "component",
    item: z.uuid().parse(componentId),
    notice,
  })
  if (task) parameters.set("task", task)

  return `/admin?${parameters.toString()}`
}

export function createStatusAdminRedirect(notice: string) {
  const parameters = new URLSearchParams({
    view: "status",
    notice,
  })

  return `/admin?${parameters.toString()}`
}
