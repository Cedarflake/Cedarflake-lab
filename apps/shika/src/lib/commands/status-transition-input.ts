import { z } from "zod"

import {
  assertValidStatusInterval,
  statusConditions,
} from "@/domain/status"

const timestampSchema = z.number().int().nonnegative().safe()
const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)

const privatePublicationSchema = z
  .object({ mode: z.literal("private") })
  .strict()

const publicPublicationSchema = z
  .object({
    mode: z.literal("public"),
    publicSummary: nullableText(280),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
    expectedStatusPublicationVersion: z
      .number()
      .int()
      .nonnegative()
      .safe(),
  })
  .strict()

export const statusTransitionPayloadSchema = z
  .object({
    condition: z.enum(statusConditions),
    validUntil: timestampSchema.nullable().default(null),
    ownerSummary: nullableText(280),
    privateNote: nullableText(2_000),
    publication: z.union([
      privatePublicationSchema,
      publicPublicationSchema,
    ]),
  })
  .strict()

export type StatusTransitionPayload = z.infer<
  typeof statusTransitionPayloadSchema
>

export function addStatusTransitionIntervalIssue(
  transition: Pick<StatusTransitionPayload, "validUntil">,
  effectiveAt: number,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
) {
  try {
    assertValidStatusInterval(effectiveAt, transition.validUntil)
  } catch {
    context.addIssue({
      code: "custom",
      path: [...path, "validUntil"],
      message: "validUntil must be later than effectiveAt",
    })
  }
}
