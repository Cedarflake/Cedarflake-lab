import "server-only"

import { headers } from "next/headers"

import { findOwnerIdentity } from "./owner-account"
import { getAuth } from "./server"
import { getDatabase } from "../db/client"
import { readAuthEnvironment } from "../env/server"

export class OwnerAuthorizationError extends Error {
  constructor() {
    super("Owner authorization required")
    this.name = "OwnerAuthorizationError"
  }
}

export type OwnerAccessState =
  | { kind: "anonymous" }
  | { kind: "denied" }
  | {
      kind: "owner"
      owner: NonNullable<Awaited<ReturnType<typeof findOwnerIdentity>>>
    }

export async function getOwnerAccessState(): Promise<OwnerAccessState> {
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return { kind: "anonymous" }
  }

  const { githubOwnerId } = readAuthEnvironment()
  const owner = await findOwnerIdentity(
    await getDatabase(),
    session.user.id,
    githubOwnerId,
  )

  return owner ? { kind: "owner", owner } : { kind: "denied" }
}

export async function getOwnerIdentity() {
  const access = await getOwnerAccessState()
  return access.kind === "owner" ? access.owner : null
}

export async function requireOwner() {
  const owner = await getOwnerIdentity()

  if (!owner) {
    throw new OwnerAuthorizationError()
  }

  return owner
}
