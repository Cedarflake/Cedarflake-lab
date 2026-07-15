import assert from "node:assert/strict"
import { test } from "node:test"

import { createDatabaseConnection } from "../../src/lib/db/create-database"

test("database connections enable and enforce foreign keys before use", async () => {
  const connection = await createDatabaseConnection({ url: ":memory:" })

  try {
    const pragmaResult = await connection.client.execute("PRAGMA foreign_keys")
    assert.equal(String(pragmaResult.rows[0]?.[0]), "1")

    await connection.client.executeMultiple(`
      CREATE TABLE parents (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE children (
        id TEXT PRIMARY KEY NOT NULL,
        parent_id TEXT NOT NULL REFERENCES parents(id)
      );
    `)

    await assert.rejects(
      connection.client.execute({
        sql: "INSERT INTO children (id, parent_id) VALUES (?, ?)",
        args: ["child-1", "missing-parent"],
      }),
      /foreign key constraint/i,
    )
  } finally {
    connection.client.close()
  }
})
