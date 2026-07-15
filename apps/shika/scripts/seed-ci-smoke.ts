import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { OwnerIdentity } from "../src/lib/auth/owner-account"
import { createComponentForOwner } from "../src/lib/commands/components"
import { createIncidentForOwner } from "../src/lib/commands/incidents"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../src/lib/commands/maintenance"
import { publishSiteProfileForOwner } from "../src/lib/commands/site-profile-publication"
import { saveSiteProfileForOwner } from "../src/lib/commands/site-profile"
import { createDatabaseConnection } from "../src/lib/db/create-database"

const ciDatabaseUrl = "file:/tmp/shika-ci.db"
const outputPath = process.argv[2] ?? "/tmp/shika-smoke.json"

const publicCanaries = {
  siteProfile: "SHIKA_PUBLIC_PROFILE_CANARY",
  component: "SHIKA_PUBLIC_COMPONENT_CANARY",
  incident: "SHIKA_PUBLIC_INCIDENT_CANARY",
  maintenance: "SHIKA_PUBLIC_MAINTENANCE_CANARY",
} as const

const privateCanaries = {
  siteProfileTitle: "SHIKA_PRIVATE_PROFILE_TITLE_CANARY",
  siteProfileSummary: "SHIKA_PRIVATE_PROFILE_SUMMARY_CANARY",
  siteProfileNote: "SHIKA_PRIVATE_PROFILE_NOTE_CANARY",
  componentName: "SHIKA_PRIVATE_COMPONENT_NAME_CANARY",
  componentSummary: "SHIKA_PRIVATE_COMPONENT_SUMMARY_CANARY",
  componentNote: "SHIKA_PRIVATE_COMPONENT_NOTE_CANARY",
  statusSummary: "SHIKA_PRIVATE_STATUS_SUMMARY_CANARY",
  statusNote: "SHIKA_PRIVATE_STATUS_NOTE_CANARY",
  incidentTitle: "SHIKA_PRIVATE_INCIDENT_TITLE_CANARY",
  incidentSummary: "SHIKA_PRIVATE_INCIDENT_SUMMARY_CANARY",
  incidentNote: "SHIKA_PRIVATE_INCIDENT_NOTE_CANARY",
  maintenanceTitle: "SHIKA_PRIVATE_MAINTENANCE_TITLE_CANARY",
  maintenanceSummary: "SHIKA_PRIVATE_MAINTENANCE_SUMMARY_CANARY",
  maintenanceNote: "SHIKA_PRIVATE_MAINTENANCE_NOTE_CANARY",
  privateOnlyComponentName: "SHIKA_PRIVATE_ONLY_COMPONENT_CANARY",
  privateOnlyComponentSummary: "SHIKA_PRIVATE_ONLY_COMPONENT_SUMMARY_CANARY",
  privateOnlyComponentNote: "SHIKA_PRIVATE_ONLY_COMPONENT_NOTE_CANARY",
  privateOnlyStatusSummary: "SHIKA_PRIVATE_ONLY_STATUS_SUMMARY_CANARY",
  privateOnlyStatusNote: "SHIKA_PRIVATE_ONLY_STATUS_NOTE_CANARY",
  privateOnlyIncidentTitle: "SHIKA_PRIVATE_ONLY_INCIDENT_CANARY",
  privateOnlyIncidentSummary: "SHIKA_PRIVATE_ONLY_INCIDENT_SUMMARY_CANARY",
  privateOnlyIncidentNote: "SHIKA_PRIVATE_ONLY_INCIDENT_NOTE_CANARY",
  privateOnlyMaintenanceTitle: "SHIKA_PRIVATE_ONLY_MAINTENANCE_CANARY",
  privateOnlyMaintenanceSummary:
    "SHIKA_PRIVATE_ONLY_MAINTENANCE_SUMMARY_CANARY",
  privateOnlyMaintenanceNote: "SHIKA_PRIVATE_ONLY_MAINTENANCE_NOTE_CANARY",
} as const

const incidentSeverities = {
  public: "minor",
  private: "critical",
} as const

const expectedPublicCounts = {
  activeIncidents: 1,
  components: 1,
  maintenance: 1,
  timeline: 4,
} as const

const owner: OwnerIdentity = {
  userId: "shika-ci-owner",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function main() {
  if (
    process.env.CI !== "true" ||
    process.env.TURSO_DATABASE_URL !== ciDatabaseUrl
  ) {
    throw new Error(
      "The Shika smoke seed only runs in CI against file:/tmp/shika-ci.db",
    )
  }

  const connection = await createDatabaseConnection({ url: ciDatabaseUrl })

  try {
    const profile = await saveSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 0,
      ownerTitle: privateCanaries.siteProfileTitle,
      ownerSummary: privateCanaries.siteProfileSummary,
      publicDraft: {
        title: publicCanaries.siteProfile,
        summary: "Deterministic public profile for the production smoke test",
      },
      timezone: "Asia/Shanghai",
      privateNote: privateCanaries.siteProfileNote,
    })

    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: profile.siteProfileVersion,
      expectedPublicationVersion: 0,
      revisionId: profile.revisionId,
      expectedRevisionVersion: profile.revisionVersion,
    })

    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: privateCanaries.componentName,
      ownerSummary: privateCanaries.componentSummary,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: privateCanaries.componentNote,
      publicName: publicCanaries.component,
      publicSummary: "Public component summary",
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil: null,
        ownerSummary: privateCanaries.statusSummary,
        publicSummary: "Public component status",
        privateNote: privateCanaries.statusNote,
      },
    })

    const maintenanceStartsAt = now - 15 * 60 * 1_000
    const maintenanceEndsAt = now + 45 * 60 * 1_000
    const maintenance = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: privateCanaries.maintenanceTitle,
      ownerSummary: privateCanaries.maintenanceSummary,
      privateNote: privateCanaries.maintenanceNote,
      startsAt: maintenanceStartsAt,
      endsAt: maintenanceEndsAt,
      timezone: "Asia/Shanghai",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion:
            component.componentMetadataPublicationVersion,
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion: 0,
        title: publicCanaries.maintenance,
        summary: "Deterministic public maintenance for route verification",
        startsAt: maintenanceStartsAt,
        endsAt: maintenanceEndsAt,
        timezone: "Asia/Shanghai",
      },
    })

    const maintenanceComponentVersion = maintenance.componentVersions.find(
      ({ componentId }) => componentId === component.componentId,
    )?.componentVersion

    if (maintenanceComponentVersion === undefined) {
      throw new Error(
        "The Shika smoke seed did not update the maintenance component",
      )
    }

    const activeMaintenance = await appendMaintenanceEventForOwner(
      connection,
      owner,
      {
        operation: "start",
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId: maintenance.maintenanceWindowId,
        expectedMaintenanceVersion: maintenance.maintenanceVersion,
        effectiveAt: now,
        ownerSummary: privateCanaries.maintenanceSummary,
        privateNote: privateCanaries.maintenanceNote,
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: maintenanceComponentVersion,
            expectedComponentMetadataPublicationVersion:
              component.componentMetadataPublicationVersion,
            outcome: "unchanged",
          },
        ],
        publication: {
          mode: "public",
          expectedMaintenancePublicationVersion:
            maintenance.maintenancePublicationVersion,
          summary: "Deterministic public maintenance now in progress",
        },
      },
    )

    const activeMaintenanceComponentVersion =
      activeMaintenance.componentVersions.find(
        ({ componentId }) => componentId === component.componentId,
      )?.componentVersion

    if (activeMaintenanceComponentVersion === undefined) {
      throw new Error(
        "The Shika smoke seed did not retain the active maintenance component",
      )
    }

    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: privateCanaries.incidentTitle,
      severity: incidentSeverities.private,
      initialPhase: "investigating",
      ownerSummary: privateCanaries.incidentSummary,
      privateNote: privateCanaries.incidentNote,
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: activeMaintenanceComponentVersion,
          expectedComponentMetadataPublicationVersion:
            component.componentMetadataPublicationVersion,
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: 0,
        publicTitle: publicCanaries.incident,
        publicSeverity: incidentSeverities.public,
        publicSummary: "Deterministic public incident for route verification",
      },
    })

    if (incident.incidentPublicId.length === 0) {
      throw new Error(
        "The Shika smoke seed did not create a public incident ID",
      )
    }

    const privateComponent = await createComponentForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        visibility: "private",
        ownerName: privateCanaries.privateOnlyComponentName,
        ownerSummary: privateCanaries.privateOnlyComponentSummary,
        ownerSortOrder: 1,
        defaultValidityMs: null,
        privateNote: privateCanaries.privateOnlyComponentNote,
        initialStatus: {
          condition: "unavailable",
          effectiveAt: now,
          validUntil: null,
          ownerSummary: privateCanaries.privateOnlyStatusSummary,
          publicSummary: null,
          privateNote: privateCanaries.privateOnlyStatusNote,
        },
      },
    )

    const privateMaintenance = await scheduleMaintenanceForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        title: privateCanaries.privateOnlyMaintenanceTitle,
        ownerSummary: privateCanaries.privateOnlyMaintenanceSummary,
        privateNote: privateCanaries.privateOnlyMaintenanceNote,
        startsAt: now + 8 * 60 * 60 * 1_000,
        endsAt: now + 9 * 60 * 60 * 1_000,
        timezone: "Asia/Shanghai",
        effectiveAt: now,
        affectedComponents: [
          {
            componentId: privateComponent.componentId,
            expectedComponentVersion: privateComponent.componentVersion,
          },
        ],
        publication: { mode: "private" },
      },
    )
    const privateIncidentComponentVersion =
      privateMaintenance.componentVersions.find(
        ({ componentId }) => componentId === privateComponent.componentId,
      )?.componentVersion

    if (privateIncidentComponentVersion === undefined) {
      throw new Error(
        "The Shika smoke seed did not update the private maintenance component",
      )
    }

    await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: privateCanaries.privateOnlyIncidentTitle,
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: privateCanaries.privateOnlyIncidentSummary,
      privateNote: privateCanaries.privateOnlyIncidentNote,
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: privateComponent.componentId,
          expectedComponentVersion: privateIncidentComponentVersion,
        },
      ],
      publication: { mode: "private" },
    })

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          publicIncidentId: incident.incidentPublicId,
          expectedPublicCounts,
          incidentSeverities,
          publicCanaries,
          privateCanaries,
        },
        null,
        2,
      )}\n`,
      "utf8",
    )
  } finally {
    await connection.client.close()
  }
}

void main()
