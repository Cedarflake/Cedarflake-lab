import "server-only"

import { getDatabaseConnection } from "@/lib/db/client"

import {
  readPublicActiveIncidents,
  readPublicIncidentDetail,
} from "./public-incidents-repository"

export async function getPublicActiveIncidents() {
  return readPublicActiveIncidents(await getDatabaseConnection())
}

export async function getPublicIncidentDetail(incidentPublicId: string) {
  return readPublicIncidentDetail(
    await getDatabaseConnection(),
    incidentPublicId,
  )
}
