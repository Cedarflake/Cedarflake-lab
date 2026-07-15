import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { findOwnerIdentity } from "../../src/lib/auth/owner-account"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

describe("owner account lookup", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
    const timestamp = Date.now()
    await connection.client.batch(
      [
        {
          sql: "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["user-1", "Owner", "owner@example.com", 1, timestamp, timestamp],
        },
        {
          sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["account-1", "900719925474099312345", "github", "user-1", timestamp, timestamp],
        },
      ],
      "write",
    )
  })

  afterEach(() => connection.client.close())

  it("authorizes only a session user linked to the configured GitHub ID", async () => {
    assert.deepEqual(
      await findOwnerIdentity(
        connection.db,
        "user-1",
        "900719925474099312345",
      ),
      {
        userId: "user-1",
        githubOwnerId: "900719925474099312345",
        ownerKey: "github:900719925474099312345",
      },
    )
    assert.equal(
      await findOwnerIdentity(connection.db, "user-1", "123"),
      null,
    )
    assert.equal(
      await findOwnerIdentity(
        connection.db,
        "different-user",
        "900719925474099312345",
      ),
      null,
    )
  })
})
