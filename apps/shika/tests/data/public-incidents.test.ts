import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { closeIncidentPublicationForOwner } from "../../src/lib/commands/incident-publication"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
} from "../../src/lib/commands/incidents"
import {
  PublicIncidentDataIntegrityError,
  readPublicActiveIncidents,
  readPublicIncidentDetail,
  readPublicIncidentDiscovery,
} from "../../src/lib/data/public-incidents-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPublicComponent(
  connection: DatabaseConnection,
  now: number,
  suffix: string,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: `Private component ${suffix}`,
    ownerSummary: `Private component summary ${suffix}`,
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: `Private component note ${suffix}`,
    publicName: `Availability ${suffix}`,
    publicSummary: null,
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: null,
      publicSummary: null,
      privateNote: null,
    },
  })
}

async function createPublicIncident(
  connection: DatabaseConnection,
  now: number,
  suffix: string,
) {
  const component = await createPublicComponent(connection, now, suffix)
  const incident = await createIncidentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    title: `Private incident ${suffix}`,
    severity: "major",
    initialPhase: "investigating",
    ownerSummary: `Private incident summary ${suffix}`,
    privateNote: `Private incident note ${suffix}`,
    effectiveAt: now,
    affectedComponents: [
      {
        componentId: component.componentId,
        expectedComponentVersion: 2,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public",
      expectedPublicationVersion: 0,
      publicTitle: `Public incident ${suffix}`,
      publicSeverity: "minor",
      publicSummary: `Public summary ${suffix}`,
    },
  })

  return { component, incident }
}

describe("public incident repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("discovers current published snapshots without joining owner records", async () => {
    const now = Date.now()
    const { incident } = await createPublicIncident(connection, now, "one")
    const privateComponent = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Private-only component",
      ownerSummary: null,
      ownerSortOrder: 1,
      defaultValidityMs: null,
      privateNote: null,
      initialStatus: null,
    })
    const privateIncident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Private-only incident",
      severity: "minor",
      initialPhase: "investigating",
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now + 1,
      affectedComponents: [
        {
          componentId: privateComponent.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })

    await connection.client.execute({
      sql: "UPDATE incident_updates SET title = 'MUTATED OWNER CANARY', owner_summary = 'PRIVATE OWNER CANARY', private_note = 'PRIVATE NOTE CANARY' WHERE incident_id = ?",
      args: [incident.incidentId],
    })

    const discovery = await readPublicIncidentDiscovery(connection)
    const detail = await readPublicIncidentDetail(
      connection,
      incident.incidentPublicId,
    )

    assert.equal(discovery.length, 1)
    assert.equal(detail?.kind, "published")
    if (detail?.kind !== "published") return
    assert.equal(detail.current.title, "Public incident one")
    assert.equal(detail.current.summary, "Public summary one")
    assert.equal(detail.updates.length, 1)
    assert.equal(
      await readPublicIncidentDetail(
        connection,
        privateIncident.incidentPublicId,
      ),
      null,
    )
    const serialized = JSON.stringify(discovery)
    for (const canary of [
      "MUTATED OWNER CANARY",
      "PRIVATE OWNER CANARY",
      "PRIVATE NOTE CANARY",
      incident.incidentId,
      privateIncident.incidentPublicId,
    ]) {
      assert.equal(serialized.includes(canary), false)
    }
  })

  it("filters resolved incidents from the active projection", async () => {
    const now = Date.now()
    const { component, incident } = await createPublicIncident(
      connection,
      now,
      "resolved",
    )
    await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "resolve",
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      reason: "Recovered",
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now + 1,
      componentOutcomes: [
        {
          mode: "unchanged",
          componentId: component.componentId,
          expectedComponentVersion: 3,
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: 1,
        publicSummary: "Recovered",
      },
    })

    const discovery = await readPublicIncidentDiscovery(connection)
    const active = await readPublicActiveIncidents(connection)
    const detail = await readPublicIncidentDetail(
      connection,
      incident.incidentPublicId,
    )

    assert.equal(discovery[0]?.phase, "resolved")
    assert.equal(active.length, 0)
    assert.equal(detail?.kind, "published")
    assert.equal(
      detail?.kind === "published" ? detail.current.phase : null,
      "resolved",
    )
    assert.deepEqual(
      detail?.kind === "published"
        ? detail.updates.map((update) => update.phase)
        : [],
      ["investigating", "resolved"],
    )
  })

  it("returns a redacted tombstone while withdrawn and suppressed details stay closed", async () => {
    const now = Date.now()
    const withdrawn = await createPublicIncident(connection, now, "withdrawn")
    const suppressed = await createPublicIncident(connection, now + 1, "suppressed")
    const redacted = await createPublicIncident(connection, now + 2, "redacted")
    const suppressedComponentVersion =
      suppressed.incident.componentVersions[0]?.componentVersion
    const redactedComponentVersion =
      redacted.incident.componentVersions[0]?.componentVersion
    assert.equal(typeof suppressedComponentVersion, "number")
    assert.equal(typeof redactedComponentVersion, "number")
    if (
      typeof suppressedComponentVersion !== "number" ||
      typeof redactedComponentVersion !== "number"
    ) {
      return
    }

    await closeIncidentPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      action: "withdraw",
      incidentId: withdrawn.incident.incidentId,
      expectedIncidentVersion: withdrawn.incident.incidentVersion,
      expectedIncidentPublicationVersion:
        withdrawn.incident.incidentPublicationVersion,
    })
    await closeIncidentPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      action: "suppress",
      incidentId: suppressed.incident.incidentId,
      expectedIncidentVersion: suppressed.incident.incidentVersion,
      expectedIncidentPublicationVersion:
        suppressed.incident.incidentPublicationVersion,
      affectedComponents: [
        {
          componentId: suppressed.component.componentId,
          expectedComponentVersion: suppressedComponentVersion,
          expectedComponentMetadataPublicationVersion:
            suppressed.component.componentMetadataPublicationVersion,
        },
      ],
    })
    await closeIncidentPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      action: "redact",
      incidentId: redacted.incident.incidentId,
      expectedIncidentVersion: redacted.incident.incidentVersion,
      expectedIncidentPublicationVersion:
        redacted.incident.incidentPublicationVersion,
      affectedComponents: [
        {
          componentId: redacted.component.componentId,
          expectedComponentVersion: redactedComponentVersion,
          expectedComponentMetadataPublicationVersion:
            redacted.component.componentMetadataPublicationVersion,
        },
      ],
    })

    assert.deepEqual(await readPublicIncidentDiscovery(connection), [])
    assert.equal(
      await readPublicIncidentDetail(
        connection,
        withdrawn.incident.incidentPublicId,
      ),
      null,
    )
    assert.equal(
      await readPublicIncidentDetail(
        connection,
        suppressed.incident.incidentPublicId,
      ),
      null,
    )
    assert.deepEqual(
      await readPublicIncidentDetail(
        connection,
        redacted.incident.incidentPublicId,
      ),
      { kind: "redacted" },
    )
  })

  it("returns every still-public update without reading owner copy", async () => {
    const now = Date.now()
    const { incident } = await createPublicIncident(connection, now, "history")

    await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: incident.incidentId,
      expectedIncidentVersion: incident.incidentVersion,
      to: "identified",
      reason: "PRIVATE REASON CANARY",
      ownerSummary: "PRIVATE OWNER UPDATE CANARY",
      privateNote: "PRIVATE NOTE UPDATE CANARY",
      effectiveAt: now + 1,
      publication: {
        mode: "public",
        expectedPublicationVersion: incident.incidentPublicationVersion,
        publicSummary: "The public cause is known",
      },
    })
    await connection.client.execute({
      sql: "UPDATE incident_updates SET owner_summary = 'MUTATED PRIVATE UPDATE CANARY', private_note = 'MUTATED PRIVATE NOTE CANARY' WHERE incident_id = ?",
      args: [incident.incidentId],
    })

    const detail = await readPublicIncidentDetail(
      connection,
      incident.incidentPublicId,
    )

    assert.equal(detail?.kind, "published")
    if (detail?.kind !== "published") return
    assert.equal(detail.current.phase, "identified")
    assert.deepEqual(
      detail.updates.map((update) => ({
        phase: update.phase,
        summary: update.summary,
      })),
      [
        { phase: "investigating", summary: "Public summary history" },
        { phase: "identified", summary: "The public cause is known" },
      ],
    )

    const serialized = JSON.stringify(detail)
    for (const canary of [
      incident.incidentId,
      "PRIVATE REASON CANARY",
      "PRIVATE OWNER UPDATE CANARY",
      "PRIVATE NOTE UPDATE CANARY",
      "MUTATED PRIVATE UPDATE CANARY",
      "MUTATED PRIVATE NOTE CANARY",
    ]) {
      assert.equal(serialized.includes(canary), false)
    }
  })

  it("fails closed when a current published snapshot is invalid", async () => {
    const now = Date.now()
    const { incident } = await createPublicIncident(connection, now, "invalid")
    await connection.client.execute({
      sql: "UPDATE publication_events SET resulting_current_snapshot_json = '{\"privateNote\":\"CANARY\"}' WHERE stream_type = 'incident' AND stream_id = ?",
      args: [incident.incidentId],
    })

    await assert.rejects(
      readPublicIncidentDiscovery(connection),
      PublicIncidentDataIntegrityError,
    )
  })
})
