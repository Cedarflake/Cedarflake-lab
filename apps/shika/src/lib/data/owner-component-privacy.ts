import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerComponentPrivacyLoader } from "./owner-component-privacy-loader"
import { readOwnerComponentPrivacyReview } from "./owner-component-privacy-repository"

const loadOwnerComponentPrivacyReview = createOwnerComponentPrivacyLoader({
  authorize: requireOwner,
  readReview: async (componentId) =>
    readOwnerComponentPrivacyReview(
      await getDatabaseConnection(),
      componentId,
    ),
})

export function getOwnerComponentPrivacyReview(componentId: string) {
  return loadOwnerComponentPrivacyReview(componentId)
}
