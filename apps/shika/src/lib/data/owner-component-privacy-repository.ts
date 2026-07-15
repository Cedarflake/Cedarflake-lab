import { z } from "zod"

import {
  readComponentPrivacyParents,
  type ComponentPrivacyAction,
  type ComponentPrivacyParentDependency,
} from "@/lib/commands/component-privacy-dependencies"
import type { DatabaseConnection } from "@/lib/db/create-database"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

export type ComponentPrivacyUnavailableReason =
  | "no_public_history"
  | "no_current_projection"
  | "historical_dependants"
  | "already_redacted"
  | "already_suppressed"

export type ComponentPrivacyParentGuard =
  | {
      kind: "incident"
      incidentId: string
      expectedIncidentVersion: number
      expectedIncidentPublicationVersion: number
    }
  | {
      kind: "maintenance"
      maintenanceWindowId: string
      expectedMaintenanceVersion: number
      expectedMaintenancePublicationVersion: number
    }

export interface ComponentPrivacyRelatedGuard {
  componentId: string
  ownerName: string
  parentCount: number
  expectedComponentVersion: number
  expectedComponentMetadataPublicationVersion: number
}

export interface ComponentPrivacyActionReview {
  action: ComponentPrivacyAction
  isAvailable: boolean
  unavailableReason: ComponentPrivacyUnavailableReason | null
  metadataSourceCount: number
  statusSourceCount: number
  dependentParents: readonly ComponentPrivacyParentGuard[]
  relatedComponents: readonly ComponentPrivacyRelatedGuard[]
}

export interface OwnerComponentPrivacyReviewDto {
  target: {
    componentId: string
    ownerName: string
    lifecycle: "active" | "archived"
    componentVersion: number
    metadataPublicationVersion: number
    statusPublicationVersion: number
    metadataLastAction: z.infer<typeof publicationActionSchema> | null
    statusLastAction: z.infer<typeof publicationActionSchema> | null
    isCurrentlyPublic: boolean
  }
  withdraw: ComponentPrivacyActionReview
  redact: ComponentPrivacyActionReview
  suppress: ComponentPrivacyActionReview
}

interface TargetState {
  componentId: string
  ownerName: string
  lifecycle: "active" | "archived"
  componentVersion: number
  metadataPublicationVersion: number
  statusPublicationVersion: number
  metadataLastAction: z.infer<typeof publicationActionSchema> | null
  statusLastAction: z.infer<typeof publicationActionSchema> | null
  isCurrentlyPublic: boolean
}

interface SourceState {
  streamType: "component_metadata" | "component_status"
  action: z.infer<typeof publicationActionSchema>
}

function invalidReviewState() {
  return new Error("Stored component privacy review state is invalid")
}

async function readTargetState(
  connection: DatabaseConnection,
  componentId: string,
): Promise<TargetState | null> {
  const result = await connection.client.execute({
    sql: `
      SELECT
        components.id AS component_id,
        components.version AS component_version,
        component_revisions.owner_name,
        component_revisions.lifecycle,
        (SELECT publication_version FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS metadata_publication_version,
        (SELECT action FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS metadata_last_action,
        (SELECT resulting_disposition FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS metadata_disposition,
        (SELECT publication_version FROM publication_events WHERE stream_type = 'component_status' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS status_publication_version,
        (SELECT action FROM publication_events WHERE stream_type = 'component_status' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS status_last_action
      FROM components
      INNER JOIN component_revisions
        ON component_revisions.id = (
          SELECT id
          FROM component_revisions AS latest_revision
          WHERE latest_revision.component_id = components.id
          ORDER BY latest_revision.component_version DESC, latest_revision.id DESC
          LIMIT 1
        )
      WHERE components.id = ?
      LIMIT 1
    `,
    args: [componentId],
  })
  const row = result.rows[0]
  if (!row) return null

  const parsed = z
    .object({
      component_id: z.uuid(),
      component_version: z.number().int().positive().safe(),
      owner_name: z.string().trim().min(1).max(80),
      lifecycle: z.enum(["active", "archived"]),
      metadata_publication_version: z
        .number()
        .int()
        .positive()
        .safe()
        .nullable(),
      metadata_last_action: publicationActionSchema.nullable(),
      metadata_disposition: z.enum(["published", "closed"]).nullable(),
      status_publication_version: z
        .number()
        .int()
        .positive()
        .safe()
        .nullable(),
      status_last_action: publicationActionSchema.nullable(),
    })
    .strict()
    .safeParse(row)
  if (!parsed.success) throw invalidReviewState()

  const hasMetadataHistory =
    parsed.data.metadata_publication_version !== null &&
    parsed.data.metadata_last_action !== null &&
    parsed.data.metadata_disposition !== null
  const hasStatusHistory =
    parsed.data.status_publication_version !== null &&
    parsed.data.status_last_action !== null
  if (
    hasMetadataHistory !==
      (parsed.data.metadata_publication_version !== null) ||
    hasStatusHistory !== (parsed.data.status_publication_version !== null)
  ) {
    throw invalidReviewState()
  }

  return {
    componentId: parsed.data.component_id,
    ownerName: parsed.data.owner_name,
    lifecycle: parsed.data.lifecycle,
    componentVersion: parsed.data.component_version,
    metadataPublicationVersion:
      parsed.data.metadata_publication_version ?? 0,
    statusPublicationVersion: parsed.data.status_publication_version ?? 0,
    metadataLastAction: parsed.data.metadata_last_action,
    statusLastAction: parsed.data.status_last_action,
    isCurrentlyPublic: parsed.data.metadata_disposition === "published",
  }
}

async function readSourceStates(
  connection: DatabaseConnection,
  componentId: string,
): Promise<SourceState[]> {
  const result = await connection.client.execute({
    sql: `
      WITH ranked AS (
        SELECT
          stream_type,
          action,
          row_number() OVER (
            PARTITION BY stream_type, target_source_id
            ORDER BY publication_version DESC, id DESC
          ) AS source_rank
        FROM publication_events
        WHERE stream_type IN ('component_metadata', 'component_status')
          AND stream_id = ?
      )
      SELECT stream_type, action
      FROM ranked
      WHERE source_rank = 1
    `,
    args: [componentId],
  })

  return result.rows.map((row) => {
    const parsed = z
      .object({
        stream_type: z.enum(["component_metadata", "component_status"]),
        action: publicationActionSchema,
      })
      .strict()
      .safeParse(row)
    if (!parsed.success) throw invalidReviewState()
    return {
      streamType: parsed.data.stream_type,
      action: parsed.data.action,
    }
  })
}

function parentGuard(
  parent: ComponentPrivacyParentDependency,
): ComponentPrivacyParentGuard {
  return parent.kind === "incident"
    ? {
        kind: "incident",
        incidentId: parent.id,
        expectedIncidentVersion: parent.version,
        expectedIncidentPublicationVersion: parent.publicationVersion,
      }
    : {
        kind: "maintenance",
        maintenanceWindowId: parent.id,
        expectedMaintenanceVersion: parent.version,
        expectedMaintenancePublicationVersion: parent.publicationVersion,
      }
}

async function readRelatedComponents(
  connection: DatabaseConnection,
  targetComponentId: string,
  action: "redact" | "suppress",
  parents: readonly ComponentPrivacyParentDependency[],
): Promise<ComponentPrivacyRelatedGuard[]> {
  const incidentIds = parents
    .filter((parent) => parent.kind === "incident")
    .map((parent) => parent.id)
  const maintenanceIds = parents
    .filter((parent) => parent.kind === "maintenance")
    .map((parent) => parent.id)
  if (incidentIds.length === 0 && maintenanceIds.length === 0) return []

  const sourcePredicate =
    action === "suppress"
      ? "latest.action != 'suppress'"
      : "latest.action IN ('publish', 'withdraw')"
  const referenceQueries: string[] = []
  const args: Array<string | number> = []

  if (incidentIds.length > 0) {
    referenceQueries.push(`
      SELECT
        'incident' AS parent_kind,
        incident_updates.incident_id AS parent_id,
        incident_update_public_components.component_id
      FROM latest
      INNER JOIN incident_updates
        ON latest.stream_type = 'incident'
        AND latest.stream_id = incident_updates.incident_id
        AND latest.target_source_id = incident_updates.id
      INNER JOIN incident_update_public_components
        ON incident_update_public_components.incident_update_id = incident_updates.id
      WHERE latest.source_rank = 1
        AND ${sourcePredicate}
        AND incident_updates.incident_id IN (${incidentIds.map(() => "?").join(", ")})
    `)
    args.push(...incidentIds)
  }

  if (maintenanceIds.length > 0) {
    referenceQueries.push(`
      SELECT
        'maintenance' AS parent_kind,
        maintenance_events.maintenance_window_id AS parent_id,
        maintenance_event_components.component_id
      FROM latest
      INNER JOIN maintenance_events
        ON latest.stream_type = 'maintenance'
        AND latest.stream_id = maintenance_events.maintenance_window_id
        AND latest.target_source_id = maintenance_events.id
      INNER JOIN maintenance_event_components
        ON maintenance_event_components.maintenance_event_id = maintenance_events.id
      WHERE latest.source_rank = 1
        AND ${sourcePredicate}
        AND maintenance_events.maintenance_window_id IN (${maintenanceIds.map(() => "?").join(", ")})
        AND maintenance_event_components.public_component_id_snapshot IS NOT NULL
        AND maintenance_event_components.public_name_snapshot IS NOT NULL
        AND maintenance_event_components.component_metadata_publication_version IS NOT NULL
    `)
    args.push(...maintenanceIds)
  }
  args.push(targetComponentId)

  const result = await connection.client.execute({
    sql: `
      WITH latest AS (
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
      relevant_references AS (
        ${referenceQueries.join(" UNION ALL ")}
      )
      SELECT
        relevant_references.component_id,
        components.version AS component_version,
        component_revisions.owner_name,
        (SELECT publication_version FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = components.id ORDER BY publication_version DESC, id DESC LIMIT 1) AS metadata_publication_version,
        count(DISTINCT relevant_references.parent_kind || ':' || relevant_references.parent_id) AS parent_count
      FROM relevant_references
      INNER JOIN components
        ON components.id = relevant_references.component_id
      INNER JOIN component_revisions
        ON component_revisions.id = (
          SELECT id
          FROM component_revisions AS latest_revision
          WHERE latest_revision.component_id = components.id
          ORDER BY latest_revision.component_version DESC, latest_revision.id DESC
          LIMIT 1
        )
      WHERE relevant_references.component_id != ?
      GROUP BY
        relevant_references.component_id,
        components.version,
        component_revisions.owner_name
      ORDER BY relevant_references.component_id
    `,
    args,
  })

  return result.rows.map((row) => {
    const parsed = z
      .object({
        component_id: z.uuid(),
        component_version: z.number().int().positive().safe(),
        owner_name: z.string().trim().min(1).max(80),
        metadata_publication_version: z
          .number()
          .int()
          .positive()
          .safe(),
        parent_count: z.number().int().positive().safe(),
      })
      .strict()
      .safeParse(row)
    if (!parsed.success) throw invalidReviewState()

    return {
      componentId: parsed.data.component_id,
      ownerName: parsed.data.owner_name,
      parentCount: parsed.data.parent_count,
      expectedComponentVersion: parsed.data.component_version,
      expectedComponentMetadataPublicationVersion:
        parsed.data.metadata_publication_version,
    }
  })
}

function sourceCounts(
  sources: readonly SourceState[],
  action: ComponentPrivacyAction,
) {
  const eligible = sources.filter((source) =>
    action === "suppress"
      ? source.action !== "suppress"
      : action === "redact"
        ? source.action === "publish" || source.action === "withdraw"
        : source.action === "publish",
  )

  return {
    metadataSourceCount: eligible.filter(
      (source) => source.streamType === "component_metadata",
    ).length,
    statusSourceCount: eligible.filter(
      (source) => source.streamType === "component_status",
    ).length,
  }
}

function unavailableReason(
  target: TargetState,
  action: ComponentPrivacyAction,
  parents: readonly ComponentPrivacyParentDependency[],
  counts: ReturnType<typeof sourceCounts>,
): ComponentPrivacyUnavailableReason | null {
  if (target.metadataLastAction === "suppress") return "already_suppressed"
  if (target.metadataPublicationVersion === 0) return "no_public_history"
  if (target.metadataLastAction === "redact" && action !== "suppress") {
    return "already_redacted"
  }
  if (action === "withdraw") {
    if (!target.isCurrentlyPublic) return "no_current_projection"
    if (parents.length > 0) return "historical_dependants"
  }
  if (counts.metadataSourceCount === 0) return "no_public_history"
  return null
}

export async function readOwnerComponentPrivacyReview(
  connection: DatabaseConnection,
  componentId: string,
): Promise<OwnerComponentPrivacyReviewDto | null> {
  const target = await readTargetState(connection, componentId)
  if (!target) return null

  const sources = await readSourceStates(connection, componentId)
  const redactParents = await readComponentPrivacyParents(
    connection.client,
    componentId,
    "redact",
  )
  const suppressParents = await readComponentPrivacyParents(
    connection.client,
    componentId,
    "suppress",
  )
  const redactRelated = await readRelatedComponents(
    connection,
    componentId,
    "redact",
    redactParents,
  )
  const suppressRelated = await readRelatedComponents(
    connection,
    componentId,
    "suppress",
    suppressParents,
  )
  const withdrawCounts = sourceCounts(sources, "withdraw")
  const redactCounts = sourceCounts(sources, "redact")
  const suppressCounts = sourceCounts(sources, "suppress")

  const actionReview = (
    action: ComponentPrivacyAction,
    parents: readonly ComponentPrivacyParentDependency[],
    relatedComponents: readonly ComponentPrivacyRelatedGuard[],
    counts: ReturnType<typeof sourceCounts>,
  ): ComponentPrivacyActionReview => {
    const reason = unavailableReason(target, action, parents, counts)
    return {
      action,
      isAvailable: reason === null,
      unavailableReason: reason,
      metadataSourceCount: counts.metadataSourceCount,
      statusSourceCount: counts.statusSourceCount,
      dependentParents: parents.map(parentGuard),
      relatedComponents,
    }
  }

  return {
    target,
    withdraw: actionReview(
      "withdraw",
      redactParents,
      [],
      withdrawCounts,
    ),
    redact: actionReview(
      "redact",
      redactParents,
      redactRelated,
      redactCounts,
    ),
    suppress: actionReview(
      "suppress",
      suppressParents,
      suppressRelated,
      suppressCounts,
    ),
  }
}
