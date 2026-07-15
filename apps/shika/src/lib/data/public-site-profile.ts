import "server-only"

import { getDatabaseConnection } from "@/lib/db/client"

import { readPublicSiteProfile } from "./public-site-profile-repository"

export async function getPublicSiteProfile() {
  return readPublicSiteProfile(await getDatabaseConnection())
}
