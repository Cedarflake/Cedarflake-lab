import type { DatabaseConnection } from "@/lib/db/create-database"

export interface HealthPayload {
  status: "ok" | "unavailable"
}

export interface HealthCheckResult {
  body: HealthPayload
  status: 200 | 503
}

export type ReadinessCheck = () => Promise<void>

const REQUIRED_TABLES = [
  "auth_account",
  "auth_rate_limit",
  "auth_session",
  "auth_user",
  "auth_verification",
  "command_receipts",
  "component_revisions",
  "components",
  "incident_update_components",
  "incident_update_public_components",
  "incident_updates",
  "incidents",
  "maintenance_event_components",
  "maintenance_events",
  "maintenance_windows",
  "publication_events",
  "site_profile",
  "site_profile_revisions",
  "status_transitions",
  "timeline_clock",
] as const

export async function checkDatabaseReadiness(
  connection: DatabaseConnection,
): Promise<void> {
  const placeholders = REQUIRED_TABLES.map(() => "?").join(", ")
  const tableResult = await connection.client.execute({
    sql: `
      SELECT name
      FROM sqlite_schema
      WHERE type = 'table'
        AND name IN (${placeholders})
    `,
    args: [...REQUIRED_TABLES],
  })
  const existingTables = new Set(
    tableResult.rows.flatMap((row) =>
      typeof row.name === "string" ? [row.name] : [],
    ),
  )

  if (REQUIRED_TABLES.some((tableName) => !existingTables.has(tableName))) {
    throw new Error("Database schema is not ready")
  }

  const clockResult = await connection.client.execute(
    "SELECT id FROM timeline_clock WHERE id = 1",
  )
  if (clockResult.rows.length !== 1) {
    throw new Error("Database timeline clock is not ready")
  }
}

export async function checkHealth(
  checkReadiness: ReadinessCheck,
): Promise<HealthCheckResult> {
  try {
    await checkReadiness()

    return {
      body: { status: "ok" },
      status: 200,
    }
  } catch {
    return {
      body: { status: "unavailable" },
      status: 503,
    }
  }
}
