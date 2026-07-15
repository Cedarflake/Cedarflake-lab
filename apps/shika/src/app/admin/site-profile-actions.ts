"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireOwner } from "@/lib/auth/require-owner"
import {
  closeSiteProfilePublicationForCurrentOwner,
  publishSiteProfileForCurrentOwner,
  saveSiteProfileForCurrentOwner,
} from "@/lib/commands/current-owner"
import { toAdminActionError } from "@/lib/forms/admin-action-error"
import type { AdminActionState } from "@/lib/forms/admin-action-state"
import { readSingleJsonField } from "@/lib/forms/form-data"
import {
  createSiteProfileAdminHref,
  saveSiteProfileFormPayloadSchema,
  toCloseSiteProfilePublicationCommand,
  toPublishSiteProfileCommand,
} from "@/lib/forms/site-profile"

export async function saveSiteProfileAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireOwner()
    const command = saveSiteProfileFormPayloadSchema.parse(
      readSingleJsonField(formData, "payload"),
    )
    await saveSiteProfileForCurrentOwner(command)
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  redirect(createSiteProfileAdminHref("edit", "site-profile-saved"))
}

export async function publishSiteProfileAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireOwner()
    const command = toPublishSiteProfileCommand(
      readSingleJsonField(formData, "payload"),
    )
    await publishSiteProfileForCurrentOwner(command)
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/", "layout")
  redirect(createSiteProfileAdminHref("publish", "site-profile-published"))
}

export async function closeSiteProfilePublicationAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let action: "withdraw" | "redact" | "suppress" = "withdraw"

  try {
    await requireOwner()
    const command = toCloseSiteProfilePublicationCommand(
      readSingleJsonField(formData, "payload"),
    )
    action = command.action
    await closeSiteProfilePublicationForCurrentOwner(command)
  } catch (error) {
    return toAdminActionError(error)
  }

  revalidatePath("/admin")
  revalidatePath("/", "layout")
  redirect(
    createSiteProfileAdminHref(
      "privacy",
      action === "withdraw"
        ? "site-profile-withdrawn"
        : action === "redact"
          ? "site-profile-redacted"
          : "site-profile-suppressed",
    ),
  )
}
