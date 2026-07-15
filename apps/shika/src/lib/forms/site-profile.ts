import { z } from "zod"

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable()
const naturalNumber = z.number().int().nonnegative().safe()
const positiveNumber = z.number().int().positive().safe()

const publicDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    summary: nullableText(280),
  })
  .strict()

export const saveSiteProfileFormPayloadSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: naturalNumber,
    ownerTitle: z.string().trim().min(1).max(80),
    ownerSummary: nullableText(280),
    publicDraft: publicDraftSchema.nullable(),
    timezone: z.literal("Asia/Shanghai"),
    privateNote: nullableText(2_000),
  })
  .strict()

export const publishSiteProfileFormPayloadSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: positiveNumber,
    expectedPublicationVersion: naturalNumber,
    revisionId: z.uuid(),
    expectedRevisionVersion: positiveNumber,
    confirmation: z.literal("confirmed"),
  })
  .strict()

export const closeSiteProfilePublicationFormPayloadSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: positiveNumber,
    expectedPublicationVersion: positiveNumber,
    action: z.enum(["withdraw", "redact", "suppress"]),
    confirmation: z.literal("confirmed"),
  })
  .strict()

export type SaveSiteProfileFormPayload = z.infer<
  typeof saveSiteProfileFormPayloadSchema
>
export type PublishSiteProfileFormPayload = z.infer<
  typeof publishSiteProfileFormPayloadSchema
>
export type CloseSiteProfilePublicationFormPayload = z.infer<
  typeof closeSiteProfilePublicationFormPayloadSchema
>
export type SiteProfileTask = "edit" | "publish" | "privacy"
export type SiteProfilePrivacyAction =
  CloseSiteProfilePublicationFormPayload["action"]

export function toPublishSiteProfileCommand(rawPayload: unknown) {
  const payload = publishSiteProfileFormPayloadSchema.parse(rawPayload)

  return {
    idempotencyKey: payload.idempotencyKey,
    expectedSiteProfileVersion: payload.expectedSiteProfileVersion,
    expectedPublicationVersion: payload.expectedPublicationVersion,
    revisionId: payload.revisionId,
    expectedRevisionVersion: payload.expectedRevisionVersion,
  }
}

export function toCloseSiteProfilePublicationCommand(rawPayload: unknown) {
  const payload = closeSiteProfilePublicationFormPayloadSchema.parse(rawPayload)

  return {
    idempotencyKey: payload.idempotencyKey,
    expectedSiteProfileVersion: payload.expectedSiteProfileVersion,
    expectedPublicationVersion: payload.expectedPublicationVersion,
    action: payload.action,
  }
}

export function selectSiteProfilePrivacyAction(
  action: SiteProfilePrivacyAction,
) {
  return {
    action,
    isConfirmed: false,
  } as const
}

export function createSiteProfileAdminHref(
  task: SiteProfileTask,
  notice?: string,
) {
  const parameters = new URLSearchParams({ view: "settings" })
  if (notice) parameters.set("notice", notice)
  parameters.set("task", task)

  return `/admin?${parameters.toString()}`
}
