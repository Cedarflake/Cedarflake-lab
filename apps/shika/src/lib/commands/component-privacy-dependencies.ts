import { z } from "zod"

import { CommandValidationError } from "./errors"
import type { StatementExecutor } from "./write-transaction"

export type ComponentPrivacyAction = "withdraw" | "redact" | "suppress"

export interface ComponentPrivacyParentDependency {
  kind: "incident" | "maintenance"
  id: string
  version: number
  publicationVersion: number
}

function invalidDependencyState() {
  return new CommandValidationError(
    "INVALID_COMPONENT_STATE",
    "Stored component dependency state is invalid",
  )
}

export async function readComponentPrivacyParents(
  executor: StatementExecutor,
  componentId: string,
  action: ComponentPrivacyAction,
): Promise<ComponentPrivacyParentDependency[]> {
  const sourcePredicate =
    action === "suppress"
      ? "latest_source_state.action != 'suppress'"
      : "latest_source_state.action IN ('publish', 'withdraw')"
  const result = await executor.execute({
    sql: `
      WITH ranked_source_state AS (
        SELECT
          stream_type,
          stream_id,
          target_source_id,
          action,
          row_number() OVER (
            PARTITION BY stream_type, stream_id, target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS source_rank
        FROM publication_events
        WHERE stream_type IN ('incident', 'maintenance')
      ),
      latest_source_state AS (
        SELECT stream_type, stream_id, target_source_id, action
        FROM ranked_source_state
        WHERE source_rank = 1
      ),
      ranked_stream_head AS (
        SELECT
          stream_type,
          stream_id,
          publication_version,
          row_number() OVER (
            PARTITION BY stream_type, stream_id
            ORDER BY publication_version DESC, id DESC
          ) AS stream_rank
        FROM publication_events
        WHERE stream_type IN ('incident', 'maintenance')
      ),
      latest_stream_head AS (
        SELECT stream_type, stream_id, publication_version
        FROM ranked_stream_head
        WHERE stream_rank = 1
      ),
      incident_hits AS (
        SELECT DISTINCT
          'incident' AS parent_kind,
          incident_updates.incident_id AS parent_id,
          incidents.version AS parent_version,
          latest_stream_head.publication_version AS parent_publication_version
        FROM incident_update_public_components
        INNER JOIN incident_updates
          ON incident_updates.id = incident_update_public_components.incident_update_id
        INNER JOIN incidents
          ON incidents.id = incident_updates.incident_id
        INNER JOIN latest_source_state
          ON latest_source_state.stream_type = 'incident'
          AND latest_source_state.stream_id = incident_updates.incident_id
          AND latest_source_state.target_source_id = incident_updates.id
        INNER JOIN latest_stream_head
          ON latest_stream_head.stream_type = 'incident'
          AND latest_stream_head.stream_id = incident_updates.incident_id
        WHERE incident_update_public_components.component_id = ?
          AND ${sourcePredicate}
      ),
      maintenance_hits AS (
        SELECT DISTINCT
          'maintenance' AS parent_kind,
          maintenance_events.maintenance_window_id AS parent_id,
          maintenance_windows.version AS parent_version,
          latest_stream_head.publication_version AS parent_publication_version
        FROM maintenance_event_components
        INNER JOIN maintenance_events
          ON maintenance_events.id = maintenance_event_components.maintenance_event_id
        INNER JOIN maintenance_windows
          ON maintenance_windows.id = maintenance_events.maintenance_window_id
        INNER JOIN latest_source_state
          ON latest_source_state.stream_type = 'maintenance'
          AND latest_source_state.stream_id = maintenance_events.maintenance_window_id
          AND latest_source_state.target_source_id = maintenance_events.id
        INNER JOIN latest_stream_head
          ON latest_stream_head.stream_type = 'maintenance'
          AND latest_stream_head.stream_id = maintenance_events.maintenance_window_id
        WHERE maintenance_event_components.component_id = ?
          AND maintenance_event_components.public_component_id_snapshot IS NOT NULL
          AND maintenance_event_components.public_name_snapshot IS NOT NULL
          AND maintenance_event_components.component_metadata_publication_version IS NOT NULL
          AND ${sourcePredicate}
      )
      SELECT * FROM incident_hits
      UNION ALL
      SELECT * FROM maintenance_hits
      ORDER BY parent_kind, parent_id
    `,
    args: [componentId, componentId],
  })

  return result.rows.map((row) => {
    const parsed = z
      .object({
        parent_kind: z.enum(["incident", "maintenance"]),
        parent_id: z.uuid(),
        parent_version: z.number().int().positive().safe(),
        parent_publication_version: z
          .number()
          .int()
          .positive()
          .safe(),
      })
      .strict()
      .safeParse(row)
    if (!parsed.success) throw invalidDependencyState()

    return {
      kind: parsed.data.parent_kind,
      id: parsed.data.parent_id,
      version: parsed.data.parent_version,
      publicationVersion: parsed.data.parent_publication_version,
    }
  })
}
