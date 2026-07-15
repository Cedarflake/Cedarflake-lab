import { and, eq } from "drizzle-orm"
import type { LibSQLDatabase } from "drizzle-orm/libsql"

import { createOwnerKey, normalizeGitHubOwnerId } from "./owner-id"
import { account } from "../db/schema/auth"
import type * as schema from "../db/schema"

export interface OwnerIdentity {
  userId: string
  githubOwnerId: string
  ownerKey: `github:${string}`
}

export async function findOwnerIdentity(
  db: LibSQLDatabase<typeof schema>,
  userId: string,
  githubOwnerId: string,
): Promise<OwnerIdentity | null> {
  const normalizedOwnerId = normalizeGitHubOwnerId(githubOwnerId)
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "github"),
        eq(account.accountId, normalizedOwnerId),
      ),
    )
    .limit(1)

  if (!rows[0]) {
    return null
  }

  return {
    userId,
    githubOwnerId: normalizedOwnerId,
    ownerKey: createOwnerKey(normalizedOwnerId),
  }
}
