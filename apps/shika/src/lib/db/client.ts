import "server-only"

import { readDatabaseEnvironment } from "../env/server"
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "./create-database"

let connection: Promise<DatabaseConnection> | undefined

export function getDatabaseConnection() {
  connection ??= createDatabaseConnection(readDatabaseEnvironment())
  return connection
}

export async function getDatabase() {
  return (await getDatabaseConnection()).db
}
