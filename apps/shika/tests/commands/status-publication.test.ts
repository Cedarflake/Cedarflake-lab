import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { CommandConflictError } from "../../src/lib/commands/errors"
import { closeStatusPublicationForOwner } from "../../src/lib/commands/status-publication"
import { readPublicStatusPage } from "../../src/lib/data/public-status-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

describe("status publication closure", () => {
  let connection: DatabaseConnection
  let now: number
  let componentId: string
  let componentVersion: number
  let transitionId: string

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
    now = Date.now()
    const created = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Private owner name",
      ownerSummary: "Private owner summary",
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
        ownerSummary: "Private status summary",
        publicSummary: "Available now",
        privateNote: "Private status note",
      },
    })
    const transition = await connection.client.execute({
      sql: "SELECT id FROM status_transitions WHERE component_id = ?",
      args: [created.componentId],
    })
    componentId = created.componentId
    componentVersion = created.componentVersion
    transitionId = String(transition.rows[0]?.id)
  })

  afterEach(() => connection.client.close())

  it("withdraws current status without replacing it with an older report", async () => {
    const result = await closeStatusPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId,
      expectedComponentVersion: componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion: 1,
      action: "withdraw",
    })
    const page = await readPublicStatusPage(connection, now)
    const events = await connection.client.execute({
      sql: "SELECT action, timeline_entry_id, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version",
      args: [componentId],
    })

    assert.equal(result.componentVersion, componentVersion + 1)
    assert.equal(result.statusPublicationVersion, 2)
    assert.equal(result.publicPrivacyEpoch, 0)
    assert.equal(page.components[0]?.status.condition, "unknown")
    assert.equal(page.components[0]?.status.unknownReason, "withdrawn")
    assert.notEqual(
      String(events.rows[0]?.timeline_entry_id),
      String(events.rows[1]?.timeline_entry_id),
    )
    assert.equal(
      JSON.parse(String(events.rows[1]?.timeline_snapshot_json)).kind,
      "withdrawn",
    )
  })

  it("redacts and then suppresses a withdrawn source with epoch changes", async () => {
    const withdrawal = await closeStatusPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId,
      expectedComponentVersion: componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion: 1,
      action: "withdraw",
    })
    const redaction = await closeStatusPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId,
      expectedComponentVersion: withdrawal.componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion: withdrawal.statusPublicationVersion,
      action: "redact",
    })
    const suppression = await closeStatusPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId,
      expectedComponentVersion: redaction.componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion: redaction.statusPublicationVersion,
      action: "suppress",
    })
    const events = await connection.client.execute({
      sql: "SELECT action, target_snapshot_json, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version",
      args: [componentId],
    })

    assert.equal(redaction.publicPrivacyEpoch, 1)
    assert.equal(suppression.publicPrivacyEpoch, 2)
    assert.equal(
      JSON.parse(String(events.rows[2]?.timeline_snapshot_json)).kind,
      "redacted",
    )
    assert.equal(events.rows[3]?.target_snapshot_json, null)
    assert.equal(events.rows[3]?.timeline_snapshot_json, null)
  })

  it("replays the same closure without allocating a second event", async () => {
    const input = {
      idempotencyKey: crypto.randomUUID(),
      componentId,
      expectedComponentVersion: componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion: 1,
      action: "withdraw" as const,
    }
    const first = await closeStatusPublicationForOwner(connection, owner, input)
    const second = await closeStatusPublicationForOwner(connection, owner, input)
    const count = await connection.client.execute(
      "SELECT count(*) AS count FROM publication_events WHERE stream_type = 'component_status'",
    )

    assert.deepEqual(second, first)
    assert.equal(Number(count.rows[0]?.count), 2)
  })

  it("rolls back a stale aggregate or publication version", async () => {
    await assert.rejects(
      closeStatusPublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId,
        expectedComponentVersion: componentVersion + 1,
        statusTransitionId: transitionId,
        expectedStatusPublicationVersion: 1,
        action: "withdraw",
      }),
      CommandConflictError,
    )
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 3,
      public_ordinal: 2,
      public_privacy_epoch: 0,
    })
  })
})
