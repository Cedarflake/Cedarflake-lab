import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { withWriteTransaction } from "../../src/lib/commands/write-transaction"
import { createTemporaryMigratedTestDatabase } from "./helpers"

describe("local file write transaction", () => {
  it("commits on the client connection and releases the file handle", async () => {
    const database = await createTemporaryMigratedTestDatabase()

    try {
      await withWriteTransaction(database.connection, async (transaction) => {
        await transaction.execute({
          sql: "INSERT INTO site_profile (id, version, created_at, updated_at) VALUES ('site', 1, ?, ?)",
          args: [1_000, 1_000],
        })
      })

      const result = await database.connection.client.execute(
        "SELECT version FROM site_profile WHERE id = 'site'",
      )
      assert.equal(Number(result.rows[0]?.version), 1)
    } finally {
      await database.close()
    }
  })
})
