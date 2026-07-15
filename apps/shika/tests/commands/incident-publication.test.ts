import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  closeIncidentPublicationForOwner,
  type CloseIncidentPublicationInput,
} from "../../src/lib/commands/incident-publication"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
} from "../../src/lib/commands/incidents"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import { readPublicIncidentDetail } from "../../src/lib/data/public-incidents-repository"
import { readPublicTimelinePage } from "../../src/lib/data/public-timeline-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createPublicCursorCodec } from "../../src/lib/timeline/public-cursor"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

const cursorCodec = createPublicCursorCodec(
  "incident-publication-test-cursor-secret-001",
)

interface IncidentFixture {
  incidentId: string
  incidentPublicId: string
  incidentVersion: number
  incidentPublicationVersion: number
  publicEntryIds: readonly string[]
  affectedComponents: readonly {
    componentId: string
    expectedComponentVersion: number
    expectedComponentMetadataPublicationVersion: number
  }[]
}

async function createFixture(
  connection: DatabaseConnection,
  now: number,
  withSecondPublicUpdate = false,
): Promise<IncidentFixture> {
  const component = await createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Private component name",
    ownerSummary: "Private component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    publicName: "Availability",
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
  const created = await createIncidentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    title: "Private incident title",
    severity: "major",
    initialPhase: "investigating",
    ownerSummary: "Private incident summary",
    privateNote: "Private incident note",
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
      publicTitle: "Response delays",
      publicSeverity: "minor",
      publicSummary: "Replies may be delayed",
    },
  })
  let incidentVersion = created.incidentVersion
  let incidentPublicationVersion = created.incidentPublicationVersion

  if (withSecondPublicUpdate) {
    const updated = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: created.incidentId,
      expectedIncidentVersion: created.incidentVersion,
      to: "identified",
      reason: "The cause is known",
      ownerSummary: "Private diagnosis",
      privateNote: "Private diagnostic detail",
      effectiveAt: now + 1,
      publication: {
        mode: "public",
        expectedPublicationVersion: created.incidentPublicationVersion,
        publicSummary: "The cause has been identified",
      },
    })
    incidentVersion = updated.incidentVersion
    incidentPublicationVersion = updated.incidentPublicationVersion
  }

  const entries = await connection.client.execute({
    sql: "SELECT timeline_entry_id FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? AND action = 'publish' ORDER BY publication_version",
    args: [created.incidentId],
  })

  return {
    incidentId: created.incidentId,
    incidentPublicId: created.incidentPublicId,
    incidentVersion,
    incidentPublicationVersion,
    publicEntryIds: entries.rows.map((row) => String(row.timeline_entry_id)),
    affectedComponents: [
      {
        componentId: component.componentId,
        expectedComponentVersion: 3,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
  }
}

function closureInput(
  fixture: IncidentFixture,
  action: CloseIncidentPublicationInput["action"],
): CloseIncidentPublicationInput {
  const base = {
    idempotencyKey: crypto.randomUUID(),
    incidentId: fixture.incidentId,
    expectedIncidentVersion: fixture.incidentVersion,
    expectedIncidentPublicationVersion: fixture.incidentPublicationVersion,
  }

  return action === "withdraw"
    ? { ...base, action }
    : {
        ...base,
        action,
        affectedComponents: [...fixture.affectedComponents],
      }
}

describe("incident publication closure", () => {
  let connection: DatabaseConnection
  let now: number

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
    now = Date.now()
  })

  afterEach(() => connection.client.close())

  it("withdraws detail while retaining prior history and adding a generic entry", async () => {
    const fixture = await createFixture(connection, now, true)
    const rootBefore = await connection.client.execute({
      sql: "SELECT version, updated_at FROM incidents WHERE id = ?",
      args: [fixture.incidentId],
    })
    const result = await closeIncidentPublicationForOwner(
      connection,
      owner,
      closureInput(fixture, "withdraw"),
    )
    const events = await connection.client.execute({
      sql: "SELECT action, timeline_entry_id, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version",
      args: [fixture.incidentId],
    })
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })
    const rootAfter = await connection.client.execute({
      sql: "SELECT version, updated_at FROM incidents WHERE id = ?",
      args: [fixture.incidentId],
    })

    assert.equal(result.incidentVersion, fixture.incidentVersion)
    assert.deepEqual(result.componentVersions, [])
    assert.deepEqual(rootAfter.rows[0], rootBefore.rows[0])
    assert.equal(
      result.incidentPublicationVersion,
      fixture.incidentPublicationVersion + 1,
    )
    assert.equal(result.publicPrivacyEpoch, 0)
    assert.equal(
      await readPublicIncidentDetail(connection, fixture.incidentPublicId),
      null,
    )
    assert.deepEqual(
      events.rows.slice(0, 2).map((row) => String(row.action)),
      ["publish", "publish"],
    )
    assert.equal(String(events.rows[2]?.action), "withdraw")
    assert.equal(
      JSON.parse(String(events.rows[2]?.timeline_snapshot_json)).kind,
      "withdrawn",
    )
    assert.equal(
      fixture.publicEntryIds.includes(
        String(events.rows[2]?.timeline_entry_id),
      ),
      false,
    )
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "incident").length,
        2,
      )
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "withdrawn").length,
        1,
      )
    }
  })

  it("redacts every published incident entry into a strict tombstone", async () => {
    const fixture = await createFixture(connection, now, true)
    const result = await closeIncidentPublicationForOwner(
      connection,
      owner,
      closureInput(fixture, "redact"),
    )
    const events = await connection.client.execute({
      sql: "SELECT action, timeline_entry_id, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version",
      args: [fixture.incidentId],
    })
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })

    assert.equal(result.incidentVersion, fixture.incidentVersion)
    assert.equal(
      result.incidentPublicationVersion,
      fixture.incidentPublicationVersion + 2,
    )
    assert.equal(result.publicPrivacyEpoch, 1)
    assert.deepEqual(result.componentVersions, [
      {
        componentId: fixture.affectedComponents[0]?.componentId,
        componentVersion: 4,
      },
    ])
    assert.deepEqual(
      await readPublicIncidentDetail(connection, fixture.incidentPublicId),
      { kind: "redacted" },
    )
    const redactions = events.rows.filter(
      (row) => String(row.action) === "redact",
    )
    assert.equal(redactions.length, 2)
    assert.deepEqual(
      redactions.map((row) => String(row.timeline_entry_id)).sort(),
      [...fixture.publicEntryIds].sort(),
    )
    for (const row of redactions) {
      assert.equal(
        JSON.parse(String(row.timeline_snapshot_json)).kind,
        "redacted",
      )
      assert.equal(Number(row.public_privacy_epoch), 1)
    }
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "incident").length,
        0,
      )
      assert.equal(
        timeline.entries.filter((entry) => entry.kind === "redacted").length,
        2,
      )
    }
  })

  it("suppresses every incident source without a public tombstone", async () => {
    const fixture = await createFixture(connection, now, true)
    const result = await closeIncidentPublicationForOwner(
      connection,
      owner,
      closureInput(fixture, "suppress"),
    )
    const suppressions = await connection.client.execute({
      sql: "SELECT target_snapshot_json, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? AND action = 'suppress'",
      args: [fixture.incidentId],
    })
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })

    assert.equal(result.incidentVersion, fixture.incidentVersion)
    assert.equal(result.incidentPublicationVersion, 4)
    assert.equal(result.publicPrivacyEpoch, 1)
    assert.deepEqual(result.componentVersions, [
      {
        componentId: fixture.affectedComponents[0]?.componentId,
        componentVersion: 4,
      },
    ])
    assert.equal(suppressions.rows.length, 2)
    for (const row of suppressions.rows) {
      assert.equal(row.target_snapshot_json, null)
      assert.equal(row.timeline_snapshot_json, null)
      assert.equal(Number(row.public_privacy_epoch), 1)
    }
    assert.equal(
      await readPublicIncidentDetail(connection, fixture.incidentPublicId),
      null,
    )
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      for (const publicEntryId of fixture.publicEntryIds) {
        assert.equal(
          timeline.entries.some(
            (entry) => entry.publicEntryId === publicEntryId,
          ),
          false,
        )
      }
    }
  })

  it("allows suppression after redaction and advances privacy once per command", async () => {
    const fixture = await createFixture(connection, now, true)
    const redaction = await closeIncidentPublicationForOwner(
      connection,
      owner,
      closureInput(fixture, "redact"),
    )
    const suppression = await closeIncidentPublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        incidentId: fixture.incidentId,
        expectedIncidentVersion: redaction.incidentVersion,
        expectedIncidentPublicationVersion:
          redaction.incidentPublicationVersion,
        action: "suppress",
        affectedComponents: redaction.componentVersions.map((component) => ({
          componentId: component.componentId,
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion: 1,
        })),
      },
    )

    assert.equal(redaction.publicPrivacyEpoch, 1)
    assert.equal(suppression.publicPrivacyEpoch, 2)
    assert.equal(suppression.incidentPublicationVersion, 6)
  })

  it("replays the same command and rejects a changed idempotent payload", async () => {
    const fixture = await createFixture(connection, now)
    const input = closureInput(fixture, "withdraw")
    const first = await closeIncidentPublicationForOwner(
      connection,
      owner,
      input,
    )
    await connection.client.execute({
      sql: "UPDATE command_receipts SET response_body_json = NULL, response_expires_at = NULL WHERE action = 'close_incident_publication' AND idempotency_key = ?",
      args: [input.idempotencyKey],
    })
    const replay = await closeIncidentPublicationForOwner(
      connection,
      owner,
      input,
    )

    assert.deepEqual(replay, first)
    await assert.rejects(
      closeIncidentPublicationForOwner(connection, owner, {
        ...input,
        action: "redact",
        affectedComponents: fixture.affectedComponents,
      }),
      IdempotencyConflictError,
    )
    const count = await connection.client.execute({
      sql: "SELECT count(*) AS count FROM publication_events WHERE stream_type = 'incident' AND stream_id = ?",
      args: [fixture.incidentId],
    })
    assert.equal(Number(count.rows[0]?.count), 2)
  })

  it("rolls back stale root and publication versions without changing clocks", async () => {
    const fixture = await createFixture(connection, now)
    const beforeClock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    await assert.rejects(
      closeIncidentPublicationForOwner(connection, owner, {
        ...closureInput(fixture, "withdraw"),
        expectedIncidentVersion: fixture.incidentVersion + 1,
      }),
      CommandConflictError,
    )
    await assert.rejects(
      closeIncidentPublicationForOwner(connection, owner, {
        ...closureInput(fixture, "withdraw"),
        expectedIncidentPublicationVersion:
          fixture.incidentPublicationVersion + 1,
      }),
      CommandConflictError,
    )

    const afterClock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )
    const root = await connection.client.execute({
      sql: "SELECT version FROM incidents WHERE id = ?",
      args: [fixture.incidentId],
    })
    const receipt = await connection.client.execute(
      "SELECT count(*) AS count FROM command_receipts WHERE action = 'close_incident_publication'",
    )

    assert.deepEqual(afterClock.rows[0], beforeClock.rows[0])
    assert.equal(Number(root.rows[0]?.version), fixture.incidentVersion)
    assert.equal(Number(receipt.rows[0]?.count), 0)
  })

  it("rolls back a stale component dependency guard atomically", async () => {
    const fixture = await createFixture(connection, now, true)
    const componentId = fixture.affectedComponents[0]?.componentId
    assert.ok(componentId)
    const beforeClock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    await assert.rejects(
      closeIncidentPublicationForOwner(connection, owner, {
        ...closureInput(fixture, "redact"),
        affectedComponents: [
          {
            componentId,
            expectedComponentVersion: 4,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
      }),
      CommandConflictError,
    )
    await assert.rejects(
      closeIncidentPublicationForOwner(connection, owner, {
        ...closureInput(fixture, "redact"),
        affectedComponents: [
          {
            componentId,
            expectedComponentVersion: 3,
            expectedComponentMetadataPublicationVersion: 2,
          },
        ],
      }),
      CommandConflictError,
    )

    const afterClock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )
    const roots = await connection.client.execute({
      sql: "SELECT incidents.version AS incident_version, components.version AS component_version FROM incidents CROSS JOIN components WHERE incidents.id = ? AND components.id = ?",
      args: [fixture.incidentId, componentId],
    })
    const events = await connection.client.execute({
      sql: "SELECT count(*) AS count FROM publication_events WHERE stream_type = 'incident' AND stream_id = ?",
      args: [fixture.incidentId],
    })
    const receipt = await connection.client.execute(
      "SELECT count(*) AS count FROM command_receipts WHERE action = 'close_incident_publication'",
    )

    assert.deepEqual(afterClock.rows[0], beforeClock.rows[0])
    assert.equal(
      Number(roots.rows[0]?.incident_version),
      fixture.incidentVersion,
    )
    assert.equal(Number(roots.rows[0]?.component_version), 3)
    assert.equal(Number(events.rows[0]?.count), 2)
    assert.equal(Number(receipt.rows[0]?.count), 0)
  })

  it("fails closed on an invalid current public snapshot", async () => {
    const fixture = await createFixture(connection, now)
    await connection.client.execute({
      sql: "UPDATE publication_events SET resulting_current_snapshot_json = '{\"privateNote\":\"CANARY\"}' WHERE stream_type = 'incident' AND stream_id = ?",
      args: [fixture.incidentId],
    })

    await assert.rejects(
      closeIncidentPublicationForOwner(
        connection,
        owner,
        closureInput(fixture, "withdraw"),
      ),
      CommandValidationError,
    )
    const root = await connection.client.execute({
      sql: "SELECT version FROM incidents WHERE id = ?",
      args: [fixture.incidentId],
    })
    assert.equal(Number(root.rows[0]?.version), fixture.incidentVersion)
  })
})
