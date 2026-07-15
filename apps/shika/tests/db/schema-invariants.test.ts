import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "./helpers"

describe("database invariants", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("enforces the unique GitHub provider account tuple", async () => {
    const timestamp = Date.now()
    await connection.client.execute({
      sql: "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["user-1", "Owner", "owner@example.com", 1, timestamp, timestamp],
    })
    await connection.client.execute({
      sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["account-1", "123", "github", "user-1", timestamp, timestamp],
    })

    await assert.rejects(
      connection.client.execute({
        sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: ["account-2", "123", "github", "user-1", timestamp, timestamp],
      }),
    )
  })

  it("enforces status condition and half-open interval constraints", async () => {
    const timestamp = Date.now()
    await connection.client.execute({
      sql: "INSERT INTO components (id, public_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: ["component-1", "public-component-1", 1, timestamp, timestamp],
    })

    const insertTransition = (condition: string, validUntil: number) =>
      connection.client.execute({
        sql: "INSERT INTO status_transitions (id, component_id, component_version, condition, effective_at, valid_until, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          crypto.randomUUID(),
          "component-1",
          1,
          condition,
          timestamp,
          validUntil,
          timestamp,
          1,
          crypto.randomUUID(),
          crypto.randomUUID(),
        ],
      })

    await assert.rejects(insertTransition("unknown", timestamp + 1))
    await assert.rejects(insertTransition("available", timestamp))
  })

  it("rejects invalid singleton and command receipt values", async () => {
    const timestamp = Date.now()

    await assert.rejects(
      connection.client.execute({
        sql: "INSERT INTO timeline_clock (id, owner_ordinal, public_ordinal, public_privacy_epoch, updated_at) VALUES (?, 0, 0, 0, ?)",
        args: [2, timestamp],
      }),
    )
    await assert.rejects(
      connection.client.execute({
        sql: "INSERT INTO command_receipts (owner_key, action, idempotency_key, payload_hash, result_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          "github:owner",
          "create-component",
          "key",
          "not-a-hash",
          "component:1",
          timestamp,
        ],
      }),
    )
  })

  it("enforces incident public component snapshot constraints", async () => {
    const timestamp = Date.now()
    await connection.client.batch(
      [
        {
          sql: "INSERT INTO components (id, public_id, version, created_at, updated_at) VALUES ('component-public-1', 'component-public-id-1', 1, ?, ?)",
          args: [timestamp, timestamp],
        },
        {
          sql: "INSERT INTO incidents (id, public_id, version, created_at, updated_at) VALUES ('incident-public-1', 'incident-public-id-1', 1, ?, ?)",
          args: [timestamp, timestamp],
        },
        {
          sql: "INSERT INTO incident_updates (id, incident_id, incident_version, kind, phase, severity, title, public_title, public_phase, public_severity, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES ('incident-update-public-1', 'incident-public-1', 1, 'created', 'investigating', 'minor', 'Owner title', 'Public title', 'investigating', 'minor', ?, ?, 1, 'incident-entry-public-1', 'incident-correlation-public-1')",
          args: [timestamp, timestamp],
        },
      ],
      "write",
    )

    const insertReference = (position: number, publicationVersion: number) =>
      connection.client.execute({
        sql: "INSERT INTO incident_update_public_components (incident_update_id, position, component_id, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version) VALUES ('incident-update-public-1', ?, 'component-public-1', 'component-public-id-1', 'Public component', ?)",
        args: [position, publicationVersion],
      })

    await assert.rejects(insertReference(-1, 1))
    await assert.rejects(insertReference(0, 0))
    await insertReference(0, 1)
  })
})
