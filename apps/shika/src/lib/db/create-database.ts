import { createClient, type Client } from "@libsql/client"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"

import type { DatabaseEnvironment } from "../env/server"
import * as schema from "./schema"

export interface DatabaseConnection {
  client: Client
  db: LibSQLDatabase<typeof schema>
  isLocal: boolean
}

async function enableForeignKeyEnforcement(client: Client) {
  await client.execute("PRAGMA foreign_keys = ON")

  const result = await client.execute("PRAGMA foreign_keys")
  if (String(result.rows[0]?.[0]) !== "1") {
    throw new Error("Database foreign key enforcement is unavailable")
  }
}

export async function createDatabaseConnection(
  environment: DatabaseEnvironment,
): Promise<DatabaseConnection> {
  const client = createClient({
    url: environment.url,
    authToken: environment.authToken,
  })

  try {
    await enableForeignKeyEnforcement(client)

    const db = drizzle({ client, schema })
    const isLocal =
      environment.url === ":memory:" || environment.url.startsWith("file:")

    return { client, db, isLocal }
  } catch (error) {
    client.close()
    throw error
  }
}
