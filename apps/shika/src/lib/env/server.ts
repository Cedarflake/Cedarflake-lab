import { z } from "zod"

import { normalizeGitHubOwnerId } from "../auth/owner-id"
import { ConfigurationError } from "../configuration-error"

const databaseUrlSchema = z.string().min(1).refine(
  (value) =>
    value === ":memory:" ||
    value.startsWith("file:") ||
    value.startsWith("libsql://") ||
    value.startsWith("http://") ||
    value.startsWith("https://"),
  "Unsupported libSQL database URL",
)

const optionalEnvironmentValue = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional())

const databaseEnvironmentSchema = z.object({
  TURSO_DATABASE_URL: databaseUrlSchema,
  TURSO_AUTH_TOKEN: optionalEnvironmentValue(z.string().min(1)),
})

const authEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    GITHUB_OWNER_ID: z.string().transform(normalizeGitHubOwnerId),
    PUBLIC_TIMELINE_CURSOR_SECRET: optionalEnvironmentValue(z.string().min(32)),
    AUTH_CLIENT_IP_HEADER: optionalEnvironmentValue(
      z.enum([
        "x-vercel-forwarded-for",
        "x-nf-client-connection-ip",
        "cf-connecting-ip",
      ]),
    ),
  })
  .superRefine((value, context) => {
    const url = new URL(value.BETTER_AUTH_URL)
    const isCanonicalOrigin =
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""

    if (!isCanonicalOrigin) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must be a canonical HTTP origin",
      })
    }

    if (value.NODE_ENV === "production" && url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "Production authentication requires HTTPS",
      })
    }

    if (value.NODE_ENV === "production" && !value.AUTH_CLIENT_IP_HEADER) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_CLIENT_IP_HEADER"],
        message: "Production authentication requires a trusted client IP header",
      })
    }

    if (
      value.PUBLIC_TIMELINE_CURSOR_SECRET === value.BETTER_AUTH_SECRET
    ) {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_TIMELINE_CURSOR_SECRET"],
        message: "Authentication and timeline secrets must be independent",
      })
    }
  })

const timelineEnvironmentSchema = z
  .object({
    PUBLIC_TIMELINE_CURSOR_SECRET: z.string().min(32),
    BETTER_AUTH_SECRET: optionalEnvironmentValue(z.string().min(32)),
  })
  .superRefine((value, context) => {
    if (value.BETTER_AUTH_SECRET === value.PUBLIC_TIMELINE_CURSOR_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_TIMELINE_CURSOR_SECRET"],
        message: "Authentication and timeline secrets must be independent",
      })
    }
  })

export interface DatabaseEnvironment {
  url: string
  authToken?: string
}

export interface AuthEnvironment {
  baseUrl: string
  secret: string
  githubClientId: string
  githubClientSecret: string
  githubOwnerId: string
  clientIpHeaders: string[]
}

export interface TimelineEnvironment {
  cursorSecret: string
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export function readDatabaseEnvironment(
  environment: EnvironmentSource = process.env,
): DatabaseEnvironment {
  const result = databaseEnvironmentSchema.safeParse(environment)

  if (!result.success) {
    throw new ConfigurationError("Shika database configuration is invalid")
  }

  const isRemote = ![
    ":memory:",
    "file:",
  ].some((prefix) => result.data.TURSO_DATABASE_URL.startsWith(prefix))

  if (isRemote && !result.data.TURSO_AUTH_TOKEN) {
    throw new ConfigurationError(
      "A Turso auth token is required for a remote database",
    )
  }

  return {
    url: result.data.TURSO_DATABASE_URL,
    authToken: result.data.TURSO_AUTH_TOKEN,
  }
}

export function readAuthEnvironment(
  environment: EnvironmentSource = process.env,
): AuthEnvironment {
  const result = authEnvironmentSchema.safeParse(environment)

  if (!result.success) {
    throw new ConfigurationError("Shika authentication configuration is invalid")
  }

  return {
    baseUrl: new URL(result.data.BETTER_AUTH_URL).origin,
    secret: result.data.BETTER_AUTH_SECRET,
    githubClientId: result.data.GITHUB_CLIENT_ID,
    githubClientSecret: result.data.GITHUB_CLIENT_SECRET,
    githubOwnerId: result.data.GITHUB_OWNER_ID,
    clientIpHeaders: result.data.AUTH_CLIENT_IP_HEADER
      ? [result.data.AUTH_CLIENT_IP_HEADER]
      : [],
  }
}

export function readTimelineEnvironment(
  environment: EnvironmentSource = process.env,
): TimelineEnvironment {
  const result = timelineEnvironmentSchema.safeParse(environment)

  if (!result.success) {
    throw new ConfigurationError("Shika timeline configuration is invalid")
  }

  return { cursorSecret: result.data.PUBLIC_TIMELINE_CURSOR_SECRET }
}
