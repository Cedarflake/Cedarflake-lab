import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

function privateInput() {
  return {
    idempotencyKey: crypto.randomUUID(),
    visibility: "private" as const,
    ownerName: "Private energy",
    ownerSummary: "Only visible to the owner",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "owner-only note",
    initialStatus: null,
  }
}

function publicInput() {
  const now = Date.now()

  return {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public" as const,
    ownerName: "Owner-only internal name",
    ownerSummary: "Owner-only component summary",
    ownerSortOrder: 0,
    defaultValidityMs: 86_400_000,
    privateNote: "private component note",
    publicName: "Availability",
    publicSummary: "When I can respond",
    publicSortOrder: 0,
    initialStatus: {
      condition: "limited" as const,
      effectiveAt: now - 1_000,
      validUntil: now + 60_000,
      ownerSummary: "owner-only status summary",
      publicSummary: "Replies may take longer",
      privateNote: "private status note",
    },
  }
}

describe("component commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("creates a private component without changing public clocks", async () => {
    const result = await createComponentForOwner(
      connection,
      owner,
      privateInput(),
    )
    const component = await connection.client.execute({
      sql: "SELECT version FROM components WHERE id = ?",
      args: [result.componentId],
    })
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )
    const publications = await connection.client.execute(
      "SELECT count(*) AS count FROM publication_events",
    )

    assert.equal(result.componentVersion, 1)
    assert.equal(Number(component.rows[0]?.version), 1)
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 0,
      public_ordinal: 0,
      public_privacy_epoch: 0,
    })
    assert.equal(Number(publications.rows[0]?.count), 0)
  })

  it("publishes component metadata and a starting status atomically", async () => {
    const input = publicInput()
    const result = await createComponentForOwner(connection, owner, input)
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )
    const publications = await connection.client.execute({
      sql: "SELECT stream_type, target_snapshot_json FROM publication_events WHERE stream_id = ? ORDER BY public_ordinal",
      args: [result.componentId],
    })
    const transition = await connection.client.execute({
      sql: "SELECT component_version, condition, owner_ordinal FROM status_transitions WHERE component_id = ?",
      args: [result.componentId],
    })

    assert.equal(result.componentVersion, 2)
    assert.equal(result.componentMetadataPublicationVersion, 1)
    assert.equal(result.componentStatusPublicationVersion, 1)
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 3,
      public_ordinal: 2,
      public_privacy_epoch: 0,
    })
    assert.deepEqual(
      publications.rows.map((row) => String(row.stream_type)),
      ["component_metadata", "component_status"],
    )
    assert.deepEqual(transition.rows[0], {
      component_version: 2,
      condition: "limited",
      owner_ordinal: 1,
    })

    for (const row of publications.rows) {
      const snapshot = String(row.target_snapshot_json)
      assert.equal(snapshot.includes(input.ownerName), false)
      assert.equal(snapshot.includes(String(input.ownerSummary)), false)
      assert.equal(snapshot.includes(String(input.privateNote)), false)
      assert.equal(snapshot.includes(input.initialStatus.privateNote), false)
      assert.equal(snapshot.includes(result.componentId), false)
    }
  })

  it("replays the same command without allocating new records", async () => {
    const input = publicInput()
    const first = await createComponentForOwner(connection, owner, input)
    const second = await createComponentForOwner(connection, owner, input)
    const counts = await connection.client.execute(
      "SELECT (SELECT count(*) FROM components) AS components, (SELECT count(*) FROM publication_events) AS publications, (SELECT count(*) FROM command_receipts) AS receipts",
    )

    assert.deepEqual(second, first)
    assert.deepEqual(counts.rows[0], {
      components: 1,
      publications: 2,
      receipts: 1,
    })
  })

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const first = privateInput()
    await createComponentForOwner(connection, owner, first)

    await assert.rejects(
      createComponentForOwner(connection, owner, {
        ...first,
        ownerName: "Different name",
      }),
      IdempotencyConflictError,
    )
  })

  it("rolls back every write when the permanent receipt is invalid", async () => {
    const invalidOwner: OwnerIdentity = {
      userId: "auth-user-1",
      githubOwnerId: "1",
      ownerKey: "github:not-numeric",
    }

    await assert.rejects(
      createComponentForOwner(connection, invalidOwner, publicInput()),
    )

    const counts = await connection.client.execute(
      "SELECT (SELECT count(*) FROM components) AS components, (SELECT count(*) FROM publication_events) AS publications, (SELECT owner_ordinal FROM timeline_clock) AS owner_ordinal, (SELECT public_ordinal FROM timeline_clock) AS public_ordinal",
    )
    assert.deepEqual(counts.rows[0], {
      components: 0,
      publications: 0,
      owner_ordinal: 0,
      public_ordinal: 0,
    })
  })

  it("rejects a public component without a current starting report", async () => {
    const input = publicInput()
    input.initialStatus.effectiveAt = Date.now() + 60_000
    input.initialStatus.validUntil = Date.now() + 120_000

    await assert.rejects(
      createComponentForOwner(connection, owner, input),
      CommandValidationError,
    )
    const components = await connection.client.execute(
      "SELECT count(*) AS count FROM components",
    )
    assert.equal(Number(components.rows[0]?.count), 0)
  })
})
