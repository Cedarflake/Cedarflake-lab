import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerSiteProfileLoader } from "./owner-site-profile-loader"
import { readOwnerSiteProfile } from "./owner-site-profile-repository"

const loadOwnerSiteProfile = createOwnerSiteProfileLoader({
  authorize: requireOwner,
  readProfile: async () =>
    readOwnerSiteProfile(await getDatabaseConnection()),
})

export function getOwnerSiteProfile() {
  return loadOwnerSiteProfile()
}
