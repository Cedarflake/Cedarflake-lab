import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { makeSignature } from "better-auth/crypto"

import { findOwnerIdentity } from "../../src/lib/auth/owner-account"
import {
  createShikaAuth,
  type ShikaAuth,
} from "../../src/lib/auth/create-auth"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import type { AuthEnvironment } from "../../src/lib/env/server"
import { createMigratedTestDatabase } from "../db/helpers"

const authEnvironment = {
  baseUrl: "http://localhost:3000",
  secret: "test-secret-that-is-at-least-32-characters",
  githubClientId: "github-client-id",
  githubClientSecret: "github-client-secret",
  githubOwnerId: "123456789",
  clientIpHeaders: ["x-vercel-forwarded-for"],
} satisfies AuthEnvironment

function createTestAuth(connection: DatabaseConnection) {
  return createShikaAuth(connection.db, authEnvironment)
}

function createSocialSignInRequest(callbackURL: string) {
  return new Request(
    `${authEnvironment.baseUrl}/api/auth/sign-in/social`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: authEnvironment.baseUrl,
        "x-vercel-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({
        provider: "github",
        callbackURL,
        errorCallbackURL: "/auth-error",
      }),
    },
  )
}

async function startGitHubOAuth(auth: ShikaAuth) {
  const response = await auth.handler(createSocialSignInRequest("/admin"))
  assert.equal(response.status, 200)
  const body = (await response.json()) as { url?: unknown }
  const state = new URL(String(body.url)).searchParams.get("state")
  const stateCookie = (response.headers.get("set-cookie") ?? "").match(
    /(?:^|,\s*)(better-auth\.state=[^;]+)/,
  )?.[1]
  assert.notEqual(state, null)
  assert.notEqual(stateCookie, undefined)

  return {
    state: state as string,
    stateCookie: stateCookie ?? "",
  }
}

function createGitHubFetchStub(githubId: string) {
  const calls: string[] = []
  const email = "owner@example.com"
  const stub: typeof globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push(url)

    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({
        access_token: "github-access-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      })
    }

    if (url === "https://api.github.com/user") {
      return Response.json({
        id: Number(githubId),
        login: "owner",
        name: "Owner",
        email,
        avatar_url: "https://avatars.example/owner.png",
      })
    }

    if (url === "https://api.github.com/user/emails") {
      return Response.json([
        {
          email,
          primary: true,
          verified: true,
          visibility: "public",
        },
      ])
    }

    throw new Error(`Unexpected GitHub OAuth request: ${url}`)
  }

  return { calls, stub }
}

function createGitHubCallbackRequest(state: string, stateCookie: string) {
  const url = new URL("/api/auth/callback/github", authEnvironment.baseUrl)
  url.searchParams.set("code", "test-code")
  url.searchParams.set("state", state)

  return new Request(url, {
    headers: {
      cookie: stateCookie,
      "x-vercel-forwarded-for": "203.0.113.10",
    },
  })
}

async function completeGitHubOAuth(
  auth: ShikaAuth,
  state: string,
  stateCookie: string,
  githubId: string,
) {
  const originalFetch = globalThis.fetch
  const { calls, stub } = createGitHubFetchStub(githubId)
  globalThis.fetch = stub

  try {
    return {
      calls,
      response: await auth.handler(
        createGitHubCallbackRequest(state, stateCookie),
      ),
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

function readSessionCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? ""
  const match = setCookie.match(/(?:^|,\s*)(better-auth\.session_token=[^;]+)/)
  assert.notEqual(match, null)

  return match?.[1] ?? ""
}

async function insertUser(
  connection: DatabaseConnection,
  userId: string,
  email: string,
) {
  const timestamp = Date.now()
  await connection.client.execute({
    sql: "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [userId, "Owner", email, 1, timestamp, timestamp],
  })
}

async function insertGitHubAccount(
  connection: DatabaseConnection,
  userId: string,
  accountId: string,
) {
  const timestamp = Date.now()
  await connection.client.execute({
    sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      `account-${userId}`,
      accountId,
      "github",
      userId,
      timestamp,
      timestamp,
    ],
  })
}

async function insertSession(
  connection: DatabaseConnection,
  userId: string,
  token: string,
) {
  const timestamp = Date.now()
  await connection.client.execute({
    sql: "INSERT INTO auth_session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      `session-${userId}`,
      timestamp + 60_000,
      token,
      timestamp,
      timestamp,
      userId,
    ],
  })
}

async function createOwnerSession(connection: DatabaseConnection) {
  const userId = "owner-user"
  await insertUser(connection, userId, "owner@example.com")
  await insertGitHubAccount(
    connection,
    userId,
    authEnvironment.githubOwnerId,
  )

  const auth = createTestAuth(connection)
  const context = await auth.$context
  const session = await context.internalAdapter.createSession(userId)

  return { auth, session, userId }
}

async function createSessionCookie(
  auth: ShikaAuth,
  token: string,
  secret = authEnvironment.secret,
) {
  const context = await auth.$context
  const signature = await makeSignature(token, secret)
  const value = encodeURIComponent(`${token}.${signature}`)

  return `${context.authCookies.sessionToken.name}=${value}`
}

async function requestSession(
  auth: ShikaAuth,
  token: string,
  secret = authEnvironment.secret,
) {
  return auth.handler(
    new Request(`${authEnvironment.baseUrl}/api/auth/get-session`, {
      headers: {
        cookie: await createSessionCookie(auth, token, secret),
        "x-vercel-forwarded-for": "203.0.113.10",
      },
    }),
  )
}

async function expectOwnerOnlyRejection(action: Promise<unknown>) {
  await assert.rejects(action, (error: unknown) => {
    assert.equal(error instanceof Error, true)
    assert.match((error as Error).message, /owner-only/i)
    return true
  })
}

describe("Better Auth integration", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("creates a database-backed GitHub OAuth request without external calls", async () => {
    const auth = createTestAuth(connection)
    const response = await auth.handler(createSocialSignInRequest("/admin"))

    assert.equal(response.status, 200)
    const body: unknown = await response.json()
    assert.equal(typeof body, "object")
    assert.notEqual(body, null)
    assert.match(
      String((body as { url?: unknown }).url),
      /^https:\/\/github\.com\/login\/oauth\/authorize/,
    )

    const stateRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_verification",
    )
    assert.equal(Number(stateRows.rows[0]?.count), 1)
  })

  it("completes the owner GitHub callback and issues a usable session", async () => {
    const auth = createTestAuth(connection)
    const { state, stateCookie } = await startGitHubOAuth(auth)

    const { calls, response } = await completeGitHubOAuth(
      auth,
      state,
      stateCookie,
      authEnvironment.githubOwnerId,
    )

    assert.equal(response.status, 302)
    assert.equal(response.headers.get("location"), "/admin")
    assert.deepEqual(calls, [
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
      "https://api.github.com/user/emails",
    ])

    const cookie = readSessionCookie(response)
    const sessionResponse = await auth.handler(
      new Request(`${authEnvironment.baseUrl}/api/auth/get-session`, {
        headers: {
          cookie,
          "x-vercel-forwarded-for": "203.0.113.10",
        },
      }),
    )
    const sessionBody = (await sessionResponse.json()) as {
      user?: { id?: unknown }
    } | null
    assert.notEqual(sessionBody, null)
    assert.equal(typeof sessionBody?.user?.id, "string")

    const accountRows = await connection.client.execute(
      "SELECT account_id, provider_id FROM auth_account",
    )
    assert.equal(accountRows.rows.length, 1)
    assert.equal(
      String(accountRows.rows[0]?.account_id),
      authEnvironment.githubOwnerId,
    )
    assert.equal(String(accountRows.rows[0]?.provider_id), "github")

    const persistedRows = await connection.client.execute(
      "SELECT (SELECT count(*) FROM auth_user) AS users, (SELECT count(*) FROM auth_session) AS sessions, (SELECT count(*) FROM auth_verification) AS verifications",
    )
    assert.equal(Number(persistedRows.rows[0]?.users), 1)
    assert.equal(Number(persistedRows.rows[0]?.sessions), 1)
    assert.equal(Number(persistedRows.rows[0]?.verifications), 0)
  })

  it("rejects a non-owner GitHub callback without creating auth records", async () => {
    const auth = createTestAuth(connection)
    const { state, stateCookie } = await startGitHubOAuth(auth)

    const { response } = await completeGitHubOAuth(
      auth,
      state,
      stateCookie,
      "987654321",
    )

    assert.equal(response.status, 403)
    const body = (await response.json()) as { code?: unknown }
    assert.equal(body.code, "OWNER_ONLY")
    assert.doesNotMatch(
      response.headers.get("set-cookie") ?? "",
      /better-auth\.session_token=/,
    )

    const persistedRows = await connection.client.execute(
      "SELECT (SELECT count(*) FROM auth_user) AS users, (SELECT count(*) FROM auth_account) AS accounts, (SELECT count(*) FROM auth_session) AS sessions",
    )
    assert.equal(Number(persistedRows.rows[0]?.users), 0)
    assert.equal(Number(persistedRows.rows[0]?.accounts), 0)
    assert.equal(Number(persistedRows.rows[0]?.sessions), 0)
  })

  it("rejects an external OAuth callback URL before storing state", async () => {
    const auth = createTestAuth(connection)
    const response = await auth.handler(
      createSocialSignInRequest("https://attacker.example/collect"),
    )

    assert.equal(response.status, 403)
    const stateRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_verification",
    )
    assert.equal(Number(stateRows.rows[0]?.count), 0)
  })

  it("rejects non-owner GitHub account creation without persistence", async () => {
    await insertUser(connection, "non-owner-user", "non-owner@example.com")
    const auth = createTestAuth(connection)
    const context = await auth.$context

    await expectOwnerOnlyRejection(
      context.internalAdapter.createAccount({
        accountId: "987654321",
        providerId: "github",
        userId: "non-owner-user",
      }),
    )

    const accountRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_account",
    )
    assert.equal(Number(accountRows.rows[0]?.count), 0)
  })

  it("returns a database-backed owner session for a valid signed cookie", async () => {
    const { auth, session, userId } = await createOwnerSession(connection)
    const response = await requestSession(auth, session.token)

    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      session: { token: string }
      user: { id: string }
    } | null
    assert.notEqual(body, null)
    assert.equal(body?.session.token, session.token)
    assert.equal(body?.user.id, userId)
  })

  it("rejects a forged session cookie without deleting the real session", async () => {
    const { auth, session } = await createOwnerSession(connection)
    const response = await requestSession(
      auth,
      session.token,
      "different-test-secret-that-is-at-least-32-characters",
    )

    assert.equal(response.status, 200)
    assert.equal(await response.json(), null)
    const sessionRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_session",
    )
    assert.equal(Number(sessionRows.rows[0]?.count), 1)
  })

  it("deletes an expired session and clears its cookie", async () => {
    const { auth, session } = await createOwnerSession(connection)
    await connection.client.execute({
      sql: "UPDATE auth_session SET expires_at = ? WHERE token = ?",
      args: [Date.now() - 1_000, session.token],
    })

    const response = await requestSession(auth, session.token)

    assert.equal(response.status, 200)
    assert.equal(await response.json(), null)
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /better-auth\.session_token=; Max-Age=0/,
    )
    const sessionRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_session",
    )
    assert.equal(Number(sessionRows.rows[0]?.count), 0)
  })

  it("rejects a revoked session immediately", async () => {
    const { auth, session } = await createOwnerSession(connection)
    const cookie = await createSessionCookie(auth, session.token)

    const firstResponse = await auth.handler(
      new Request(`${authEnvironment.baseUrl}/api/auth/get-session`, {
        headers: {
          cookie,
          "x-vercel-forwarded-for": "203.0.113.10",
        },
      }),
    )
    assert.notEqual(await firstResponse.json(), null)

    const signOutResponse = await auth.handler(
      new Request(`${authEnvironment.baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          cookie,
          origin: authEnvironment.baseUrl,
          "x-vercel-forwarded-for": "203.0.113.10",
        },
      }),
    )
    assert.equal(signOutResponse.status, 200)

    const revokedResponse = await auth.handler(
      new Request(`${authEnvironment.baseUrl}/api/auth/get-session`, {
        headers: {
          cookie,
          "x-vercel-forwarded-for": "203.0.113.10",
        },
      }),
    )

    assert.equal(revokedResponse.status, 200)
    assert.equal(await revokedResponse.json(), null)
    assert.match(
      revokedResponse.headers.get("set-cookie") ?? "",
      /better-auth\.session_token=; Max-Age=0/,
    )
    const sessionRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_session",
    )
    assert.equal(Number(sessionRows.rows[0]?.count), 0)
  })

  it("authenticates a signed session but denies an owner ID mismatch", async () => {
    const userId = "stale-owner-user"
    const token = "stale-owner-session-token"
    await insertUser(connection, userId, "stale-owner@example.com")
    await insertGitHubAccount(connection, userId, "987654321")
    await insertSession(connection, userId, token)
    const auth = createTestAuth(connection)

    const response = await requestSession(auth, token)

    assert.notEqual(await response.json(), null)
    assert.equal(
      await findOwnerIdentity(
        connection.db,
        userId,
        authEnvironment.githubOwnerId,
      ),
      null,
    )
  })

  it("rejects session creation when the configured owner ID no longer matches", async () => {
    await insertUser(connection, "mismatched-user", "mismatch@example.com")
    await insertGitHubAccount(connection, "mismatched-user", "987654321")
    const auth = createTestAuth(connection)
    const context = await auth.$context

    await expectOwnerOnlyRejection(
      context.internalAdapter.createSession("mismatched-user"),
    )

    const sessionRows = await connection.client.execute(
      "SELECT count(*) AS count FROM auth_session",
    )
    assert.equal(Number(sessionRows.rows[0]?.count), 0)
  })
})
