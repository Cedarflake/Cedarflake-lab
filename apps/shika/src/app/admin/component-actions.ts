"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireOwner } from "@/lib/auth/require-owner"
import {
  changeComponentLifecycleForCurrentOwner,
  closeComponentPublicationForCurrentOwner,
  publishComponentForCurrentOwner,
  saveComponentMetadataForCurrentOwner,
} from "@/lib/commands/current-owner"
import { CommandConflictError } from "@/lib/commands/errors"
import { getOwnerComponentPrivacyReview } from "@/lib/data/owner-component-privacy"
import { toAdminActionError } from "@/lib/forms/admin-action-error"
import type { AdminActionState } from "@/lib/forms/admin-action-state"
import {
  changeComponentLifecycleFormPayloadSchema,
  createComponentAdminRedirect,
  publishComponentFormPayloadSchema,
  saveComponentMetadataFormPayloadSchema,
} from "@/lib/forms/component-management"
import { closeComponentPublicationFormPayloadSchema } from "@/lib/forms/component-privacy"
import { readSingleJsonField } from "@/lib/forms/form-data"

export async function saveComponentMetadataAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let componentId = ""

  try {
    await requireOwner()
    const form = saveComponentMetadataFormPayloadSchema.parse(
      readSingleJsonField(formData, "payload"),
    )
    componentId = form.componentId

    await saveComponentMetadataForCurrentOwner(form)
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  redirect(createComponentAdminRedirect(componentId, "component-metadata-saved"))
}

export async function publishComponentAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let componentId = ""

  try {
    await requireOwner()
    const form = publishComponentFormPayloadSchema.parse(
      readSingleJsonField(formData, "payload"),
    )
    componentId = form.componentId

    await publishComponentForCurrentOwner({
      idempotencyKey: form.idempotencyKey,
      componentId: form.componentId,
      expectedComponentVersion: form.expectedComponentVersion,
      expectedMetadataPublicationVersion:
        form.expectedMetadataPublicationVersion,
      expectedStatusPublicationVersion:
        form.expectedStatusPublicationVersion,
      startingReport: form.startingReport,
    })
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/")
  revalidatePath("/history")
  redirect(createComponentAdminRedirect(componentId, "component-published"))
}

export async function changeComponentLifecycleAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let componentId = ""
  let operation: "archive" | "unarchive" = "archive"

  try {
    await requireOwner()
    const form = changeComponentLifecycleFormPayloadSchema.parse(
      readSingleJsonField(formData, "payload"),
    )
    componentId = form.componentId
    operation = form.operation

    await changeComponentLifecycleForCurrentOwner({
      idempotencyKey: form.idempotencyKey,
      componentId: form.componentId,
      expectedComponentVersion: form.expectedComponentVersion,
      expectedMetadataPublicationVersion:
        form.expectedMetadataPublicationVersion,
      expectedStatusPublicationVersion:
        form.expectedStatusPublicationVersion,
      operation: form.operation,
    })
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  if (operation === "archive") {
    revalidatePath("/")
    revalidatePath("/history")
  }
  redirect(
    createComponentAdminRedirect(
      componentId,
      operation === "archive" ? "component-archived" : "component-unarchived",
    ),
  )
}

export async function closeComponentPublicationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let componentId = ""
  let action: "withdraw" | "redact" | "suppress" = "withdraw"

  try {
    await requireOwner()
    const form = closeComponentPublicationFormPayloadSchema.parse(
      readSingleJsonField(formData, "payload"),
    )
    componentId = form.componentId
    action = form.action
    const currentReview = await getOwnerComponentPrivacyReview(form.componentId)
    if (
      !currentReview ||
      currentReview.target.ownerName !== form.ownerName
    ) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "The component name changed after confirmation was prepared",
      )
    }

    await closeComponentPublicationForCurrentOwner({
      idempotencyKey: form.idempotencyKey,
      componentId: form.componentId,
      expectedComponentVersion: form.expectedComponentVersion,
      expectedMetadataPublicationVersion:
        form.expectedMetadataPublicationVersion,
      expectedStatusPublicationVersion:
        form.expectedStatusPublicationVersion,
      action: form.action,
      dependentParents: form.dependentParents,
      relatedComponents: form.relatedComponents,
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
      action === "withdraw"
        ? "component-withdrawn"
        : action === "redact"
          ? "component-redacted"
          : "component-suppressed",
      "privacy",
    ),
  )
}
