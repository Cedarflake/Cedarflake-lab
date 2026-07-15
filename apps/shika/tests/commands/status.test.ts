import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { CommandConflictError } from "../../src/lib/commands/errors"
import { reportStatusForOwner } from "../../src/lib/commands/status"
import { readPublicStatusPage } from "../../src/lib/data/public-status-repository"
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
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Internal availability",
    ownerSummary: "Internal summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    publicName: "Availability",
    publicSummary: "When I can respond",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Internal status summary",
      publicSummary: "Responding normally",
      privateNote: "Private transition note",
    },
  })
}

describe("status report commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("publishes a safe status snapshot with independent CAS versions", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const result = await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "degraded",
      effectiveAt: now,
      validUntil: null,
      ownerSummary: "Secret owner update",
      privateNote: "Secret private update",
      publication: {
        mode: "public",
        publicSummary: "Responses are significantly delayed",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })
    const page = await readPublicStatusPage(connection, now + 1)
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    assert.deepEqual(result, {
      componentId: component.componentId,
      componentVersion: 3,
      statusTransitionId: result.statusTransitionId,
      statusPublicationVersion: 2,
    })
    assert.equal(page.components[0]?.status.condition, "degraded")
    assert.equal(
      page.components[0]?.statusSummary,
      "Responses are significantly delayed",
    )
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 5,
      public_ordinal: 3,
      public_privacy_epoch: 0,
    })
    const serialized = JSON.stringify(page)
    assert.equal(serialized.includes("Secret owner update"), false)
    assert.equal(serialized.includes("Secret private update"), false)
    assert.equal(serialized.includes(component.componentId), false)
  })

  it("keeps a private update out of every public result", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "unavailable",
      effectiveAt: now,
      validUntil: null,
      ownerSummary: "Not available privately",
      privateNote: "Do not expose",
      publication: { mode: "private" },
    })

    const page = await readPublicStatusPage(connection, now + 1)
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal FROM timeline_clock",
    )
    assert.equal(page.components[0]?.status.condition, "available")
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 4,
      public_ordinal: 2,
    })
  })

  it("publishes a future report without replacing the current snapshot early", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const effectiveAt = now + 60_000
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "limited",
      effectiveAt,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "A planned limitation begins soon",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })

    const current = await readPublicStatusPage(connection, now + 1)
    const future = await readPublicStatusPage(connection, effectiveAt)
    const latestPublication = await connection.client.execute({
      sql: "SELECT resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [component.componentId],
    })
    const resultingSnapshot = JSON.parse(
      String(latestPublication.rows[0]?.resulting_current_snapshot_json),
    ) as { condition?: unknown }

    assert.equal(current.components[0]?.status.condition, "available")
    assert.equal(future.components[0]?.status.condition, "limited")
    assert.equal(resultingSnapshot.condition, "available")
  })

  it("never falls back after the latest public report expires", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const validUntil = now + 60_000
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "degraded",
      effectiveAt: now,
      validUntil,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: null,
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })

    const page = await readPublicStatusPage(connection, validUntil)
    assert.equal(page.components[0]?.status.condition, "unknown")
    assert.equal(page.components[0]?.status.unknownReason, "expired")
  })

  it("rejects stale component and publication versions atomically", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)

    await assert.rejects(
      reportStatusForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: 1,
        condition: "limited",
        effectiveAt: now,
        validUntil: null,
        ownerSummary: null,
        privateNote: null,
        publication: { mode: "private" },
      }),
      CommandConflictError,
    )
    await assert.rejects(
      reportStatusForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: 2,
        condition: "limited",
        effectiveAt: now,
        validUntil: null,
        ownerSummary: null,
        privateNote: null,
        publication: {
          mode: "public",
          publicSummary: null,
          expectedComponentMetadataPublicationVersion: 1,
          expectedStatusPublicationVersion: 0,
        },
      }),
      CommandConflictError,
    )

    const counts = await connection.client.execute(
      "SELECT (SELECT count(*) FROM status_transitions) AS transitions, (SELECT version FROM components) AS version, (SELECT owner_ordinal FROM timeline_clock) AS owner_ordinal",
    )
    assert.deepEqual(counts.rows[0], {
      transitions: 1,
      version: 2,
      owner_ordinal: 3,
    })
  })

  it("replays one status command without allocating another transition", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const input = {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "limited" as const,
      effectiveAt: now,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: { mode: "private" as const },
    }

    const first = await reportStatusForOwner(connection, owner, input)
    const second = await reportStatusForOwner(connection, owner, input)
    const transitions = await connection.client.execute(
      "SELECT count(*) AS count FROM status_transitions",
    )

    assert.deepEqual(second, first)
    assert.equal(Number(transitions.rows[0]?.count), 2)
  })
})
