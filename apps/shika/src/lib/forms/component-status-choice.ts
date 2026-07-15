import { z } from "zod"

import { statusConditions } from "@/domain/status"

import { FormDataFieldError } from "./form-data"

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === "" ? null : value))

const validityMinutesSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().int().positive().max(525_600).nullable())

const choiceGuardFields = {
  componentId: z.uuid(),
  expectedComponentVersion: z.number().int().positive().safe(),
  expectedComponentMetadataPublicationVersion: z
    .number()
    .int()
    .nonnegative()
    .safe(),
  expectedStatusPublicationVersion: z
    .number()
    .int()
    .nonnegative()
    .safe(),
}

const unchangedChoiceSchema = z
  .object({
    ...choiceGuardFields,
    mode: z.literal("unchanged"),
  })
  .strict()

const transitionChoiceSchema = z
  .object({
    ...choiceGuardFields,
    mode: z.literal("transition"),
    transition: z
      .object({
        condition: z.enum(statusConditions),
        validityMinutes: validityMinutesSchema,
        ownerSummary: optionalText(280),
        privateNote: optionalText(2_000),
        publicationMode: z.enum(["private", "public"]),
        publicSummary: optionalText(280),
      })
      .strict(),
  })
  .strict()

export const componentStatusChoiceSchema = z
  .discriminatedUnion("mode", [
    unchangedChoiceSchema,
    transitionChoiceSchema,
  ])
  .superRefine((value, context) => {
    if (
      value.mode === "transition" &&
      value.transition.publicationMode === "public" &&
      value.expectedComponentMetadataPublicationVersion === 0
    ) {
      context.addIssue({
        code: "custom",
        path: [
          "expectedComponentMetadataPublicationVersion",
        ],
        message: "Public status transitions require public component metadata",
      })
    }
  })

export type ComponentStatusChoice = z.infer<
  typeof componentStatusChoiceSchema
>

export function toStatusTransitionCommand(
  choice: Extract<ComponentStatusChoice, { mode: "transition" }>,
  effectiveAt: number,
) {
  const validUntil =
    choice.transition.validityMinutes === null
      ? null
      : effectiveAt + choice.transition.validityMinutes * 60_000

  if (validUntil !== null && !Number.isSafeInteger(validUntil)) {
    throw new FormDataFieldError()
  }

  return {
    condition: choice.transition.condition,
    validUntil,
    ownerSummary: choice.transition.ownerSummary,
    privateNote: choice.transition.privateNote,
    publication:
      choice.transition.publicationMode === "public"
        ? {
            mode: "public" as const,
            publicSummary: choice.transition.publicSummary,
            expectedComponentMetadataPublicationVersion:
              choice.expectedComponentMetadataPublicationVersion,
            expectedStatusPublicationVersion:
              choice.expectedStatusPublicationVersion,
          }
        : { mode: "private" as const },
  }
}
