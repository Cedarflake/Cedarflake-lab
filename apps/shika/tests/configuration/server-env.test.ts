import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  readAuthEnvironment,
  readDatabaseEnvironment,
  readTimelineEnvironment,
} from "../../src/lib/env/server"

describe("server environment", () => {
  it("allows credential-free local libSQL databases", () => {
    assert.deepEqual(
      readDatabaseEnvironment({ TURSO_DATABASE_URL: ":memory:" }),
      { url: ":memory:", authToken: undefined },
    )
    assert.deepEqual(
      readDatabaseEnvironment({
        TURSO_DATABASE_URL: "file:.data/test.db",
        TURSO_AUTH_TOKEN: "",
      }),
      { url: "file:.data/test.db", authToken: undefined },
    )
  })

  it("requires credentials for a remote database", () => {
    assert.throws(
      () =>
        readDatabaseEnvironment({
          TURSO_DATABASE_URL: "libsql://example.turso.io",
        }),
      /auth token is required/,
    )
  })

  it("fails closed when auth configuration is incomplete", () => {
    assert.throws(
      () => readAuthEnvironment({ BETTER_AUTH_URL: "https://example.com" }),
      /authentication configuration is invalid/,
    )
  })

  it("returns a normalized owner-only auth configuration", () => {
    const result = readAuthEnvironment({
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "https://status.example.com",
      GITHUB_CLIENT_ID: "client",
      GITHUB_CLIENT_SECRET: "secret",
      GITHUB_OWNER_ID: "900719925474099312345",
      AUTH_CLIENT_IP_HEADER: "",
    })

    assert.equal(result.githubOwnerId, "900719925474099312345")
    assert.equal(result.baseUrl, "https://status.example.com")
    assert.deepEqual(result.clientIpHeaders, [])
  })

  it("requires a canonical HTTPS origin and trusted platform IP header in production", () => {
    const base = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "a".repeat(32),
      GITHUB_CLIENT_ID: "client",
      GITHUB_CLIENT_SECRET: "secret",
      GITHUB_OWNER_ID: "1",
    }

    assert.throws(
      () =>
        readAuthEnvironment({
          ...base,
          BETTER_AUTH_URL: "http://status.example.com",
          AUTH_CLIENT_IP_HEADER: "x-vercel-forwarded-for",
        }),
      /authentication configuration is invalid/,
    )
    assert.throws(
      () =>
        readAuthEnvironment({
          ...base,
          BETTER_AUTH_URL: "https://user@status.example.com/path?query=1",
          AUTH_CLIENT_IP_HEADER: "x-vercel-forwarded-for",
        }),
      /authentication configuration is invalid/,
    )
    assert.throws(
      () =>
        readAuthEnvironment({
          ...base,
          BETTER_AUTH_URL: "https://status.example.com",
        }),
      /authentication configuration is invalid/,
    )

    const result = readAuthEnvironment({
      ...base,
      BETTER_AUTH_URL: "https://status.example.com/",
      AUTH_CLIENT_IP_HEADER: "cf-connecting-ip",
    })
    assert.equal(result.baseUrl, "https://status.example.com")
    assert.deepEqual(result.clientIpHeaders, ["cf-connecting-ip"])
  })

  it("requires an independent timeline cursor secret", () => {
    assert.throws(
      () => readTimelineEnvironment({ PUBLIC_TIMELINE_CURSOR_SECRET: "short" }),
      /timeline configuration is invalid/,
    )

    const reusedSecret = "shared-secret".repeat(3)
    assert.throws(
      () =>
        readTimelineEnvironment({
          BETTER_AUTH_SECRET: reusedSecret,
          PUBLIC_TIMELINE_CURSOR_SECRET: reusedSecret,
        }),
      /timeline configuration is invalid/,
    )
    assert.throws(
      () =>
        readAuthEnvironment({
          BETTER_AUTH_SECRET: reusedSecret,
          BETTER_AUTH_URL: "https://status.example.com",
          GITHUB_CLIENT_ID: "client",
          GITHUB_CLIENT_SECRET: "secret",
          GITHUB_OWNER_ID: "1",
          PUBLIC_TIMELINE_CURSOR_SECRET: reusedSecret,
        }),
      /authentication configuration is invalid/,
    )

    assert.deepEqual(
      readTimelineEnvironment({
        PUBLIC_TIMELINE_CURSOR_SECRET: "timeline-secret".repeat(3),
      }),
      { cursorSecret: "timeline-secret".repeat(3) },
    )
  })
})
