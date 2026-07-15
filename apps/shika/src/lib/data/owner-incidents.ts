import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerIncidentsLoader } from "./owner-incidents-loader"
import { readOwnerIncidents } from "./owner-incidents-repository"

const loadOwnerIncidents = createOwnerIncidentsLoader({
  authorize: requireOwner,
  readIncidents: async () =>
    readOwnerIncidents(await getDatabaseConnection()),
})

export function getOwnerIncidents() {
  return loadOwnerIncidents()
}
