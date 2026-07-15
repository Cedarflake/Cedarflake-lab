import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { and, eq } from "drizzle-orm"
import type { LibSQLDatabase } from "drizzle-orm/libsql"
import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"

import { isOwnerGitHubAccount } from "./owner-id"
import { account, authSchema } from "../db/schema/auth"
import type * as schema from "../db/schema"
import type { AuthEnvironment } from "../env/server"

function ownerOnlyError() {
  return new APIError("FORBIDDEN", {
    code: "OWNER_ONLY",
    message: "This application is owner-only",
  })
}

async function userHasOwnerAccount(
  db: LibSQLDatabase<typeof schema>,
  userId: string,
  githubOwnerId: string,
) {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "github"),
        eq(account.accountId, githubOwnerId),
      ),
    )
    .limit(1)

  return rows.length === 1
}

export function createShikaAuth(
  db: LibSQLDatabase<typeof schema>,
  environment: AuthEnvironment,
) {
  const trustedOrigin = new URL(environment.baseUrl).origin

  return betterAuth({
    appName: "Shika",
    baseURL: environment.baseUrl,
    secret: environment.secret,
    trustedOrigins: [trustedOrigin],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),
    socialProviders: {
      github: {
        clientId: environment.githubClientId,
        clientSecret: environment.githubClientSecret,
        mapProfileToUser(profile) {
          if (
            !isOwnerGitHubAccount(
              "github",
              String(profile.id),
              environment.githubOwnerId,
            )
          ) {
            throw ownerOnlyError()
          }

          return {}
        },
      },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false,
      accountLinking: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: environment.clientIpHeaders,
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (newAccount) => {
            if (
              !isOwnerGitHubAccount(
                newAccount.providerId,
                newAccount.accountId,
                environment.githubOwnerId,
              )
            ) {
              throw ownerOnlyError()
            }
          },
        },
      },
      session: {
        create: {
          before: async (newSession) => {
            if (
              !(await userHasOwnerAccount(
                db,
                newSession.userId,
                environment.githubOwnerId,
              ))
            ) {
              throw ownerOnlyError()
            }
          },
        },
      },
    },
    plugins: [nextCookies()],
  })
}

export type ShikaAuth = ReturnType<typeof createShikaAuth>
