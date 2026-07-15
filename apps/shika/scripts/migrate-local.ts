import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { migrate } from "drizzle-orm/libsql/migrator"

import { createDatabaseConnection } from "../src/lib/db/create-database"

const databaseUrl = process.env.TURSO_DATABASE_URL ?? "file:.data/shika.db"

if (!databaseUrl.startsWith("file:")) {
  throw new Error("Local migration requires a file: database URL")
}

const dataDirectory = fileURLToPath(new URL("../.data", import.meta.url))
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))

async function main() {
  await mkdir(dataDirectory, { recursive: true })

  const connection = await createDatabaseConnection({ url: databaseUrl })

  try {
    await migrate(connection.db, { migrationsFolder })

    const requiredTables = new Set([
      "components",
      "incident_update_public_components",
      "publication_events",
      "timeline_clock",
      "auth_user",
    ])
    const tableResult = await connection.client.execute(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'components',
          'incident_update_public_components',
          'publication_events',
          'timeline_clock',
          'auth_user'
        )
    `)

    for (const row of tableResult.rows) {
      if (typeof row.name === "string") requiredTables.delete(row.name)
    }

    if (requiredTables.size > 0) {
      throw new Error("Local migration did not create the required schema")
    }

    const clockResult = await connection.client.execute(
      "SELECT id FROM timeline_clock WHERE id = 1",
    )
    if (clockResult.rows.length !== 1) {
      throw new Error("Local migration did not initialize the timeline clock")
    }
  } finally {
    await connection.client.close()
  }
}

void main()
