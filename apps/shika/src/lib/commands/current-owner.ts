import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createComponentForOwner } from "./components"
import { closeComponentPublicationForOwner } from "./component-publication"
import {
  changeComponentLifecycleForOwner,
  publishComponentForOwner,
  saveComponentMetadataForOwner,
} from "./component-metadata"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
  reviseIncidentMetadataForOwner,
} from "./incidents"
import { closeIncidentPublicationForOwner } from "./incident-publication"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "./maintenance"
import { closeMaintenancePublicationForOwner } from "./maintenance-publication"
import { createOwnerCommandRunner } from "./owner-command-runner"
import { publishMaintenanceForOwner } from "./publish-maintenance"
import { saveSiteProfileForOwner } from "./site-profile"
import {
  closeSiteProfilePublicationForOwner,
  publishSiteProfileForOwner,
} from "./site-profile-publication"
import { reportStatusForOwner } from "./status"
import { closeStatusPublicationForOwner } from "./status-publication"

const runCreateComponent = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    createComponentForOwner(await getDatabaseConnection(), owner, input),
})

const runSaveComponentMetadata = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    saveComponentMetadataForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runCloseComponentPublication = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    closeComponentPublicationForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runPublishComponent = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    publishComponentForOwner(await getDatabaseConnection(), owner, input),
})

const runChangeComponentLifecycle = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    changeComponentLifecycleForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runReportStatus = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    reportStatusForOwner(await getDatabaseConnection(), owner, input),
})

const runCloseStatusPublication = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    closeStatusPublicationForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runCreateIncident = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    createIncidentForOwner(await getDatabaseConnection(), owner, input),
})

const runAppendIncidentUpdate = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    appendIncidentUpdateForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runReviseIncidentMetadata = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    reviseIncidentMetadataForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runCloseIncidentPublication = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    closeIncidentPublicationForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runScheduleMaintenance = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    scheduleMaintenanceForOwner(await getDatabaseConnection(), owner, input),
})

const runAppendMaintenanceEvent = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    appendMaintenanceEventForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runCloseMaintenancePublication = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    closeMaintenancePublicationForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runPublishMaintenance = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    publishMaintenanceForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

const runSaveSiteProfile = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    saveSiteProfileForOwner(await getDatabaseConnection(), owner, input),
})

const runPublishSiteProfile = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    publishSiteProfileForOwner(await getDatabaseConnection(), owner, input),
})

const runCloseSiteProfilePublication = createOwnerCommandRunner({
  authorize: requireOwner,
  execute: async (owner, input: unknown) =>
    closeSiteProfilePublicationForOwner(
      await getDatabaseConnection(),
      owner,
      input,
    ),
})

export async function createComponentForCurrentOwner(input: unknown) {
  return runCreateComponent(input)
}

export async function saveComponentMetadataForCurrentOwner(input: unknown) {
  return runSaveComponentMetadata(input)
}

export async function closeComponentPublicationForCurrentOwner(
  input: unknown,
) {
  return runCloseComponentPublication(input)
}

export async function publishComponentForCurrentOwner(input: unknown) {
  return runPublishComponent(input)
}

export async function changeComponentLifecycleForCurrentOwner(input: unknown) {
  return runChangeComponentLifecycle(input)
}

export async function reportStatusForCurrentOwner(input: unknown) {
  return runReportStatus(input)
}

export async function closeStatusPublicationForCurrentOwner(input: unknown) {
  return runCloseStatusPublication(input)
}

export async function createIncidentForCurrentOwner(input: unknown) {
  return runCreateIncident(input)
}

export async function appendIncidentUpdateForCurrentOwner(input: unknown) {
  return runAppendIncidentUpdate(input)
}

export async function reviseIncidentMetadataForCurrentOwner(input: unknown) {
  return runReviseIncidentMetadata(input)
}

export async function closeIncidentPublicationForCurrentOwner(input: unknown) {
  return runCloseIncidentPublication(input)
}

export async function scheduleMaintenanceForCurrentOwner(input: unknown) {
  return runScheduleMaintenance(input)
}

export async function appendMaintenanceEventForCurrentOwner(input: unknown) {
  return runAppendMaintenanceEvent(input)
}

export async function closeMaintenancePublicationForCurrentOwner(
  input: unknown,
) {
  return runCloseMaintenancePublication(input)
}

export async function publishMaintenanceForCurrentOwner(input: unknown) {
  return runPublishMaintenance(input)
}

export async function saveSiteProfileForCurrentOwner(input: unknown) {
  return runSaveSiteProfile(input)
}

export async function publishSiteProfileForCurrentOwner(input: unknown) {
  return runPublishSiteProfile(input)
}

export async function closeSiteProfilePublicationForCurrentOwner(
  input: unknown,
) {
  return runCloseSiteProfilePublication(input)
}
