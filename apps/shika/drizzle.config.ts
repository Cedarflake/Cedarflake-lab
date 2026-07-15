import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
})
