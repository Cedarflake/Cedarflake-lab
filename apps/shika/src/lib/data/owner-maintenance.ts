import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerMaintenanceLoader } from "./owner-maintenance-loader"
import { readOwnerMaintenanceWindows } from "./owner-maintenance-repository"

const loadOwnerMaintenanceWindows = createOwnerMaintenanceLoader({
  authorize: requireOwner,
  readMaintenance: async (now) =>
    readOwnerMaintenanceWindows(await getDatabaseConnection(), now),
})

export function getOwnerMaintenanceWindows(now = Date.now()) {
  return loadOwnerMaintenanceWindows(now)
}
