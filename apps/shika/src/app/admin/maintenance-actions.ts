"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { requireOwner } from "@/lib/auth/require-owner"
import {
  appendMaintenanceEventForCurrentOwner,
  closeMaintenancePublicationForCurrentOwner,
  publishMaintenanceForCurrentOwner,
  scheduleMaintenanceForCurrentOwner,
} from "@/lib/commands/current-owner"
import { toAdminActionError } from "@/lib/forms/admin-action-error"
import type { AdminActionState } from "@/lib/forms/admin-action-state"
import {
  componentStatusChoiceSchema,
  toStatusTransitionCommand,
} from "@/lib/forms/component-status-choice"
import {
  FormDataFieldError,
  readSingleJsonField,
  readSingleTextField,
} from "@/lib/forms/form-data"
import { resolveUtcDateTimeSubmission } from "@/lib/forms/local-date-time"
import {
  createMaintenancePublicationAdminHref,
  publishMaintenanceFormPayloadSchema,
  toPublishMaintenanceCommand,
} from "@/lib/forms/maintenance-publication"

function maintenanceAdminHref(maintenanceWindowId: string, notice: string) {
  return (
    "/admin?" +
    new URLSearchParams({
      view: "maintenance",
      item: maintenanceWindowId,
      notice,
    }).toString()
  )
}

const naturalNumber = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe())
const optionalNaturalNumber = z
  .union([z.literal(""), naturalNumber])
  .transform((value) => (value === "" ? null : value))
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === "" ? null : value))
const componentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .nonnegative()
      .safe(),
  })
  .strict()
const publicComponentGuardSchema = componentGuardSchema
  .extend({
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

const scheduleMaintenanceFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    effectiveAt: naturalNumber,
    componentId: z.uuid(),
    expectedComponentVersion: naturalNumber.pipe(z.number().positive()),
    expectedComponentMetadataPublicationVersion: naturalNumber,
    publicationMode: z.enum(["private", "public"]),
    title: z.string().trim().min(1).max(120),
    ownerSummary: optionalText(280),
    privateNote: optionalText(2_000),
    publicTitle: z.string().trim().max(120),
    publicSummary: optionalText(280),
    startsAt: naturalNumber,
    endsAt: naturalNumber,
    timezone: z.string().trim().min(1).max(80),
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Maintenance must end after it starts",
      })
    }

    if (
      value.publicationMode === "public" &&
      (value.expectedComponentMetadataPublicationVersion === 0 ||
        value.publicTitle === "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["publicationMode"],
        message: "Public maintenance requires a published component and title",
      })
    }
  })

const updateMaintenanceFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    effectiveAt: naturalNumber,
    maintenanceWindowId: z.uuid(),
    expectedMaintenanceVersion: naturalNumber.pipe(z.number().positive()),
    expectedPublicationVersion: naturalNumber,
    operation: z.enum(["reschedule", "start", "complete", "cancel", "note"]),
    publicationMode: z.enum(["private", "public"]),
    ownerSummary: optionalText(280),
    privateNote: optionalText(2_000),
    publicSummary: optionalText(280),
    startsAt: optionalNaturalNumber,
    endsAt: optionalNaturalNumber,
    timezone: z.string().trim().max(80),
    componentGuards: z.array(componentGuardSchema).min(1).max(50),
    componentStatusChoices: z.array(componentStatusChoiceSchema).max(50),
    confirmation: z.enum(["", "confirmed"]),
  })
  .superRefine((value, context) => {
    if (
      value.operation === "reschedule" &&
      (value.startsAt === null ||
        value.endsAt === null ||
        value.endsAt <= value.startsAt ||
        value.timezone === "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A valid replacement window is required",
      })
    }

    if (
      value.publicationMode === "public" &&
      (value.operation === "start" || value.operation === "complete"
        ? value.componentStatusChoices
        : value.componentGuards
      ).some(
        (component) =>
          component.expectedComponentMetadataPublicationVersion === 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["componentGuards"],
        message: "Public updates require published component guards",
      })
    }

    if (
      (value.operation === "start" || value.operation === "complete") &&
      value.componentStatusChoices.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["componentStatusChoices"],
        message: "Start and completion require explicit component outcomes",
      })
    }

    if (
      value.operation !== "start" &&
      value.operation !== "complete" &&
      value.componentStatusChoices.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["componentStatusChoices"],
        message: "This operation cannot change component status",
      })
    }

    if (
      ["start", "complete", "cancel"].includes(value.operation) &&
      value.confirmation !== "confirmed"
    ) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Lifecycle changes require confirmation",
      })
    }
  })

const closeMaintenancePublicationFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    maintenanceWindowId: z.uuid(),
    expectedMaintenanceVersion: naturalNumber.pipe(z.number().positive()),
    expectedMaintenancePublicationVersion: naturalNumber.pipe(
      z.number().positive(),
    ),
    action: z.enum(["withdraw", "redact", "suppress"]),
    affectedComponents: z.array(publicComponentGuardSchema).max(50),
    confirmation: z.literal("confirmed"),
  })
  .superRefine((value, context) => {
    if (
      value.action !== "withdraw" &&
      value.affectedComponents.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["affectedComponents"],
        message: "Privacy closure requires reviewed component guards",
      })
    }
  })

export async function scheduleMaintenanceAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let targetMaintenanceWindowId = ""

  try {
    await requireOwner()
    const timezone = readSingleTextField(formData, "timezone")
    const startsAt = resolveUtcDateTimeSubmission(
      readSingleTextField(formData, "startsAt"),
      readSingleTextField(formData, "startsAtLocal"),
      timezone,
    )
    const endsAt = resolveUtcDateTimeSubmission(
      readSingleTextField(formData, "endsAt"),
      readSingleTextField(formData, "endsAtLocal"),
      timezone,
    )
    const form = scheduleMaintenanceFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      effectiveAt: readSingleTextField(formData, "effectiveAt"),
      componentId: readSingleTextField(formData, "componentId"),
      expectedComponentVersion: readSingleTextField(
        formData,
        "expectedComponentVersion",
      ),
      expectedComponentMetadataPublicationVersion: readSingleTextField(
        formData,
        "expectedComponentMetadataPublicationVersion",
      ),
      publicationMode: readSingleTextField(formData, "publicationMode"),
      title: readSingleTextField(formData, "title"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      privateNote: readSingleTextField(formData, "privateNote"),
      publicTitle: readSingleTextField(formData, "publicTitle"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
      startsAt,
      endsAt,
      timezone,
    })
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      title: form.title,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      timezone: form.timezone,
      effectiveAt: form.effectiveAt,
    }

    if (form.publicationMode === "public") {
      if (
        form.expectedComponentMetadataPublicationVersion === 0 ||
        form.publicTitle === ""
      ) {
        throw new FormDataFieldError()
      }
      const result = await scheduleMaintenanceForCurrentOwner({
        ...sharedInput,
        affectedComponents: [
          {
            componentId: form.componentId,
            expectedComponentVersion: form.expectedComponentVersion,
            expectedComponentMetadataPublicationVersion:
              form.expectedComponentMetadataPublicationVersion,
          },
        ],
        publication: {
          mode: "public",
          expectedMaintenancePublicationVersion: 0,
          title: form.publicTitle,
          summary: form.publicSummary,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          timezone: form.timezone,
        },
      })
      targetMaintenanceWindowId = result.maintenanceWindowId
      publicChanged = true
    } else {
      const result = await scheduleMaintenanceForCurrentOwner({
        ...sharedInput,
        affectedComponents: [
          {
            componentId: form.componentId,
            expectedComponentVersion: form.expectedComponentVersion,
          },
        ],
        publication: { mode: "private" },
      })
      targetMaintenanceWindowId = result.maintenanceWindowId
    }
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (publicChanged) {
    revalidatePath("/")
    revalidatePath("/history")
  }
  redirect(
    maintenanceAdminHref(
      targetMaintenanceWindowId,
      "maintenance-scheduled",
    ),
  )
}

export async function updateMaintenanceAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let targetMaintenanceWindowId = ""

  try {
    await requireOwner()
    const timezone = readSingleTextField(formData, "timezone")
    const startsAt = resolveUtcDateTimeSubmission(
      readSingleTextField(formData, "startsAt"),
      readSingleTextField(formData, "startsAtLocal"),
      timezone,
    )
    const endsAt = resolveUtcDateTimeSubmission(
      readSingleTextField(formData, "endsAt"),
      readSingleTextField(formData, "endsAtLocal"),
      timezone,
    )
    const form = updateMaintenanceFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      effectiveAt: readSingleTextField(formData, "effectiveAt"),
      maintenanceWindowId: readSingleTextField(formData, "maintenanceWindowId"),
      expectedMaintenanceVersion: readSingleTextField(
        formData,
        "expectedMaintenanceVersion",
      ),
      expectedPublicationVersion: readSingleTextField(
        formData,
        "expectedPublicationVersion",
      ),
      operation: readSingleTextField(formData, "operation"),
      publicationMode: readSingleTextField(formData, "publicationMode"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      privateNote: readSingleTextField(formData, "privateNote"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
      startsAt,
      endsAt,
      timezone,
      componentGuards: readSingleJsonField(formData, "componentGuards"),
      componentStatusChoices: readSingleJsonField(
        formData,
        "componentStatusChoices",
      ),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    targetMaintenanceWindowId = form.maintenanceWindowId
    const affectedComponents =
      form.operation === "start" || form.operation === "complete"
        ? form.componentStatusChoices.map((choice) => {
            const guard = {
              componentId: choice.componentId,
              expectedComponentVersion: choice.expectedComponentVersion,
              expectedComponentMetadataPublicationVersion:
                form.publicationMode === "public"
                  ? choice.expectedComponentMetadataPublicationVersion
                  : null,
            }

            return choice.mode === "unchanged"
              ? { ...guard, outcome: "unchanged" as const }
              : {
                  ...guard,
                  outcome: "transition" as const,
                  transition: toStatusTransitionCommand(
                    choice,
                    form.effectiveAt,
                  ),
                }
          })
        : form.componentGuards.map((component) => ({
            componentId: component.componentId,
            expectedComponentVersion: component.expectedComponentVersion,
            expectedComponentMetadataPublicationVersion:
              form.publicationMode === "public"
                ? component.expectedComponentMetadataPublicationVersion
                : null,
            outcome: "unchanged" as const,
          }))
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      maintenanceWindowId: form.maintenanceWindowId,
      expectedMaintenanceVersion: form.expectedMaintenanceVersion,
      effectiveAt: form.effectiveAt,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
      affectedComponents,
    }
    const publication =
      form.publicationMode === "public"
        ? {
            mode: "public" as const,
            expectedMaintenancePublicationVersion:
              form.expectedPublicationVersion,
            summary: form.publicSummary,
          }
        : { mode: "private" as const }

    if (form.operation === "reschedule") {
      if (
        form.startsAt === null ||
        form.endsAt === null ||
        form.timezone === ""
      ) {
        throw new FormDataFieldError()
      }
      await appendMaintenanceEventForCurrentOwner({
        ...sharedInput,
        operation: "reschedule",
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        timezone: form.timezone,
        publication:
          publication.mode === "public"
            ? {
                ...publication,
                startsAt: form.startsAt,
                endsAt: form.endsAt,
                timezone: form.timezone,
              }
            : publication,
      })
    } else {
      await appendMaintenanceEventForCurrentOwner({
        ...sharedInput,
        operation: form.operation,
        publication,
      })
    }

    publicChanged =
      form.publicationMode === "public" ||
      form.componentStatusChoices.some(
        (choice) =>
          choice.mode === "transition" &&
          choice.transition.publicationMode === "public",
      )
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (publicChanged) {
    revalidatePath("/")
    revalidatePath("/history")
  }
  redirect(
    maintenanceAdminHref(targetMaintenanceWindowId, "maintenance-updated"),
  )
}

export async function closeMaintenancePublicationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let targetMaintenanceWindowId = ""

  try {
    await requireOwner()
    const form = closeMaintenancePublicationFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      maintenanceWindowId: readSingleTextField(formData, "maintenanceWindowId"),
      expectedMaintenanceVersion: readSingleTextField(
        formData,
        "expectedMaintenanceVersion",
      ),
      expectedMaintenancePublicationVersion: readSingleTextField(
        formData,
        "expectedMaintenancePublicationVersion",
      ),
      action: readSingleTextField(formData, "action"),
      affectedComponents: readSingleJsonField(
        formData,
        "affectedComponents",
      ),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    targetMaintenanceWindowId = form.maintenanceWindowId
    const commandFields = {
      idempotencyKey: form.idempotencyKey,
      maintenanceWindowId: form.maintenanceWindowId,
      expectedMaintenanceVersion: form.expectedMaintenanceVersion,
      expectedMaintenancePublicationVersion:
        form.expectedMaintenancePublicationVersion,
      action: form.action,
    }

    if (form.action === "withdraw") {
      await closeMaintenancePublicationForCurrentOwner(commandFields)
    } else {
      await closeMaintenancePublicationForCurrentOwner({
        ...commandFields,
        affectedComponents: form.affectedComponents,
      })
    }
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/")
  revalidatePath("/history")
  redirect(
    maintenanceAdminHref(
      targetMaintenanceWindowId,
      "maintenance-publication-closed",
    ),
  )
}

export async function publishMaintenanceAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let targetMaintenanceWindowId = ""

  try {
    await requireOwner()
    const form = publishMaintenanceFormPayloadSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      maintenanceWindowId: readSingleTextField(formData, "maintenanceWindowId"),
      expectedMaintenanceVersion: naturalNumber.parse(
        readSingleTextField(formData, "expectedMaintenanceVersion"),
      ),
      expectedMaintenancePublicationVersion: naturalNumber.parse(
        readSingleTextField(
          formData,
          "expectedMaintenancePublicationVersion",
        ),
      ),
      effectiveAt: naturalNumber.parse(
        readSingleTextField(formData, "effectiveAt"),
      ),
      publicTitle: readSingleTextField(formData, "publicTitle"),
      publicSummary: optionalText(280).parse(
        readSingleTextField(formData, "publicSummary"),
      ),
      publicStartsAt: naturalNumber.parse(
        readSingleTextField(formData, "publicStartsAt"),
      ),
      publicEndsAt: naturalNumber.parse(
        readSingleTextField(formData, "publicEndsAt"),
      ),
      publicTimezone: readSingleTextField(formData, "publicTimezone"),
      affectedComponents: readSingleJsonField(
        formData,
        "affectedComponents",
      ),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    targetMaintenanceWindowId = form.maintenanceWindowId

    await publishMaintenanceForCurrentOwner(
      toPublishMaintenanceCommand(form),
    )
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/")
  revalidatePath("/history")
  redirect(
    createMaintenancePublicationAdminHref(
      targetMaintenanceWindowId,
      "maintenance-published",
    ),
  )
}
