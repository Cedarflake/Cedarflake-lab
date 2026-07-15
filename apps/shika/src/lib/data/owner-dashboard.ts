import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerDashboardLoader } from "./owner-dashboard-loader"
import { readOwnerDashboard } from "./owner-dashboard-repository"

const loadOwnerDashboard = createOwnerDashboardLoader({
  authorize: requireOwner,
  readDashboard: async (now) =>
    readOwnerDashboard(await getDatabaseConnection(), now),
})

export function getOwnerDashboard(now = Date.now()) {
  return loadOwnerDashboard(now)
}
