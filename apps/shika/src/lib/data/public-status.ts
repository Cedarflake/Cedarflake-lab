import "server-only"

import { getDatabaseConnection } from "@/lib/db/client"

import { readPublicStatusPage } from "./public-status-repository"

export async function getPublicStatusPage(now = Date.now()) {
  return readPublicStatusPage(await getDatabaseConnection(), now)
}
