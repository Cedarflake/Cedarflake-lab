import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import {
  closeComponentPublicationForOwner,
  type CloseComponentPublicationInput,
} from "../../src/lib/commands/component-publication"
import { publishComponentForOwner } from "../../src/lib/commands/component-metadata"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { CommandValidationError } from "../../src/lib/commands/errors"
import { createIncidentForOwner } from "../../src/lib/commands/incidents"
import { scheduleMaintenanceForOwner } from "../../src/lib/commands/maintenance"
import { readPublicIncidentDetail } from "../../src/lib/data/public-incidents-repository"
import { readPublicMaintenanceWindows } from "../../src/lib/data/public-maintenance-repository"
import { readPublicStatusPage } from "../../src/lib/data/public-status-repository"
import { readPublicTimelinePage } from "../../src/lib/data/public-timeline-repository"
import { readOwnerComponentPrivacyReview } from "../../src/lib/data/owner-component-privacy-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createPublicCursorCodec } from "../../src/lib/timeline/public-cursor"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

const cursorCodec = createPublicCursorCodec(
  "component-publication-test-cursor-secret-001",
)

async function createPublicComponent(
  connection: DatabaseConnection,
  now: number,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "OWNER-CANARY-COMPONENT",
    ownerSummary: "OWNER-CANARY-COMPONENT-SUMMARY",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "OWNER-CANARY-COMPONENT-NOTE",
    publicName: "Public availability",
    publicSummary: "Public component summary",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "OWNER-CANARY-STATUS-SUMMARY",
      publicSummary: "Public status summary",
      privateNote: "OWNER-CANARY-STATUS-NOTE",
    },
  })
}

async function createPublicIncident(
  connection: DatabaseConnection,
  componentId: string,
  expectedComponentVersion: number,
  now: number,
) {
  return createIncidentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-INCIDENT-TITLE",
    severity: "major",
    initialPhase: "investigating",
    ownerSummary: "OWNER-CANARY-INCIDENT-SUMMARY",
    privateNote: "OWNER-CANARY-INCIDENT-NOTE",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public",
      expectedPublicationVersion: 0,
      publicTitle: "Public incident",
      publicSeverity: "minor",
      publicSummary: "Public incident summary",
    },
  })
}

async function createPublicMaintenance(
  connection: DatabaseConnection,
  componentId: string,
  expectedComponentVersion: number,
  now: number,
) {
  return scheduleMaintenanceForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-MAINTENANCE-TITLE",
    ownerSummary: "OWNER-CANARY-MAINTENANCE-SUMMARY",
    privateNote: "OWNER-CANARY-MAINTENANCE-NOTE",
    startsAt: now + 60_000,
    endsAt: now + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public",
      expectedMaintenancePublicationVersion: 0,
      title: "Public maintenance",
      summary: "Public maintenance summary",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
    },
  })
}

function baseInput(input: {
  componentId: string
  componentVersion: number
  action: CloseComponentPublicationInput["action"]
}): CloseComponentPublicationInput {
  return {
    idempotencyKey: crypto.randomUUID(),
    componentId: input.componentId,
    expectedComponentVersion: input.componentVersion,
    expectedMetadataPublicationVersion: 1,
    expectedStatusPublicationVersion: 1,
    action: input.action,
    dependentParents: [],
    relatedComponents: [],
  }
}

describe("component publication closure", () => {
  let connection: DatabaseConnection
  let now: number

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
    now = Date.now()
  })

  afterEach(() => connection.client.close())

  it("withdraws the public component atomically and retains safe history", async () => {
    const component = await createPublicComponent(connection, now)
    const input = baseInput({
      componentId: component.componentId,
      componentVersion: component.componentVersion,
      action: "withdraw",
    })
    const first = await closeComponentPublicationForOwner(
      connection,
      owner,
      input,
    )
    const replay = await closeComponentPublicationForOwner(
      connection,
      owner,
      input,
    )
    const page = await readPublicStatusPage(connection, now)
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })
    const events = await connection.client.execute({
      sql: "SELECT stream_type, action, public_privacy_epoch FROM publication_events WHERE stream_id = ? ORDER BY public_ordinal",
      args: [component.componentId],
    })

    assert.deepEqual(replay, first)
    assert.equal(first.componentVersion, component.componentVersion + 1)
    assert.equal(first.metadataPublicationVersion, 2)
    assert.equal(first.statusPublicationVersion, 2)
    assert.equal(first.publicPrivacyEpoch, 0)
    assert.deepEqual(first.parentPublications, [])
    assert.equal(page.components.length, 0)
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "withdrawn").length,
        1,
      )
      assert.equal(
        timeline.entries.filter(
          (entry) => entry.kind === "component_status",
        ).length,
        1,
      )
    }
    assert.deepEqual(
      events.rows.map((row) => [row.stream_type, row.action]),
      [
        ["component_metadata", "publish"],
        ["component_status", "publish"],
        ["component_metadata", "withdraw"],
        ["component_status", "withdraw"],
      ],
    )
    assert.equal(
      events.rows.every((row) => Number(row.public_privacy_epoch) === 0),
      true,
    )
  })

  it("blocks withdrawal while any public parent history names the component", async () => {
    const component = await createPublicComponent(connection, now)
    await createPublicIncident(
      connection,
      component.componentId,
      component.componentVersion,
      now,
    )
    const before = await connection.client.execute({
      sql: "SELECT (SELECT version FROM components WHERE id = ?) AS version, (SELECT count(*) FROM publication_events) AS events, (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal",
      args: [component.componentId],
    })

    await assert.rejects(
      closeComponentPublicationForOwner(
        connection,
        owner,
        baseInput({
          componentId: component.componentId,
          componentVersion: component.componentVersion + 1,
          action: "withdraw",
        }),
      ),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "COMPONENT_HAS_PUBLIC_DEPENDENCIES",
    )

    const after = await connection.client.execute({
      sql: "SELECT (SELECT version FROM components WHERE id = ?) AS version, (SELECT count(*) FROM publication_events) AS events, (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal",
      args: [component.componentId],
    })
    assert.deepEqual(after.rows[0], before.rows[0])
  })

  it("redacts component and all dependant parent streams in one privacy epoch", async () => {
    const component = await createPublicComponent(connection, now)
    const incident = await createPublicIncident(
      connection,
      component.componentId,
      component.componentVersion,
      now,
    )
    const maintenance = await createPublicMaintenance(
      connection,
      component.componentId,
      component.componentVersion + 1,
      now,
    )
    const review = await readOwnerComponentPrivacyReview(
      connection,
      component.componentId,
    )
    assert.ok(review)
    assert.equal(review.withdraw.isAvailable, false)
    assert.equal(review.withdraw.unavailableReason, "historical_dependants")
    assert.equal(review.redact.isAvailable, true)
    assert.equal(review.suppress.isAvailable, true)
    assert.deepEqual(
      review.redact.dependentParents.map((parent) =>
        parent.kind === "incident"
          ? `incident:${parent.incidentId}`
          : `maintenance:${parent.maintenanceWindowId}`,
      ),
      [
        `incident:${incident.incidentId}`,
        `maintenance:${maintenance.maintenanceWindowId}`,
      ],
    )
    assert.deepEqual(review.redact.relatedComponents, [])
    const result = await closeComponentPublicationForOwner(
      connection,
      owner,
      {
        ...baseInput({
          componentId: component.componentId,
          componentVersion: review.target.componentVersion,
          action: "redact",
        }),
        dependentParents: [...review.redact.dependentParents],
      },
    )
    const page = await readPublicStatusPage(connection, now)
    const incidentDetail = await readPublicIncidentDetail(
      connection,
      incident.incidentPublicId,
    )
    const maintenanceWindows = await readPublicMaintenanceWindows(connection)
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })
    const closures = await connection.client.execute(
      "SELECT action, public_privacy_epoch, correlation_id FROM publication_events WHERE action = 'redact' ORDER BY public_ordinal",
    )

    assert.equal(result.componentVersion, component.componentVersion + 5)
    assert.equal(result.metadataPublicationVersion, 2)
    assert.equal(result.statusPublicationVersion, 2)
    assert.equal(result.publicPrivacyEpoch, 1)
    assert.deepEqual(result.componentVersions, [
      {
        componentId: component.componentId,
        componentVersion: component.componentVersion + 5,
      },
    ])
    assert.deepEqual(
      result.parentPublications.map((parent) => parent.kind),
      ["incident", "maintenance"],
    )
    assert.equal(page.components.length, 0)
    assert.deepEqual(incidentDetail, { kind: "redacted" })
    assert.equal(maintenanceWindows.length, 0)
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "redacted").length,
        3,
      )
      const serialized = JSON.stringify(timeline.entries)
      assert.equal(serialized.includes(component.componentPublicId), false)
      assert.equal(serialized.includes("Public availability"), false)
    }
    assert.equal(closures.rows.length, 4)
    assert.equal(
      closures.rows.every(
        (row) => Number(row.public_privacy_epoch) === result.publicPrivacyEpoch,
      ),
      true,
    )
    assert.equal(
      new Set(closures.rows.map((row) => String(row.correlation_id))).size,
      1,
    )
  })

  it("suppresses every component and parent tombstone after redaction", async () => {
    const component = await createPublicComponent(connection, now)
    const incident = await createPublicIncident(
      connection,
      component.componentId,
      component.componentVersion,
      now,
    )
    const maintenance = await createPublicMaintenance(
      connection,
      component.componentId,
      component.componentVersion + 1,
      now,
    )
    const parentGuards = [
      {
        kind: "incident" as const,
        incidentId: incident.incidentId,
        expectedIncidentVersion: incident.incidentVersion,
        expectedIncidentPublicationVersion:
          incident.incidentPublicationVersion,
      },
      {
        kind: "maintenance" as const,
        maintenanceWindowId: maintenance.maintenanceWindowId,
        expectedMaintenanceVersion: maintenance.maintenanceVersion,
        expectedMaintenancePublicationVersion:
          maintenance.maintenancePublicationVersion,
      },
    ]
    const redacted = await closeComponentPublicationForOwner(
      connection,
      owner,
      {
        ...baseInput({
          componentId: component.componentId,
          componentVersion: component.componentVersion + 2,
          action: "redact",
        }),
        dependentParents: parentGuards,
      },
    )
    const redactedParents = new Map(
      redacted.parentPublications.map((parent) => [parent.kind, parent]),
    )
    const incidentParent = redactedParents.get("incident")
    const maintenanceParent = redactedParents.get("maintenance")
    assert.equal(incidentParent?.kind, "incident")
    assert.equal(maintenanceParent?.kind, "maintenance")
    if (
      incidentParent?.kind !== "incident" ||
      maintenanceParent?.kind !== "maintenance"
    ) {
      throw new Error("Expected both redacted parent streams")
    }

    const suppressed = await closeComponentPublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: redacted.componentVersion,
        expectedMetadataPublicationVersion:
          redacted.metadataPublicationVersion,
        expectedStatusPublicationVersion: redacted.statusPublicationVersion,
        action: "suppress",
        dependentParents: [
          {
            kind: "incident",
            incidentId: incident.incidentId,
            expectedIncidentVersion: incident.incidentVersion,
            expectedIncidentPublicationVersion:
              incidentParent.incidentPublicationVersion,
          },
          {
            kind: "maintenance",
            maintenanceWindowId: maintenance.maintenanceWindowId,
            expectedMaintenanceVersion: maintenance.maintenanceVersion,
            expectedMaintenancePublicationVersion:
              maintenanceParent.maintenancePublicationVersion,
          },
        ],
        relatedComponents: [],
      },
    )
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })
    const suppressions = await connection.client.execute(
      "SELECT public_privacy_epoch, target_snapshot_json, timeline_snapshot_json FROM publication_events WHERE action = 'suppress' ORDER BY public_ordinal",
    )

    assert.equal(suppressed.componentVersion, redacted.componentVersion + 3)
    assert.equal(suppressed.publicPrivacyEpoch, 2)
    assert.equal(
      await readPublicIncidentDetail(connection, incident.incidentPublicId),
      null,
    )
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") assert.equal(timeline.entries.length, 0)
    assert.equal(suppressions.rows.length, 4)
    assert.equal(
      suppressions.rows.every(
        (row) =>
          Number(row.public_privacy_epoch) === 2 &&
          row.target_snapshot_json === null &&
          row.timeline_snapshot_json === null,
      ),
      true,
    )
  })

  it("updates shared dependant component versions through one delta ledger", async () => {
    const target = await createPublicComponent(connection, now)
    const collateral = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "OWNER-CANARY-COLLATERAL",
      ownerSummary: null,
      ownerSortOrder: 1,
      defaultValidityMs: null,
      privateNote: null,
      publicName: "Collateral availability",
      publicSummary: null,
      publicSortOrder: 1,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 500,
        validUntil: null,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Shared incident",
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now,
      affectedComponents: [target, collateral].map((component) => ({
        componentId: component.componentId,
        expectedComponentVersion: component.componentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      })),
      publication: {
        mode: "public",
        expectedPublicationVersion: 0,
        publicTitle: "Shared public incident",
        publicSeverity: "minor",
        publicSummary: null,
      },
    })
    const maintenance = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Shared maintenance",
      ownerSummary: null,
      privateNote: null,
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
      effectiveAt: now,
      affectedComponents: [target, collateral].map((component) => ({
        componentId: component.componentId,
        expectedComponentVersion: component.componentVersion + 1,
        expectedComponentMetadataPublicationVersion: 1,
      })),
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion: 0,
        title: "Shared public maintenance",
        summary: null,
        startsAt: now + 60_000,
        endsAt: now + 120_000,
        timezone: "Asia/Shanghai",
      },
    })
    const result = await closeComponentPublicationForOwner(
      connection,
      owner,
      {
        ...baseInput({
          componentId: target.componentId,
          componentVersion: target.componentVersion + 2,
          action: "redact",
        }),
        dependentParents: [
          {
            kind: "incident",
            incidentId: incident.incidentId,
            expectedIncidentVersion: incident.incidentVersion,
            expectedIncidentPublicationVersion:
              incident.incidentPublicationVersion,
          },
          {
            kind: "maintenance",
            maintenanceWindowId: maintenance.maintenanceWindowId,
            expectedMaintenanceVersion: maintenance.maintenanceVersion,
            expectedMaintenancePublicationVersion:
              maintenance.maintenancePublicationVersion,
          },
        ],
        relatedComponents: [
          {
            componentId: collateral.componentId,
            expectedComponentVersion: collateral.componentVersion + 2,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
      },
    )
    const versions = new Map(
      result.componentVersions.map((component) => [
        component.componentId,
        component.componentVersion,
      ]),
    )
    const page = await readPublicStatusPage(connection, now)

    assert.equal(versions.get(target.componentId), target.componentVersion + 5)
    assert.equal(
      versions.get(collateral.componentId),
      collateral.componentVersion + 4,
    )
    assert.equal(
      page.components.some(
        (component) =>
          component.componentPublicId === collateral.componentPublicId,
      ),
      true,
    )
    assert.equal(
      page.components.some(
        (component) => component.componentPublicId === target.componentPublicId,
      ),
      false,
    )
  })

  it("never republishes a redacted component revision", async () => {
    const component = await createPublicComponent(connection, now)
    const redacted = await closeComponentPublicationForOwner(
      connection,
      owner,
      baseInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        action: "redact",
      }),
    )
    const before = await connection.client.execute({
      sql: "SELECT (SELECT version FROM components WHERE id = ?) AS version, (SELECT count(*) FROM publication_events) AS events, (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal",
      args: [component.componentId],
    })

    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: redacted.componentVersion,
        expectedMetadataPublicationVersion:
          redacted.metadataPublicationVersion,
        expectedStatusPublicationVersion: redacted.statusPublicationVersion,
        startingReport: {
          condition: "available",
          effectiveAt: now - 100,
          validUntil: null,
          ownerSummary: null,
          publicSummary: "A forbidden republish",
          privateNote: null,
        },
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_TERMINAL",
    )

    const after = await connection.client.execute({
      sql: "SELECT (SELECT version FROM components WHERE id = ?) AS version, (SELECT count(*) FROM publication_events) AS events, (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal",
      args: [component.componentId],
    })
    assert.deepEqual(after.rows[0], before.rows[0])
  })
})
