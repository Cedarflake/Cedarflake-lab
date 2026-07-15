"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { incidentPhases, incidentSeverities } from "@/domain/incidents"
import { requireOwner } from "@/lib/auth/require-owner"
import {
  appendIncidentUpdateForCurrentOwner,
  closeIncidentPublicationForCurrentOwner,
  createIncidentForCurrentOwner,
  reviseIncidentMetadataForCurrentOwner,
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
import { readIncidentMetadataForm } from "@/lib/forms/incident-metadata-form"

function incidentAdminHref(
  incidentId: string,
  notice: string,
  task?: string,
) {
  const parameters = new URLSearchParams({
    view: "incident",
    item: incidentId,
    notice,
  })
  if (task) parameters.set("task", task)

  return (
    "/admin?" +
    parameters.toString()
  )
}

const naturalNumber = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe())
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
const selectableComponentGuardSchema = componentGuardSchema
  .extend({
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .nonnegative()
      .safe(),
  })
  .strict()

const createIncidentFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    effectiveAt: naturalNumber,
    affectedComponents: z.array(selectableComponentGuardSchema).min(1).max(100),
    publicationMode: z.enum(["private", "public"]),
    title: z.string().trim().min(1).max(120),
    severity: z.enum(incidentSeverities),
    initialPhase: z.enum(["investigating", "identified", "monitoring"]),
    ownerSummary: optionalText(1_000),
    privateNote: optionalText(2_000),
    publicTitle: z.string().trim().max(120),
    publicSummary: optionalText(1_000),
  })
  .superRefine((value, context) => {
    if (value.publicationMode !== "public") return

    if (
      value.affectedComponents.some(
        (component) =>
          component.expectedComponentMetadataPublicationVersion === 0,
      ) ||
      value.publicTitle === ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["publicationMode"],
        message: "Public incidents require a published component and title",
      })
    }
  })

const updateIncidentFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    effectiveAt: naturalNumber,
    incidentId: z.uuid(),
    expectedIncidentVersion: naturalNumber.pipe(z.number().positive()),
    expectedPublicationVersion: naturalNumber,
    operation: z.enum(["note", "phase_update", "resolve", "reopen"]),
    to: z.union([z.literal(""), z.enum(incidentPhases)]),
    reason: optionalText(1_000),
    ownerSummary: optionalText(1_000),
    privateNote: optionalText(2_000),
    publicSummary: optionalText(1_000),
    publicationMode: z.enum(["private", "public"]),
    componentGuards: z.array(componentGuardSchema).max(100),
    componentStatusChoices: z.array(componentStatusChoiceSchema).max(100),
    confirmation: z.enum(["", "confirmed"]),
  })
  .superRefine((value, context) => {
    if (value.operation === "phase_update" && value.to === "") {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "A destination phase is required",
      })
    }

    if (value.operation !== "note" && value.reason === null) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required",
      })
    }

    if (
      value.operation === "resolve" &&
      value.componentStatusChoices.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["componentStatusChoices"],
        message: "Resolution requires an explicit choice for every component",
      })
    }

    if (value.operation === "reopen" && value.componentGuards.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["componentGuards"],
        message: "Reopening requires reviewed component guards",
      })
    }

    if (
      (value.operation === "resolve" || value.operation === "reopen") &&
      value.confirmation !== "confirmed"
    ) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Lifecycle changes require confirmation",
      })
    }
  })

const closeIncidentPublicationFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    incidentId: z.uuid(),
    expectedIncidentVersion: naturalNumber.pipe(z.number().positive()),
    expectedIncidentPublicationVersion: naturalNumber.pipe(
      z.number().positive(),
    ),
    action: z.enum(["withdraw", "redact", "suppress"]),
    affectedComponents: z.array(publicComponentGuardSchema).max(100),
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

const reviseIncidentMetadataFormSchema = z
  .object({
    idempotencyKey: z.uuid(),
    incidentId: z.uuid(),
    expectedIncidentVersion: naturalNumber.pipe(z.number().positive()),
    effectiveAt: naturalNumber,
    title: z.string().trim().min(1).max(120),
    severity: z.enum(incidentSeverities),
    ownerSummary: optionalText(1_000),
    privateNote: optionalText(2_000),
    currentAffectedComponents: z.array(componentGuardSchema).min(1).max(100),
    affectedComponents: z
      .array(selectableComponentGuardSchema)
      .min(1)
      .max(100),
    publicationMode: z.enum(["private", "public"]),
    expectedPublicationVersion: naturalNumber,
    publicTitle: z.string().trim().max(120),
    publicSeverity: z.enum(incidentSeverities),
    publicSummary: optionalText(1_000),
  })
  .superRefine((value, context) => {
    if (value.publicationMode !== "public") return

    if (value.publicTitle === "") {
      context.addIssue({
        code: "custom",
        path: ["publicTitle"],
        message: "A public incident title is required",
      })
    }

    if (
      value.affectedComponents.some(
        (component) =>
          component.expectedComponentMetadataPublicationVersion === 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["affectedComponents"],
        message: "Public incident metadata requires public status items",
      })
    }
  })

export async function createIncidentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let targetIncidentId = ""

  try {
    await requireOwner()
    const form = createIncidentFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      effectiveAt: readSingleTextField(formData, "effectiveAt"),
      affectedComponents: readSingleJsonField(formData, "affectedComponents"),
      publicationMode: readSingleTextField(formData, "publicationMode"),
      expectedPublicationVersion: readSingleTextField(
        formData,
        "expectedPublicationVersion",
      ),
      title: readSingleTextField(formData, "title"),
      severity: readSingleTextField(formData, "severity"),
      initialPhase: readSingleTextField(formData, "initialPhase"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      privateNote: readSingleTextField(formData, "privateNote"),
      publicTitle: readSingleTextField(formData, "publicTitle"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
    })
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      title: form.title,
      severity: form.severity,
      initialPhase: form.initialPhase,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
      effectiveAt: form.effectiveAt,
    }

    if (form.publicationMode === "public") {
      if (form.publicTitle === "") {
        throw new FormDataFieldError()
      }

      const result = await createIncidentForCurrentOwner({
        ...sharedInput,
        affectedComponents: form.affectedComponents.map((component) => ({
          componentId: component.componentId,
          expectedComponentVersion: component.expectedComponentVersion,
          expectedComponentMetadataPublicationVersion:
            component.expectedComponentMetadataPublicationVersion,
        })),
        publication: {
          mode: "public",
          expectedPublicationVersion: 0,
          publicTitle: form.publicTitle,
          publicSeverity: form.severity,
          publicSummary: form.publicSummary,
        },
      })
      targetIncidentId = result.incidentId
      publicChanged = true
    } else {
      const result = await createIncidentForCurrentOwner({
        ...sharedInput,
        affectedComponents: form.affectedComponents.map((component) => ({
          componentId: component.componentId,
          expectedComponentVersion: component.expectedComponentVersion,
        })),
        publication: { mode: "private" },
      })
      targetIncidentId = result.incidentId
    }
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (publicChanged) {
    revalidatePath("/")
    revalidatePath("/history")
  }
  redirect(incidentAdminHref(targetIncidentId, "incident-created"))
}

export async function updateIncidentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let targetIncidentId = ""

  try {
    await requireOwner()
    const form = updateIncidentFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      effectiveAt: readSingleTextField(formData, "effectiveAt"),
      incidentId: readSingleTextField(formData, "incidentId"),
      expectedIncidentVersion: readSingleTextField(
        formData,
        "expectedIncidentVersion",
      ),
      expectedPublicationVersion: readSingleTextField(
        formData,
        "expectedPublicationVersion",
      ),
      operation: readSingleTextField(formData, "operation"),
      to: readSingleTextField(formData, "to"),
      reason: readSingleTextField(formData, "reason"),
      ownerSummary: readSingleTextField(formData, "ownerSummary"),
      privateNote: readSingleTextField(formData, "privateNote"),
      publicSummary: readSingleTextField(formData, "publicSummary"),
      publicationMode: readSingleTextField(formData, "publicationMode"),
      componentGuards: readSingleJsonField(formData, "componentGuards"),
      componentStatusChoices: readSingleJsonField(
        formData,
        "componentStatusChoices",
      ),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    targetIncidentId = form.incidentId

    const publication =
      form.publicationMode === "public"
        ? {
            mode: "public" as const,
            expectedPublicationVersion: form.expectedPublicationVersion,
            publicSummary: form.publicSummary,
          }
        : { mode: "private" as const }
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      incidentId: form.incidentId,
      expectedIncidentVersion: form.expectedIncidentVersion,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
      effectiveAt: form.effectiveAt,
      publication,
    }

    if (form.operation === "note") {
      await appendIncidentUpdateForCurrentOwner({
        ...sharedInput,
        operation: "note",
      })
    } else if (form.operation === "phase_update") {
      if (form.to === "" || form.reason === null) {
        throw new FormDataFieldError()
      }
      await appendIncidentUpdateForCurrentOwner({
        ...sharedInput,
        operation: "phase_update",
        to: form.to,
        reason: form.reason,
      })
    } else {
      if (form.reason === null) throw new FormDataFieldError()

      if (form.operation === "resolve") {
        await appendIncidentUpdateForCurrentOwner({
          ...sharedInput,
          operation: "resolve",
          reason: form.reason,
          componentOutcomes: form.componentStatusChoices.map((choice) =>
            choice.mode === "unchanged"
              ? {
                  componentId: choice.componentId,
                  expectedComponentVersion:
                    choice.expectedComponentVersion,
                  mode: "unchanged" as const,
                }
              : {
                  componentId: choice.componentId,
                  expectedComponentVersion:
                    choice.expectedComponentVersion,
                  mode: "transition" as const,
                  transition: toStatusTransitionCommand(
                    choice,
                    form.effectiveAt,
                  ),
                },
          ),
        })
      } else {
        await appendIncidentUpdateForCurrentOwner({
          ...sharedInput,
          operation: "reopen",
          reason: form.reason,
          affectedComponents: form.componentGuards,
        })
      }
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
  redirect(incidentAdminHref(targetIncidentId, "incident-updated"))
}

export async function reviseIncidentMetadataAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let publicChanged = false
  let targetIncidentId = ""

  try {
    await requireOwner()
    const form = reviseIncidentMetadataFormSchema.parse(
      readIncidentMetadataForm(formData),
    )
    targetIncidentId = form.incidentId
    const sharedInput = {
      idempotencyKey: form.idempotencyKey,
      incidentId: form.incidentId,
      expectedIncidentVersion: form.expectedIncidentVersion,
      title: form.title,
      severity: form.severity,
      ownerSummary: form.ownerSummary,
      privateNote: form.privateNote,
      effectiveAt: form.effectiveAt,
      currentAffectedComponents: form.currentAffectedComponents,
    }

    if (form.publicationMode === "public") {
      if (form.publicTitle === "") throw new FormDataFieldError()

      await reviseIncidentMetadataForCurrentOwner({
        ...sharedInput,
        affectedComponents: form.affectedComponents.map((component) => ({
          componentId: component.componentId,
          expectedComponentVersion: component.expectedComponentVersion,
          expectedComponentMetadataPublicationVersion:
            component.expectedComponentMetadataPublicationVersion,
        })),
        publication: {
          mode: "public",
          expectedPublicationVersion: form.expectedPublicationVersion,
          publicTitle: form.publicTitle,
          publicSeverity: form.publicSeverity,
          publicSummary: form.publicSummary,
        },
      })
      publicChanged = true
    } else {
      await reviseIncidentMetadataForCurrentOwner({
        ...sharedInput,
        affectedComponents: form.affectedComponents.map((component) => ({
          componentId: component.componentId,
          expectedComponentVersion: component.expectedComponentVersion,
        })),
        publication: { mode: "private" },
      })
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
    incidentAdminHref(
      targetIncidentId,
      "incident-metadata-revised",
      "metadata",
    ),
  )
}

export async function closeIncidentPublicationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let targetIncidentId = ""

  try {
    await requireOwner()
    const form = closeIncidentPublicationFormSchema.parse({
      idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
      incidentId: readSingleTextField(formData, "incidentId"),
      expectedIncidentVersion: readSingleTextField(
        formData,
        "expectedIncidentVersion",
      ),
      expectedIncidentPublicationVersion: readSingleTextField(
        formData,
        "expectedIncidentPublicationVersion",
      ),
      action: readSingleTextField(formData, "action"),
      affectedComponents: readSingleJsonField(
        formData,
        "affectedComponents",
      ),
      confirmation: readSingleTextField(formData, "confirmation"),
    })
    targetIncidentId = form.incidentId
    const commandFields = {
      idempotencyKey: form.idempotencyKey,
      incidentId: form.incidentId,
      expectedIncidentVersion: form.expectedIncidentVersion,
      expectedIncidentPublicationVersion:
        form.expectedIncidentPublicationVersion,
      action: form.action,
    }

    if (form.action === "withdraw") {
      await closeIncidentPublicationForCurrentOwner(commandFields)
    } else {
      await closeIncidentPublicationForCurrentOwner({
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
    incidentAdminHref(targetIncidentId, "incident-publication-closed"),
  )
}
