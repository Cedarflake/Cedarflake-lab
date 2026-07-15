import { defineConfig } from "drizzle-kit"
import { z } from "zod"

const remoteDatabaseEnvironment = z
  .object({
    TURSO_DATABASE_URL: z.string().url().startsWith("libsql://"),
    TURSO_AUTH_TOKEN: z.string().min(1),
  })
  .parse(process.env)

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  dbCredentials: {
    url: remoteDatabaseEnvironment.TURSO_DATABASE_URL,
    authToken: remoteDatabaseEnvironment.TURSO_AUTH_TOKEN,
  },
})
