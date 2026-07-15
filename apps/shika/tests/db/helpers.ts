import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { migrate } from "drizzle-orm/libsql/migrator"

import { createDatabaseConnection } from "../../src/lib/db/create-database"

export const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
)

export async function createMigratedTestDatabase(url = ":memory:") {
  const connection = await createDatabaseConnection({ url })
  await migrate(connection.db, { migrationsFolder })
  return connection
}

export async function createTemporaryMigratedTestDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "shika-database-"))
  const databasePath = join(directory, "test.db").replaceAll("\\", "/")
  const connection = await createMigratedTestDatabase(`file:${databasePath}`)

  return {
    connection,
    async close() {
      await connection.client.close()
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
    },
  }
}
