import "server-only"

import { createShikaAuth, type ShikaAuth } from "./create-auth"
import { getDatabase } from "../db/client"
import { readAuthEnvironment } from "../env/server"

let auth: Promise<ShikaAuth> | undefined

export function getAuth() {
  auth ??= createAuth()
  return auth
}

async function createAuth() {
  const db = await getDatabase()
  return createShikaAuth(db, readAuthEnvironment())
}
