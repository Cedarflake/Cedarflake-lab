import assert from "node:assert/strict"
import { test } from "node:test"

import {
  checkDatabaseReadiness,
  checkHealth,
} from "../src/app/api/health/health"
import { createDatabaseConnection } from "../src/lib/db/create-database"
import { createMigratedTestDatabase } from "./db/helpers"

test("health succeeds after the readiness dependency responds", async () => {
  let checks = 0

  const result = await checkHealth(async () => {
    checks += 1
  })

  assert.equal(checks, 1)
  assert.deepEqual(result, {
    body: { status: "ok" },
    status: 200,
  })
})

test("health returns a generic unavailable response when readiness fails", async () => {
  const secret = "libsql://private-database.example/token-value"

  const result = await checkHealth(async () => {
    throw new Error(secret)
  })

  assert.deepEqual(result, {
    body: { status: "unavailable" },
    status: 503,
  })
  assert.equal(JSON.stringify(result).includes(secret), false)
})

test("health is unavailable when the database schema is empty", async () => {
  const connection = await createDatabaseConnection({ url: ":memory:" })

  try {
    const result = await checkHealth(() => checkDatabaseReadiness(connection))

    assert.deepEqual(result, {
      body: { status: "unavailable" },
      status: 503,
    })
  } finally {
    connection.client.close()
  }
})

test("health succeeds after the current schema is fully migrated", async () => {
  const connection = await createMigratedTestDatabase()

  try {
    const result = await checkHealth(() => checkDatabaseReadiness(connection))

    assert.deepEqual(result, {
      body: { status: "ok" },
      status: 200,
    })
  } finally {
    connection.client.close()
  }
})

test("health is unavailable when a current schema table is missing", async () => {
  const connection = await createMigratedTestDatabase()

  try {
    await connection.client.execute(
      "DROP TABLE incident_update_public_components",
    )

    const result = await checkHealth(() => checkDatabaseReadiness(connection))
    assert.equal(result.status, 503)
  } finally {
    connection.client.close()
  }
})

test("health is unavailable without the timeline clock singleton", async () => {
  const connection = await createMigratedTestDatabase()

  try {
    await connection.client.execute("DELETE FROM timeline_clock WHERE id = 1")

    const result = await checkHealth(() => checkDatabaseReadiness(connection))
    assert.equal(result.status, 503)
  } finally {
    connection.client.close()
  }
})
