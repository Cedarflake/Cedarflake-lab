import "server-only"

import { getDatabaseConnection } from "@/lib/db/client"

import { readPublicMaintenanceWindows } from "./public-maintenance-repository"

export async function getPublicMaintenanceWindows() {
  return readPublicMaintenanceWindows(await getDatabaseConnection())
}
