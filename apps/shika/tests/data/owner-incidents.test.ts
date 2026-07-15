import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
  reviseIncidentMetadataForOwner,
} from "../../src/lib/commands/incidents"
import { createOwnerIncidentsLoader } from "../../src/lib/data/owner-incidents-loader"
import {
  OwnerIncidentDataIntegrityError,
  readOwnerIncidents,
} from "../../src/lib/data/owner-incidents-repository"
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
  options: {
    ownerName: string
    publicName: string
    sortOrder: number
  } = {
    ownerName: "Private availability name",
    publicName: "Availability",
    sortOrder: 0,
  },
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: options.ownerName,
    ownerSummary: "Private component summary",
    ownerSortOrder: options.sortOrder,
    defaultValidityMs: null,
    privateNote: "Private component note",
    publicName: options.publicName,
    publicSummary: null,
    publicSortOrder: options.sortOrder,
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

describe("owner incident repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns complete immutable updates, references, and latest phase", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Private incident title",
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: "Private creation summary",
      privateNote: "Private creation note",
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
        publicTitle: "Public incident title",
        publicSeverity: "minor",
        publicSummary: "Public creation summary",
      },
    })
    const privateNote = await appendIncidentUpdateForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "note",
        incidentId: incident.incidentId,
        expectedIncidentVersion: 1,
        ownerSummary: "Private follow-up summary",
        privateNote: "Private follow-up note",
        effectiveAt: now + 1,
        publication: { mode: "private" },
      },
    )
    const publicPhase = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: incident.incidentId,
      expectedIncidentVersion: privateNote.incidentVersion,
      to: "identified",
      reason: "The cause is known",
      ownerSummary: "Private diagnosis",
      privateNote: "Private diagnostic detail",
      effectiveAt: now + 2,
      publication: {
        mode: "public",
        expectedPublicationVersion: 1,
        publicSummary: "The cause has been identified",
      },
    })

    const incidents = await readOwnerIncidents(connection)
    const ownerIncident = incidents[0]

    assert.equal(incidents.length, 1)
    assert.equal(ownerIncident?.incidentId, incident.incidentId)
    assert.equal(ownerIncident?.version, 3)
    assert.equal(ownerIncident?.latestPhase, "identified")
    assert.equal(ownerIncident?.latestSeverity, "major")
    assert.equal(ownerIncident?.latestTitle, "Private incident title")
    assert.deepEqual(
      ownerIncident?.updates.map((update) => [
        update.incidentVersion,
        update.kind,
        update.phase,
      ]),
      [
        [1, "created", "investigating"],
        [2, "note", "investigating"],
        [3, "phase", "identified"],
      ],
    )
    assert.equal(
      ownerIncident?.updates[1]?.ownerSummary,
      "Private follow-up summary",
    )
    assert.equal(
      ownerIncident?.updates[1]?.privateNote,
      "Private follow-up note",
    )
    assert.equal(ownerIncident?.updates[1]?.publicCandidate, null)
    assert.equal(
      ownerIncident?.updates[2]?.publicCandidate?.summary,
      "The cause has been identified",
    )
    assert.equal(
      ownerIncident?.updates[0]?.affectedComponents[0]?.ownerName,
      "Private availability name",
    )
    assert.deepEqual(
      ownerIncident?.updates[0]?.publicAffectedComponents[0],
      {
        position: 0,
        componentId: component.componentId,
        componentPublicId: component.componentPublicId,
        name: "Availability",
        componentMetadataPublicationVersion: 1,
      },
    )
    assert.deepEqual(ownerIncident?.updates[1]?.publicAffectedComponents, [])
    assert.equal(ownerIncident?.publication.version, 2)
    assert.equal(ownerIncident?.publication.lastAction, "publish")
    assert.equal(
      ownerIncident?.publication.resultingDisposition,
      "published",
    )
    assert.equal(
      ownerIncident?.publication.sourceUpdateId,
      publicPhase.incidentUpdateId,
    )
    assert.deepEqual(ownerIncident?.publication.currentSnapshot, {
      schemaVersion: 1,
      incidentPublicId: incident.incidentPublicId,
      publicEntryId: ownerIncident?.updates[2]?.publicEntryId,
      title: "Public incident title",
      phase: "identified",
      severity: "minor",
      summary: "The cause has been identified",
      affectedComponents: [
        {
          componentPublicId: component.componentPublicId,
          name: "Availability",
          position: 0,
        },
      ],
      effectiveAt: now + 2,
    })
  })

  it("returns private incident records without inventing publication state", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Private energy",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "Private component note",
      initialStatus: null,
    })
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Private-only incident",
      severity: "minor",
      initialPhase: "monitoring",
      ownerSummary: "Owner summary",
      privateNote: "Owner note",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })

    const ownerIncident = (await readOwnerIncidents(connection))[0]
    assert.equal(ownerIncident?.incidentId, incident.incidentId)
    assert.equal(ownerIncident?.latestPhase, "monitoring")
    assert.deepEqual(ownerIncident?.publication, {
      version: 0,
      lastAction: null,
      resultingDisposition: "private",
      sourceUpdateId: null,
      currentSnapshot: null,
    })
    assert.deepEqual(ownerIncident?.updates[0]?.publicAffectedComponents, [])
  })

  it("keeps private metadata references separate from the current public source", async () => {
    const now = Date.now()
    const publicComponent = await createPublicComponent(connection, now)
    const draftComponent = await createPublicComponent(connection, now, {
      ownerName: "Private API name",
      publicName: "API",
      sortOrder: 1,
    })
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner incident title",
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: publicComponent.componentId,
          expectedComponentVersion: 2,
          expectedComponentMetadataPublicationVersion: 1,
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: 0,
        publicTitle: "Visitor incident title",
        publicSeverity: "minor",
        publicSummary: "Visitor summary",
      },
    })
    const draft = await reviseIncidentMetadataForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      title: "Revised owner title",
      severity: "critical",
      ownerSummary: "Revised owner summary",
      privateNote: "Draft-only detail",
      effectiveAt: now + 1,
      currentAffectedComponents: [
        {
          componentId: publicComponent.componentId,
          expectedComponentVersion: 3,
        },
      ],
      affectedComponents: [
        {
          componentId: draftComponent.componentId,
          expectedComponentVersion: 2,
        },
      ],
      publication: { mode: "private" },
    })
    const publicPhase = await appendIncidentUpdateForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "phase_update",
        incidentId: incident.incidentId,
        expectedIncidentVersion: draft.incidentVersion,
        to: "identified",
        reason: "The cause is known",
        ownerSummary: null,
        privateNote: null,
        effectiveAt: now + 2,
        publication: {
          mode: "public",
          expectedPublicationVersion: 1,
          publicSummary: "Visitor phase summary",
        },
      },
    )

    const ownerIncident = (await readOwnerIncidents(connection))[0]
    const metadataUpdate = ownerIncident?.updates[1]
    const phaseUpdate = ownerIncident?.updates[2]

    assert.equal(metadataUpdate?.kind, "metadata")
    assert.equal(
      metadataUpdate?.affectedComponents[0]?.componentId,
      draftComponent.componentId,
    )
    assert.deepEqual(metadataUpdate?.publicAffectedComponents, [])
    assert.equal(
      phaseUpdate?.affectedComponents[0]?.componentId,
      draftComponent.componentId,
    )
    assert.equal(
      phaseUpdate?.publicAffectedComponents[0]?.componentId,
      publicComponent.componentId,
    )
    assert.equal(
      phaseUpdate?.publicAffectedComponents[0]?.componentPublicId,
      publicComponent.componentPublicId,
    )
    assert.equal(
      ownerIncident?.publication.sourceUpdateId,
      publicPhase.incidentUpdateId,
    )
    assert.equal(
      ownerIncident?.publication.currentSnapshot?.title,
      "Visitor incident title",
    )
    assert.equal(
      ownerIncident?.publication.currentSnapshot?.severity,
      "minor",
    )
    assert.equal(
      ownerIncident?.publication.currentSnapshot?.affectedComponents[0]
        ?.componentPublicId,
      publicComponent.componentPublicId,
    )
  })

  it("fails closed when root and immutable update versions diverge", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Private component",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      initialStatus: null,
    })
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Incident",
      severity: "minor",
      initialPhase: "investigating",
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })
    await connection.client.execute({
      sql: "UPDATE incidents SET version = 2 WHERE id = ?",
      args: [incident.incidentId],
    })

    await assert.rejects(
      readOwnerIncidents(connection),
      OwnerIncidentDataIntegrityError,
    )
  })

  it("does not select authentication or OAuth secrets", async () => {
    const now = Date.now()
    const canaries = [
      "private-owner-email@example.com",
      "private-session-token",
      "private-access-token",
    ]
    await connection.client.batch(
      [
        {
          sql: "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES ('incident-auth-user', 'Private Auth Name', ?, 1, ?, ?)",
          args: [canaries[0], now, now],
        },
        {
          sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, access_token, created_at, updated_at) VALUES ('incident-auth-account', '1', 'github', 'incident-auth-user', ?, ?, ?)",
          args: [canaries[2], now, now],
        },
        {
          sql: "INSERT INTO auth_session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('incident-auth-session', ?, ?, ?, ?, 'incident-auth-user')",
          args: [now + 60_000, canaries[1], now, now],
        },
      ],
      "write",
    )

    const serialized = JSON.stringify(await readOwnerIncidents(connection))
    for (const canary of canaries) {
      assert.equal(serialized.includes(canary), false)
    }
  })
})

describe("owner incident loader", () => {
  it("authorizes before reading owner incidents", async () => {
    const events: string[] = []
    const load = createOwnerIncidentsLoader({
      authorize: async () => {
        events.push("authorize")
      },
      readIncidents: async () => {
        events.push("read")
        return []
      },
    })

    await load()
    assert.deepEqual(events, ["authorize", "read"])
  })

  it("never reads when owner authorization fails", async () => {
    let wasRead = false
    const load = createOwnerIncidentsLoader({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      readIncidents: async () => {
        wasRead = true
        return []
      },
    })

    await assert.rejects(load(), /unauthorized/)
    assert.equal(wasRead, false)
  })
})
