import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { DomainRuleError } from "../../src/domain/errors"
import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { saveComponentMetadataForOwner } from "../../src/lib/commands/component-metadata"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { closeIncidentPublicationForOwner } from "../../src/lib/commands/incident-publication"
import { createIncidentForOwner } from "../../src/lib/commands/incidents"
import { scheduleMaintenanceForOwner } from "../../src/lib/commands/maintenance"
import { reportStatusForOwner } from "../../src/lib/commands/status"
import { createOwnerTimelineLoader } from "../../src/lib/data/owner-timeline-loader"
import {
  readOwnerTimelinePage,
  type OwnerIncidentTimelineEntryDto,
  type OwnerMaintenanceTimelineEntryDto,
  type OwnerStatusTimelineEntryDto,
} from "../../src/lib/data/owner-timeline-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPublicComponent(
  connection: DatabaseConnection,
  effectiveAt: number,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Internal availability",
    ownerSummary: "Owner component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Owner component note",
    publicName: "Availability",
    publicSummary: "Public component summary",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt,
      validUntil: null,
      ownerSummary: "Initial owner status",
      publicSummary: "Initial public status",
      privateNote: "Initial private status note",
    },
  })
}

function privateIncidentInput(
  componentId: string,
  expectedComponentVersion: number,
  effectiveAt: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Owner incident title",
    severity: "major" as const,
    initialPhase: "investigating" as const,
    ownerSummary: "Owner incident summary",
    privateNote: "Owner incident private note",
    effectiveAt,
    affectedComponents: [{ componentId, expectedComponentVersion }],
    publication: { mode: "private" as const },
  }
}

function publicIncidentInput(
  componentId: string,
  expectedComponentVersion: number,
  effectiveAt: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Owner incident title",
    severity: "major" as const,
    initialPhase: "investigating" as const,
    ownerSummary: "Owner incident summary",
    privateNote: "Owner incident private note",
    effectiveAt,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedPublicationVersion: 0 as const,
      publicTitle: "Public incident title",
      publicSeverity: "minor" as const,
      publicSummary: "Public incident summary",
    },
  }
}

describe("owner timeline repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("merges every owner source without dropping unpublished records", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 4_000)
    const privateStatus = await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      condition: "degraded",
      effectiveAt: now - 3_000,
      validUntil: null,
      ownerSummary: "Private status summary",
      privateNote: "Private status note",
      publication: { mode: "private" },
    })
    const incident = await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(
        component.componentId,
        privateStatus.componentVersion,
        now - 2_000,
      ),
    )
    const incidentComponentVersion =
      incident.componentVersions[0]?.componentVersion
    assert.ok(incidentComponentVersion)
    await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner maintenance title",
      ownerSummary: "Owner maintenance summary",
      privateNote: "Owner maintenance private note",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
      effectiveAt: now - 1_000,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: incidentComponentVersion,
        },
      ],
      publication: { mode: "private" },
    })

    const page = await readOwnerTimelinePage(connection, { limit: 10 })

    assert.deepEqual(
      page.entries.map((entry) => entry.kind),
      ["maintenance", "incident", "component_status", "component_status"],
    )
    assert.equal(
      new Set(page.entries.map((entry) => entry.ownerOrdinal)).size,
      page.entries.length,
    )
    assert.equal(page.nextCursor, null)

    const statusEntries = page.entries.filter(
      (entry): entry is OwnerStatusTimelineEntryDto =>
        entry.kind === "component_status",
    )
    assert.deepEqual(
      statusEntries.map((entry) => ({
        condition: entry.condition,
        disposition: entry.publicState.disposition,
      })),
      [
        { condition: "degraded", disposition: "private" },
        { condition: "available", disposition: "published" },
      ],
    )
    assert.equal(statusEntries[0]?.ownerSummary, "Private status summary")
    assert.equal(statusEntries[0]?.privateNote, "Private status note")
    assert.equal(statusEntries[0]?.ownerNameSnapshot, "Internal availability")

    const incidentEntry = page.entries.find(
      (entry): entry is OwnerIncidentTimelineEntryDto =>
        entry.kind === "incident",
    )
    assert.ok(incidentEntry)
    assert.equal(incidentEntry.publicState.disposition, "private")
    assert.equal(incidentEntry.publicDetailHref, null)
    assert.deepEqual(incidentEntry.affectedComponents, [
      {
        position: 0,
        componentId: component.componentId,
        componentVersion: incidentComponentVersion,
        componentRevisionId:
          incidentEntry.affectedComponents[0]?.componentRevisionId,
        ownerName: "Internal availability",
      },
    ])
    assert.deepEqual(incidentEntry.publicAffectedComponents, [])

    const maintenanceEntry = page.entries.find(
      (entry): entry is OwnerMaintenanceTimelineEntryDto =>
        entry.kind === "maintenance",
    )
    assert.ok(maintenanceEntry)
    assert.equal(maintenanceEntry.publicState.disposition, "private")
    assert.equal(
      maintenanceEntry.affectedComponents[0]?.ownerName,
      "Internal availability",
    )
    assert.equal(
      maintenanceEntry.affectedComponents[0]?.publicSnapshot,
      null,
    )

    const serialized = JSON.stringify(page)
    for (const ownerCopy of [
      "Private status summary",
      "Private status note",
      "Owner incident summary",
      "Owner incident private note",
      "Owner maintenance summary",
      "Owner maintenance private note",
    ]) {
      assert.equal(serialized.includes(ownerCopy), true)
    }
  })

  it("marks publication closure and removes a stale public detail link", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(
        component.componentId,
        component.componentVersion,
        now,
      ),
    )
    const before = await readOwnerTimelinePage(connection, { limit: 10 })
    const publishedEntry = before.entries.find(
      (entry): entry is OwnerIncidentTimelineEntryDto =>
        entry.kind === "incident",
    )
    assert.ok(publishedEntry)
    assert.equal(publishedEntry.publicState.exposure, "public")
    assert.equal(publishedEntry.publicState.disposition, "published")
    assert.equal(
      publishedEntry.publicDetailHref,
      `/incidents/${incident.incidentPublicId}`,
    )
    assert.equal(publishedEntry.publicAffectedComponents[0]?.name, "Availability")

    await closeIncidentPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      action: "withdraw",
      incidentId: incident.incidentId,
      expectedIncidentVersion: incident.incidentVersion,
      expectedIncidentPublicationVersion:
        incident.incidentPublicationVersion,
    })
    const after = await readOwnerTimelinePage(connection, { limit: 10 })
    const withdrawnEntry = after.entries.find(
      (entry): entry is OwnerIncidentTimelineEntryDto =>
        entry.kind === "incident",
    )
    assert.ok(withdrawnEntry)
    assert.equal(withdrawnEntry.publicState.exposure, "closed")
    assert.equal(withdrawnEntry.publicState.disposition, "withdrawn")
    assert.equal(withdrawnEntry.publicDetailHref, null)
  })

  it("keeps status owner names stable after component metadata is renamed", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 2_000)
    const renamed = await saveComponentMetadataForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      expectedMetadataPublicationVersion:
        component.componentMetadataPublicationVersion,
      ownerName: "Renamed internal availability",
      ownerSummary: "Renamed owner component summary",
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "Renamed owner component note",
      publicDraft: {
        name: "Availability",
        summary: "Public component summary",
        sortOrder: 0,
      },
    })
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: renamed.componentVersion,
      condition: "degraded",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Status after rename",
      privateNote: null,
      publication: { mode: "private" },
    })

    const page = await readOwnerTimelinePage(connection, { limit: 10 })
    const statusEntries = page.entries.filter(
      (entry): entry is OwnerStatusTimelineEntryDto =>
        entry.kind === "component_status",
    )

    assert.deepEqual(
      statusEntries.map((entry) => ({
        summary: entry.ownerSummary,
        ownerNameSnapshot: entry.ownerNameSnapshot,
      })),
      [
        {
          summary: "Status after rename",
          ownerNameSnapshot: "Renamed internal availability",
        },
        {
          summary: "Initial owner status",
          ownerNameSnapshot: "Internal availability",
        },
      ],
    )
  })

  it("keeps a stable owner snapshot across pages", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 3_000)
    const second = await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      condition: "limited",
      effectiveAt: now - 2_000,
      validUntil: null,
      ownerSummary: "Second owner report",
      privateNote: null,
      publication: { mode: "private" },
    })
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: second.componentVersion,
      condition: "degraded",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Third owner report",
      privateNote: null,
      publication: { mode: "private" },
    })
    const firstPage = await readOwnerTimelinePage(connection, { limit: 2 })
    assert.deepEqual(
      firstPage.entries.map((entry) => entry.ownerSummary),
      ["Third owner report", "Second owner report"],
    )
    assert.ok(firstPage.nextCursor)

    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: second.componentVersion + 1,
      condition: "unavailable",
      effectiveAt: now,
      validUntil: null,
      ownerSummary: "New after page one",
      privateNote: null,
      publication: { mode: "private" },
    })
    const secondPage = await readOwnerTimelinePage(connection, {
      limit: 2,
      cursor: firstPage.nextCursor,
    })

    assert.deepEqual(
      secondPage.entries.map((entry) => entry.ownerSummary),
      ["Initial owner status"],
    )
    assert.equal(secondPage.nextCursor, null)
    assert.equal(JSON.stringify(secondPage).includes("New after page one"), false)
  })

  it("fails closed when owner source ordinals collide across tables", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(component.componentId, component.componentVersion, now),
    )
    const statusResult = await connection.client.execute(
      "SELECT owner_ordinal FROM status_transitions LIMIT 1",
    )
    const statusOrdinal = statusResult.rows[0]?.owner_ordinal
    assert.ok(statusOrdinal)
    await connection.client.execute({
      sql: "UPDATE incident_updates SET owner_ordinal = ?",
      args: [statusOrdinal],
    })

    await assert.rejects(
      readOwnerTimelinePage(connection, { limit: 10 }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "DUPLICATE_OWNER_TIMELINE_ORDINAL",
    )
  })
})

describe("owner timeline loader", () => {
  it("authorizes before reading owner history", async () => {
    let wasRead = false
    const load = createOwnerTimelineLoader({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      readTimeline: async () => {
        wasRead = true
        return { entries: [], nextCursor: null }
      },
    })

    await assert.rejects(load({ limit: 10 }), /unauthorized/)
    assert.equal(wasRead, false)
  })
})
