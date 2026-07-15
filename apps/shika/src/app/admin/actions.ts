"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { statusConditions } from "@/domain/status"
import { requireOwner } from "@/lib/auth/require-owner"
import {
  closeStatusPublicationForCurrentOwner,
  createComponentForCurrentOwner,
  reportStatusForCurrentOwner,
} from "@/lib/commands/current-owner"
import { toAdminActionError } from "@/lib/forms/admin-action-error"
import type { AdminActionState } from "@/lib/forms/admin-action-state"
import {
  createComponentAdminRedirect,
  createStatusAdminRedirect,
} from "@/lib/forms/component-management"
import { readSingleTextField } from "@/lib/forms/form-data"

const naturalNumber = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe())

const positiveMinutes = naturalNumber.pipe(z.number().positive().max(525_600))
const optionalMinutes = z
  .union([z.literal(""), positiveMinutes])
  .transform((value) => (value === "" ? null : value))
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === "" ? null : value))

const createComponentFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    effectiveAt: naturalNumber,
    visibility: z.enum(["private", "public"]),
    ownerName: z.string().trim().min(1).max(80),
    ownerSummary: optionalText(280),
    ownerSortOrder: naturalNumber,
    defaultValidityMinutes: optionalMinutes,
    privateNote: optionalText(2_000),
    publicName: z.string().trim().max(80),
    publicSummary: optionalText(280),
    publicSortOrder: z
      .union([z.literal(""), naturalNumber])
      .transform((value) => (value === "" ? null : value)),
    initialCondition: z.union([z.literal(""), z.enum(statusConditions)]),
    initialOwnerSummary: optionalText(280),
    initialPublicSummary: optionalText(280),
    initialPrivateNote: optionalText(2_000),
    initialExpiryMinutes: optionalMinutes,
    confirmation: z.enum(["", "confirmed"]),
  })
  .superRefine((value, context) => {
    if (value.visibility !== "public") return

    if (value.publicName === "") {
      context.addIssue({
        code: "custom",
        path: ["publicName"],
        message: "A public name is required",
      })
    }

    if (value.publicSortOrder === null) {
      context.addIssue({
        code: "custom",
        path: ["publicSortOrder"],
        message: "A public sort order is required",
      })
    }

    if (value.initialCondition === "") {
      context.addIssue({
        code: "custom",
        path: ["initialCondition"],
        message: "A public starting condition is required",
      })
    }

    if (value.confirmation !== "confirmed") {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Public creation requires confirmation",
      })
    }
  })

const reportStatusFormSchema = z.object({
  idempotencyKey: z.uuid(),
  effectiveAt: naturalNumber,
  componentId: z.uuid(),
  expectedComponentVersion: naturalNumber.pipe(z.number().positive()),
  expectedComponentMetadataPublicationVersion: naturalNumber,
  expectedStatusPublicationVersion: naturalNumber,
  condition: z.enum(statusConditions),
  ownerSummary: optionalText(280),
  publicSummary: optionalText(280),
  privateNote: optionalText(2_000),
  expiryMinutes: optionalMinutes,
  publicationMode: z.enum(["private", "public"]),
})

const closeStatusPublicationFormSchema = z.object({
  idempotencyKey: z.uuid(),
  componentId: z.uuid(),
  expectedComponentVersion: naturalNumber.pipe(z.number().positive()),
  statusTransitionId: z.uuid(),
  expectedStatusPublicationVersion: naturalNumber.pipe(z.number().positive()),
  action: z.enum(["withdraw", "redact", "suppress"]),
  confirmation: z.literal("confirmed"),
})

export async function createComponentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let componentId = ""

  try {
    await requireOwner()
    const form = createComponentFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      effectiveAt: readSingleTextField(formData, "effectiveAt"),
      visibility: readSingleTextField(formData, "visibility"),
      ownerName: readSingleTextField(formData, "ownerName"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      ownerSortOrder: readSingleTextField(formData, "ownerSortOrder"),
      defaultValidityMinutes: readSingleTextField(
        formData,
        "defaultValidityMinutes",
      ),
      privateNote: readSingleTextField(formData, "privateNote"),
      publicName: readSingleTextField(formData, "publicName"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
      publicSortOrder: readSingleTextField(formData, "publicSortOrder"),
      initialCondition: readSingleTextField(formData, "initialCondition"),
      initialOwnerSummary: readSingleTextField(formData, "initialOwnerSummary"),
      initialPublicSummary: readSingleTextField(formData, "initialPublicSummary"),
      initialPrivateNote: readSingleTextField(formData, "initialPrivateNote"),
      initialExpiryMinutes: readSingleTextField(formData, "initialExpiryMinutes"),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    const initialStatus =
      form.initialCondition === ""
        ? null
        : {
            condition: form.initialCondition,
            effectiveAt: form.effectiveAt,
            validUntil:
              form.initialExpiryMinutes === null
                ? null
                : form.effectiveAt + form.initialExpiryMinutes * 60_000,
            ownerSummary: form.initialOwnerSummary,
            publicSummary: form.initialPublicSummary,
            privateNote: form.initialPrivateNote,
          }
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      ownerName: form.ownerName,
      ownerSummary: form.ownerSummary,
      ownerSortOrder: form.ownerSortOrder,
      defaultValidityMs:
        form.defaultValidityMinutes === null
          ? null
          : form.defaultValidityMinutes * 60_000,
      privateNote: form.privateNote,
    }

    if (form.visibility === "public") {
      if (
        form.publicName === "" ||
        form.publicSortOrder === null ||
        initialStatus === null
      ) {
        return toAdminActionError(new z.ZodError([]))
      }

      const result = await createComponentForCurrentOwner({
        ...sharedInput,
        visibility: "public",
        publicName: form.publicName,
        publicSummary: form.publicSummary,
        publicSortOrder: form.publicSortOrder,
        initialStatus,
      })
      componentId = result.componentId
      publicChanged = true
    } else {
      const result = await createComponentForCurrentOwner({
        ...sharedInput,
        visibility: "private",
        initialStatus,
      })
      componentId = result.componentId
    }
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (publicChanged) revalidatePath("/")
  redirect(createComponentAdminRedirect(componentId, "component-created"))
}

export async function reportStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false

  try {
    await requireOwner()
    const form = reportStatusFormSchema.parse({
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
      expectedStatusPublicationVersion: readSingleTextField(
        formData,
        "expectedStatusPublicationVersion",
      ),
      condition: readSingleTextField(formData, "condition"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
      privateNote: readSingleTextField(formData, "privateNote"),
      expiryMinutes: readSingleTextField(formData, "expiryMinutes"),
      publicationMode: readSingleTextField(formData, "publicationMode"),
    })
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      componentId: form.componentId,
      expectedComponentVersion: form.expectedComponentVersion,
      condition: form.condition,
      effectiveAt: form.effectiveAt,
      validUntil:
        form.expiryMinutes === null
          ? null
          : form.effectiveAt + form.expiryMinutes * 60_000,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
    }

    if (form.publicationMode === "public") {
      if (form.expectedComponentMetadataPublicationVersion === 0) {
        return toAdminActionError(new z.ZodError([]))
      }

      await reportStatusForCurrentOwner({
        ...sharedInput,
        publication: {
          mode: "public",
          publicSummary: form.publicSummary,
          expectedComponentMetadataPublicationVersion:
            form.expectedComponentMetadataPublicationVersion,
          expectedStatusPublicationVersion:
            form.expectedStatusPublicationVersion,
        },
      })
      publicChanged = true
    } else {
      await reportStatusForCurrentOwner({
        ...sharedInput,
        publication: { mode: "private" },
      })
    }
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (publicChanged) revalidatePath("/")
  redirect(createStatusAdminRedirect("status-reported"))
}

export async function closeStatusPublicationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let componentId = ""

  try {
    await requireOwner()
    const form = closeStatusPublicationFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      componentId: readSingleTextField(formData, "componentId"),
      expectedComponentVersion: readSingleTextField(
        formData,
        "expectedComponentVersion",
      ),
      statusTransitionId: readSingleTextField(formData, "statusTransitionId"),
      expectedStatusPublicationVersion: readSingleTextField(
        formData,
        "expectedStatusPublicationVersion",
      ),
      action: readSingleTextField(formData, "action"),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    componentId = form.componentId

    await closeStatusPublicationForCurrentOwner({
      idempotencyKey: form.idempotencyKey,
      componentId: form.componentId,
      expectedComponentVersion: form.expectedComponentVersion,
      statusTransitionId: form.statusTransitionId,
      expectedStatusPublicationVersion: form.expectedStatusPublicationVersion,
      action: form.action,
    })
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/")
  revalidatePath("/history")
  redirect(
    createComponentAdminRedirect(
      componentId,
      "status-publication-closed",
    ),
  )
}
