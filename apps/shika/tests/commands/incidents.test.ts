import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendIncidentUpdateForOwner,
  appendIncidentUpdateInputSchema,
  createIncidentForOwner,
  reviseIncidentMetadataForOwner,
} from "../../src/lib/commands/incidents"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { incidentPublicSnapshotSchema } from "../../src/lib/public/incident-snapshots"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPrivateComponent(connection: DatabaseConnection) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "private",
    ownerName: "Private health",
    ownerSummary: "Owner-only component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    initialStatus: null,
  })
}

async function createPublicComponent(
  connection: DatabaseConnection,
  now: number,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Owner-only health name",
    ownerSummary: "Owner-only component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    publicName: "Availability",
    publicSummary: "Current availability",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Owner-only transition summary",
      publicSummary: "Available normally",
      privateNote: "Private transition note",
    },
  })
}

function privateIncidentInput(
  componentId: string,
  componentVersion: number,
  now: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Owner-only incident title",
    severity: "minor" as const,
    initialPhase: "investigating" as const,
    ownerSummary: "Owner-only incident summary",
    privateNote: "Private incident note",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion: componentVersion,
      },
    ],
    publication: { mode: "private" as const },
  }
}

function publicIncidentInput(
  componentId: string,
  componentVersion: number,
  now: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Secret owner incident title",
    severity: "major" as const,
    initialPhase: "investigating" as const,
    ownerSummary: "Secret owner incident summary",
    privateNote: "Secret private incident note",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion: componentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedPublicationVersion: 0 as const,
      publicTitle: "Response delays",
      publicSeverity: "minor" as const,
      publicSummary: "Replies may be delayed",
    },
  }
}

async function readLatestIncidentSnapshot(
  connection: DatabaseConnection,
  incidentId: string,
) {
  const result = await connection.client.execute({
    sql: "SELECT publication_version, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
    args: [incidentId],
  })
  const row = result.rows[0]

  assert.ok(row)
  return {
    publicationVersion: Number(row.publication_version),
    snapshot: incidentPublicSnapshotSchema.parse(
      JSON.parse(String(row.resulting_current_snapshot_json)) as unknown,
    ),
    serialized: String(row.resulting_current_snapshot_json),
  }
}

describe("incident commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("creates a private incident and guards the affected component", async () => {
    const now = Date.now()
    const component = await createPrivateComponent(connection)
    const result = await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(component.componentId, 1, now),
    )
    const state = await connection.client.execute({
      sql: `
        SELECT
          incidents.version,
          incident_updates.kind,
          incident_updates.phase,
          incident_update_components.component_version,
          public_components.public_name_snapshot,
          components.version AS component_version,
          timeline_clock.owner_ordinal,
          timeline_clock.public_ordinal
        FROM incidents
        INNER JOIN incident_updates ON incident_updates.incident_id = incidents.id
        INNER JOIN incident_update_components ON incident_update_components.incident_update_id = incident_updates.id
        LEFT JOIN incident_update_public_components AS public_components
          ON public_components.incident_update_id = incident_updates.id
          AND public_components.component_id = incident_update_components.component_id
        INNER JOIN components ON components.id = incident_update_components.component_id
        CROSS JOIN timeline_clock
        WHERE incidents.id = ?
      `,
      args: [result.incidentId],
    })
    const publications = await connection.client.execute(
      "SELECT count(*) AS count FROM publication_events WHERE stream_type = 'incident'",
    )

    assert.deepEqual(state.rows[0], {
      version: 1,
      kind: "created",
      phase: "investigating",
      component_version: 2,
      public_name_snapshot: null,
      owner_ordinal: 1,
      public_ordinal: 0,
    })
    assert.equal(Number(publications.rows[0]?.count), 0)
    assert.equal(result.componentVersions[0]?.componentVersion, 2)
  })

  it("publishes only explicit public incident and component snapshots", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const input = publicIncidentInput(component.componentId, 2, now)
    const result = await createIncidentForOwner(connection, owner, input)
    const publication = await readLatestIncidentSnapshot(
      connection,
      result.incidentId,
    )
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    assert.equal(result.incidentPublicationVersion, 1)
    assert.equal(result.componentVersions[0]?.componentVersion, 3)
    assert.equal(publication.snapshot.title, "Response delays")
    assert.equal(publication.snapshot.severity, "minor")
    assert.deepEqual(publication.snapshot.affectedComponents, [
      {
        componentPublicId: component.componentPublicId,
        name: "Availability",
        position: 0,
      },
    ])
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 5,
      public_ordinal: 3,
      public_privacy_epoch: 0,
    })

    for (const privateValue of [
      input.title,
      input.ownerSummary,
      input.privateNote,
      component.componentId,
      "Owner-only health name",
      "Owner-only component summary",
    ]) {
      assert.equal(publication.serialized.includes(String(privateValue)), false)
    }
  })

  it("rejects stale or non-public affected components without partial writes", async () => {
    const now = Date.now()
    const privateComponent = await createPrivateComponent(connection)

    await assert.rejects(
      createIncidentForOwner(
        connection,
        owner,
        publicIncidentInput(privateComponent.componentId, 1, now),
      ),
      CommandValidationError,
    )
    await assert.rejects(
      createIncidentForOwner(
        connection,
        owner,
        privateIncidentInput(privateComponent.componentId, 2, now),
      ),
      CommandConflictError,
    )

    const counts = await connection.client.execute(
      "SELECT (SELECT count(*) FROM incidents) AS incidents, (SELECT version FROM components WHERE id = ?) AS component_version, (SELECT owner_ordinal FROM timeline_clock) AS owner_ordinal, (SELECT count(*) FROM command_receipts WHERE action = 'create_incident') AS receipts",
      [privateComponent.componentId],
    )
    assert.deepEqual(counts.rows[0], {
      incidents: 0,
      component_version: 1,
      owner_ordinal: 0,
      receipts: 0,
    })
  })

  it("keeps a private note on a public incident out of public output", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )
    const before = await readLatestIncidentSnapshot(
      connection,
      incident.incidentId,
    )

    const result = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "note",
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      ownerSummary: "Owner-only follow-up",
      privateNote: "Private follow-up detail",
      effectiveAt: now + 1,
      publication: { mode: "private" },
    })
    const after = await readLatestIncidentSnapshot(connection, incident.incidentId)
    const latestUpdate = await connection.client.execute({
      sql: "SELECT public_title, public_summary FROM incident_updates WHERE id = ?",
      args: [result.incidentUpdateId],
    })
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal FROM timeline_clock",
    )

    assert.equal(result.incidentVersion, 2)
    assert.equal(result.incidentPublicationVersion, 1)
    assert.equal(after.serialized, before.serialized)
    assert.deepEqual(latestUpdate.rows[0], {
      public_title: null,
      public_summary: null,
    })
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 6,
      public_ordinal: 3,
    })
  })

  it("publishes notes and legal phase changes from the last public snapshot", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )
    const note = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "note",
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      ownerSummary: "Secret owner note",
      privateNote: "Secret private note",
      effectiveAt: now + 1,
      publication: {
        mode: "public",
        expectedPublicationVersion: 1,
        publicSummary: "We are still investigating",
      },
    })
    const phase = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: incident.incidentId,
      expectedIncidentVersion: note.incidentVersion,
      to: "identified",
      reason: "The cause is understood",
      ownerSummary: "Secret cause",
      privateNote: "Secret diagnostic detail",
      effectiveAt: now + 2,
      publication: {
        mode: "public",
        expectedPublicationVersion: note.incidentPublicationVersion,
        publicSummary: "The cause has been identified",
      },
    })
    const latest = await readLatestIncidentSnapshot(connection, incident.incidentId)

    assert.equal(phase.phase, "identified")
    assert.equal(phase.incidentPublicationVersion, 3)
    assert.equal(latest.snapshot.title, "Response delays")
    assert.equal(latest.snapshot.severity, "minor")
    assert.equal(latest.snapshot.phase, "identified")
    assert.equal(latest.snapshot.summary, "The cause has been identified")
    assert.equal(latest.serialized.includes("Secret cause"), false)
    assert.equal(latest.serialized.includes("Secret diagnostic detail"), false)
  })

  it("requires an atomic public lifecycle update for a public incident", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )

    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        operation: "phase_update",
        incidentId: incident.incidentId,
        expectedIncidentVersion: 1,
        to: "identified",
        reason: "The cause is understood",
        ownerSummary: null,
        privateNote: null,
        effectiveAt: now + 1,
        publication: { mode: "private" },
      }),
      CommandValidationError,
    )
    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        operation: "phase_update",
        incidentId: incident.incidentId,
        expectedIncidentVersion: 1,
        to: "resolved",
        reason: "Incorrect operation",
        ownerSummary: null,
        privateNote: null,
        effectiveAt: now + 1,
        publication: {
          mode: "public",
          expectedPublicationVersion: 1,
          publicSummary: "Incorrect operation",
        },
      }),
    )

    const state = await connection.client.execute({
      sql: "SELECT version, (SELECT count(*) FROM incident_updates WHERE incident_id = incidents.id) AS updates, (SELECT count(*) FROM publication_events WHERE stream_type = 'incident' AND stream_id = incidents.id) AS publications FROM incidents WHERE id = ?",
      args: [incident.incidentId],
    })
    assert.deepEqual(state.rows[0], {
      version: 1,
      updates: 1,
      publications: 1,
    })
  })

  it("rejects stale incident and publication versions atomically", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )

    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        operation: "note",
        incidentId: incident.incidentId,
        expectedIncidentVersion: 2,
        ownerSummary: null,
        privateNote: null,
        effectiveAt: now + 1,
        publication: { mode: "private" },
      }),
      CommandConflictError,
    )
    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        operation: "note",
        incidentId: incident.incidentId,
        expectedIncidentVersion: 1,
        ownerSummary: null,
        privateNote: null,
        effectiveAt: now + 1,
        publication: {
          mode: "public",
          expectedPublicationVersion: 2,
          publicSummary: "A stale publication",
        },
      }),
      CommandConflictError,
    )

    const state = await connection.client.execute({
      sql: "SELECT version, (SELECT count(*) FROM incident_updates WHERE incident_id = incidents.id) AS updates, (SELECT count(*) FROM publication_events WHERE stream_type = 'incident' AND stream_id = incidents.id) AS publications, (SELECT count(*) FROM command_receipts WHERE action = 'append_incident_update') AS receipts FROM incidents WHERE id = ?",
      args: [incident.incidentId],
    })
    assert.deepEqual(state.rows[0], {
      version: 1,
      updates: 1,
      publications: 1,
      receipts: 0,
    })
  })

  it("resolves with an explicit recovery transition and reopens from its resulting version", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )

    assert.throws(() =>
      appendIncidentUpdateInputSchema.parse({
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
            mode: "transition",
            componentId: component.componentId,
            expectedComponentVersion: 3,
          },
        ],
        publication: {
          mode: "public",
          expectedPublicationVersion: 1,
          publicSummary: "Recovered",
        },
      }),
    )

    const resolved = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "resolve",
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      reason: "Recovered",
      ownerSummary: "Owner resolution",
      privateNote: null,
      effectiveAt: now + 1,
      componentOutcomes: [
        {
          mode: "transition",
          componentId: component.componentId,
          expectedComponentVersion: 3,
          transition: {
            condition: "available",
            validUntil: null,
            ownerSummary: "Availability recovered",
            privateNote: "Verified before resolving",
            publication: {
              mode: "public",
              publicSummary: "Availability has recovered",
              expectedComponentMetadataPublicationVersion: 1,
              expectedStatusPublicationVersion: 1,
            },
          },
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: 1,
        publicSummary: "The incident is resolved",
      },
    })
    const reopened = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "reopen",
      incidentId: incident.incidentId,
      expectedIncidentVersion: resolved.incidentVersion,
      reason: "Symptoms returned",
      ownerSummary: "Owner reopen note",
      privateNote: null,
      effectiveAt: now + 2,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 4,
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: resolved.incidentPublicationVersion,
        publicSummary: "The issue returned",
      },
    })

    assert.equal(resolved.phase, "resolved")
    assert.deepEqual(resolved.componentVersions, [
      {
        componentId: component.componentId,
        componentVersion: 4,
      },
    ])
    assert.equal(resolved.statusTransitions.length, 1)
    assert.equal(resolved.statusTransitions[0]?.componentVersion, 4)
    assert.equal(resolved.statusTransitions[0]?.statusPublicationVersion, 2)
    assert.equal(reopened.phase, "investigating")
    assert.equal(reopened.incidentVersion, 3)
    assert.equal(reopened.incidentPublicationVersion, 3)
    const componentState = await connection.client.execute({
      sql: "SELECT version FROM components WHERE id = ?",
      args: [component.componentId],
    })
    assert.equal(Number(componentState.rows[0]?.version), 4)
    const correlation = await connection.client.execute({
      sql: "SELECT incident_updates.correlation_id AS incident_correlation_id, status_transitions.correlation_id AS status_correlation_id FROM incident_updates INNER JOIN status_transitions ON status_transitions.id = ? WHERE incident_updates.id = ?",
      args: [
        resolved.statusTransitions[0]?.statusTransitionId ?? "",
        resolved.incidentUpdateId,
      ],
    })
    assert.equal(
      correlation.rows[0]?.status_correlation_id,
      correlation.rows[0]?.incident_correlation_id,
    )
  })

  it("rolls back incident resolution when a recovery publication guard is stale", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, 2, now),
    )

    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
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
            mode: "transition",
            componentId: component.componentId,
            expectedComponentVersion: 3,
            transition: {
              condition: "available",
              validUntil: null,
              ownerSummary: null,
              privateNote: null,
              publication: {
                mode: "public",
                publicSummary: "Recovered",
                expectedComponentMetadataPublicationVersion: 1,
                expectedStatusPublicationVersion: 0,
              },
            },
          },
        ],
        publication: {
          mode: "public",
          expectedPublicationVersion: 1,
          publicSummary: "Resolved",
        },
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "STATUS_PUBLICATION_VERSION_CONFLICT",
    )

    const state = await connection.client.execute({
      sql: "SELECT incidents.version, (SELECT count(*) FROM incident_updates WHERE incident_id = incidents.id) AS updates, (SELECT count(*) FROM status_transitions WHERE component_id = ?) AS transitions, (SELECT version FROM components WHERE id = ?) AS component_version FROM incidents WHERE incidents.id = ?",
      args: [component.componentId, component.componentId, incident.incidentId],
    })
    assert.deepEqual(state.rows[0], {
      version: 1,
      updates: 1,
      transitions: 1,
      component_version: 3,
    })
  })

  it("revises private metadata and updates only changed component dependencies", async () => {
    const now = Date.now()
    const previousComponent = await createPrivateComponent(connection)
    const nextComponent = await createPrivateComponent(connection)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(previousComponent.componentId, 1, now),
    )

    const result = await reviseIncidentMetadataForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      title: "Revised owner title",
      severity: "major",
      ownerSummary: "Revised owner summary",
      privateNote: "Revised private note",
      effectiveAt: now + 1,
      currentAffectedComponents: [
        {
          componentId: previousComponent.componentId,
          expectedComponentVersion: 2,
        },
      ],
      affectedComponents: [
        {
          componentId: nextComponent.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })
    const state = await connection.client.execute({
      sql: `
        SELECT
          incidents.version,
          incident_updates.kind,
          incident_updates.title,
          incident_updates.severity,
          incident_update_components.component_id,
          incident_update_components.component_version
        FROM incidents
        INNER JOIN incident_updates
          ON incident_updates.incident_id = incidents.id
          AND incident_updates.incident_version = incidents.version
        INNER JOIN incident_update_components
          ON incident_update_components.incident_update_id = incident_updates.id
        WHERE incidents.id = ?
      `,
      args: [incident.incidentId],
    })
    const componentStates = await connection.client.execute({
      sql: "SELECT id, version FROM components WHERE id IN (?, ?) ORDER BY id",
      args: [previousComponent.componentId, nextComponent.componentId],
    })

    assert.deepEqual(state.rows[0], {
      version: 2,
      kind: "metadata",
      title: "Revised owner title",
      severity: "major",
      component_id: nextComponent.componentId,
      component_version: 2,
    })
    const versionByComponentId = new Map(
      componentStates.rows.map((row) => [
        String(row.id),
        Number(row.version),
      ] as const),
    )
    assert.equal(versionByComponentId.get(previousComponent.componentId), 3)
    assert.equal(versionByComponentId.get(nextComponent.componentId), 2)
    assert.equal(result.incidentVersion, 2)
    assert.equal(result.incidentPublicationVersion, 0)
  })

  it("keeps private affected-component drafts separate from public lifecycle", async () => {
    const now = Date.now()
    const publicComponent = await createPublicComponent(connection, now)
    const privateDraftComponent = await createPublicComponent(
      connection,
      now + 1,
    )
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(publicComponent.componentId, 2, now + 2),
    )
    const originalPublic = await readLatestIncidentSnapshot(
      connection,
      incident.incidentId,
    )

    await reviseIncidentMetadataForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      title: "Private replacement title",
      severity: "critical",
      ownerSummary: "Private metadata draft",
      privateNote: null,
      effectiveAt: now + 3,
      currentAffectedComponents: [
        {
          componentId: publicComponent.componentId,
          expectedComponentVersion: 3,
        },
      ],
      affectedComponents: [
        {
          componentId: privateDraftComponent.componentId,
          expectedComponentVersion: 2,
        },
      ],
      publication: { mode: "private" },
    })
    const afterPrivateDraft = await readLatestIncidentSnapshot(
      connection,
      incident.incidentId,
    )
    assert.equal(afterPrivateDraft.serialized, originalPublic.serialized)

    const phase = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: incident.incidentId,
      expectedIncidentVersion: 2,
      to: "identified",
      reason: "Public investigation advanced",
      ownerSummary: "Owner phase note",
      privateNote: null,
      effectiveAt: now + 4,
      publication: {
        mode: "public",
        expectedPublicationVersion: 1,
        publicSummary: "The cause is identified",
      },
    })
    const phasePublic = await readLatestIncidentSnapshot(
      connection,
      incident.incidentId,
    )
    const splitReferences = await connection.client.execute({
      sql: `
        SELECT
          owner_refs.component_id AS owner_component_id,
          public_refs.component_id AS public_component_id
        FROM incident_updates
        INNER JOIN incident_update_components AS owner_refs
          ON owner_refs.incident_update_id = incident_updates.id
        INNER JOIN incident_update_public_components AS public_refs
          ON public_refs.incident_update_id = incident_updates.id
        WHERE incident_updates.id = ?
      `,
      args: [phase.incidentUpdateId],
    })

    assert.equal(phasePublic.snapshot.title, "Response delays")
    assert.equal(phasePublic.snapshot.severity, "minor")
    assert.equal(phasePublic.snapshot.phase, "identified")
    assert.equal(
      phasePublic.snapshot.affectedComponents[0]?.componentPublicId,
      publicComponent.componentPublicId,
    )
    assert.deepEqual(splitReferences.rows[0], {
      owner_component_id: privateDraftComponent.componentId,
      public_component_id: publicComponent.componentId,
    })

    const publishedMetadata = await reviseIncidentMetadataForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        incidentId: incident.incidentId,
        expectedIncidentVersion: 3,
        title: "Owner replacement title",
        severity: "critical",
        ownerSummary: "Published metadata revision",
        privateNote: "Owner-only publication note",
        effectiveAt: now + 5,
        currentAffectedComponents: [
          {
            componentId: privateDraftComponent.componentId,
            expectedComponentVersion: 3,
          },
        ],
        affectedComponents: [
          {
            componentId: privateDraftComponent.componentId,
            expectedComponentVersion: 3,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
        publication: {
          mode: "public",
          expectedPublicationVersion: 2,
          publicTitle: "New public incident title",
          publicSeverity: "major",
          publicSummary: "New public metadata",
        },
      },
    )
    const revisedPublic = await readLatestIncidentSnapshot(
      connection,
      incident.incidentId,
    )

    assert.equal(publishedMetadata.incidentVersion, 4)
    assert.equal(publishedMetadata.incidentPublicationVersion, 3)
    assert.equal(revisedPublic.snapshot.title, "New public incident title")
    assert.equal(revisedPublic.snapshot.severity, "major")
    assert.equal(
      revisedPublic.snapshot.affectedComponents[0]?.componentPublicId,
      privateDraftComponent.componentPublicId,
    )
    assert.equal(revisedPublic.serialized.includes("Owner-only"), false)
  })

  it("replays a metadata revision before checking stale aggregate versions", async () => {
    const now = Date.now()
    const component = await createPrivateComponent(connection)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(component.componentId, 1, now),
    )
    const input = {
      idempotencyKey: crypto.randomUUID(),
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      title: "Revised title",
      severity: "minor" as const,
      ownerSummary: null,
      privateNote: null,
      effectiveAt: now + 1,
      currentAffectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 2,
        },
      ],
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 2,
        },
      ],
      publication: { mode: "private" as const },
    }

    const first = await reviseIncidentMetadataForOwner(
      connection,
      owner,
      input,
    )
    const replay = await reviseIncidentMetadataForOwner(
      connection,
      owner,
      input,
    )

    assert.deepEqual(replay, first)
    await assert.rejects(
      reviseIncidentMetadataForOwner(connection, owner, {
        ...input,
        title: "Different title",
      }),
      IdempotencyConflictError,
    )
  })

  it("replays permanently and rejects a changed idempotent payload", async () => {
    const now = Date.now()
    const component = await createPrivateComponent(connection)
    const input = privateIncidentInput(component.componentId, 1, now)
    const first = await createIncidentForOwner(connection, owner, input)
    const second = await createIncidentForOwner(connection, owner, input)

    assert.deepEqual(second, first)
    await assert.rejects(
      createIncidentForOwner(connection, owner, {
        ...input,
        title: "A different incident",
      }),
      IdempotencyConflictError,
    )

    const counts = await connection.client.execute(
      "SELECT (SELECT count(*) FROM incidents) AS incidents, (SELECT count(*) FROM incident_updates) AS updates, (SELECT count(*) FROM command_receipts WHERE action = 'create_incident') AS receipts",
    )
    assert.deepEqual(counts.rows[0], {
      incidents: 1,
      updates: 1,
      receipts: 1,
    })
  })

  it("replays an appended update before checking its now-stale version", async () => {
    const now = Date.now()
    const component = await createPrivateComponent(connection)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      privateIncidentInput(component.componentId, 1, now),
    )
    const input = {
      idempotencyKey: crypto.randomUUID(),
      operation: "note" as const,
      incidentId: incident.incidentId,
      expectedIncidentVersion: 1,
      ownerSummary: "Private follow-up",
      privateNote: null,
      effectiveAt: now + 1,
      publication: { mode: "private" as const },
    }

    const first = await appendIncidentUpdateForOwner(
      connection,
      owner,
      input,
    )
    const replay = await appendIncidentUpdateForOwner(
      connection,
      owner,
      input,
    )

    assert.deepEqual(replay, first)
    await assert.rejects(
      appendIncidentUpdateForOwner(connection, owner, {
        ...input,
        ownerSummary: "Different follow-up",
      }),
      IdempotencyConflictError,
    )
    const counts = await connection.client.execute({
      sql: "SELECT version, (SELECT count(*) FROM incident_updates WHERE incident_id = incidents.id) AS updates, (SELECT count(*) FROM command_receipts WHERE action = 'append_incident_update') AS receipts FROM incidents WHERE id = ?",
      args: [incident.incidentId],
    })
    assert.deepEqual(counts.rows[0], {
      version: 2,
      updates: 2,
      receipts: 1,
    })
  })
})
