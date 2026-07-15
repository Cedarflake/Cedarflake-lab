import { z } from "zod"

import { maintenancePhases } from "@/domain/maintenance"
import {
  deriveOverallStatus,
  projectOwnerStatus,
  statusConditions,
  type PublicDisposition,
  type StatusProjection,
  type StatusTransitionCandidate,
} from "@/domain/status"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  componentPublicSnapshotSchema,
  statusPublicSnapshotSchema,
  type ComponentPublicSnapshot,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

const maintenancePhaseRowSchema = z
  .object({ phase: z.enum(maintenancePhases) })
  .strict()

const componentRowSchema = z
  .object({
    component_id: z.string().min(1),
    component_public_id: z.string().min(1),
    component_version: z.number().int().positive().safe(),
    component_created_at: z.number().int().nonnegative().safe(),
    component_updated_at: z.number().int().nonnegative().safe(),
    revision_id: z.string().min(1),
    revision_component_version: z.number().int().positive().safe(),
    lifecycle: z.enum(["active", "archived"]),
    owner_name: z.string().trim().min(1),
    owner_summary: z.string().nullable(),
    owner_sort_order: z.number().int().nonnegative().safe(),
    public_name: z.string().nullable(),
    public_summary: z.string().nullable(),
    public_sort_order: z.number().int().nonnegative().safe().nullable(),
    default_validity_ms: z.number().int().positive().safe().nullable(),
    private_note: z.string().nullable(),
    revision_recorded_at: z.number().int().nonnegative().safe(),
    metadata_publication_version: z.number().int().positive().safe().nullable(),
    metadata_publication_action: publicationActionSchema.nullable(),
    metadata_resulting_disposition: z
      .enum(["published", "closed"])
      .nullable(),
    metadata_resulting_source_type: z.string().nullable(),
    metadata_resulting_source_id: z.string().nullable(),
    metadata_resulting_source_revision: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    metadata_resulting_snapshot_json: z.string().nullable(),
    status_publication_version: z.number().int().positive().safe().nullable(),
    status_publication_action: publicationActionSchema.nullable(),
    status_resulting_disposition: z
      .enum(["published", "closed"])
      .nullable(),
    status_resulting_source_type: z.string().nullable(),
    status_resulting_source_id: z.string().nullable(),
    status_resulting_source_revision: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    status_resulting_snapshot_json: z.string().nullable(),
  })
  .superRefine((value, context) => {
    if (value.revision_component_version > value.component_version) {
      context.addIssue({
        code: "custom",
        path: ["revision_component_version"],
        message: "Component revision is ahead of its aggregate",
      })
    }

    const publicIdentityIsComplete =
      (value.public_name === null &&
        value.public_summary === null &&
        value.public_sort_order === null) ||
      (value.public_name !== null && value.public_sort_order !== null)

    if (!publicIdentityIsComplete) {
      context.addIssue({
        code: "custom",
        path: ["public_name"],
        message: "Public component identity is incomplete",
      })
    }

    for (const stream of ["metadata", "status"] as const) {
      const streamFields = [
        value[`${stream}_publication_version`],
        value[`${stream}_publication_action`],
        value[`${stream}_resulting_disposition`],
      ]
      const sourceFields = [
        value[`${stream}_resulting_source_type`],
        value[`${stream}_resulting_source_id`],
        value[`${stream}_resulting_source_revision`],
        value[`${stream}_resulting_snapshot_json`],
      ]
      const isEmpty = streamFields.every((field) => field === null)
      const isComplete = streamFields.every((field) => field !== null)

      if (!isEmpty && !isComplete) {
        context.addIssue({
          code: "custom",
          path: [`${stream}_publication_version`],
          message: "Publication stream state is incomplete",
        })
      }

      if (
        value[`${stream}_resulting_disposition`] === "published" &&
        sourceFields.some((field) => field === null)
      ) {
        context.addIssue({
          code: "custom",
          path: [`${stream}_resulting_source_id`],
          message: "Published stream source is incomplete",
        })
      }

      if (
        value[`${stream}_resulting_disposition`] !== "published" &&
        sourceFields.some((field) => field !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: [`${stream}_resulting_source_id`],
          message: "Closed stream retains a current source",
        })
      }
    }
  })

const transitionRowSchema = z
  .object({
    id: z.string().min(1),
    component_id: z.string().min(1),
    component_version: z.number().int().positive().safe(),
    condition: z.enum(statusConditions),
    owner_summary: z.string().nullable(),
    public_summary: z.string().nullable(),
    private_note: z.string().nullable(),
    effective_at: z.number().int().nonnegative().safe(),
    valid_until: z.number().int().nonnegative().safe().nullable(),
    recorded_at: z.number().int().nonnegative().safe(),
    owner_ordinal: z.number().int().positive().safe(),
    publication_version: z.number().int().positive().safe().nullable(),
    publication_action: publicationActionSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      (value.publication_version === null) !==
      (value.publication_action === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["publication_version"],
        message: "Status publication state is incomplete",
      })
    }

    if (value.valid_until !== null && value.valid_until <= value.effective_at) {
      context.addIssue({
        code: "custom",
        path: ["valid_until"],
        message: "Status interval is invalid",
      })
    }
  })

export class OwnerDataIntegrityError extends Error {
  constructor() {
    super("Owner data is invalid")
    this.name = "OwnerDataIntegrityError"
  }
}

export type PublicationAction = z.infer<typeof publicationActionSchema>

export interface OwnerPublicationStreamDto<Snapshot> {
  version: number
  lastAction: PublicationAction | null
  resultingDisposition: "private" | "published" | "closed"
  currentSource: {
    sourceId: string
    sourceRevision: number
    snapshot: Snapshot
  } | null
}

export interface OwnerStatusTransitionDto {
  transitionId: string
  componentVersion: number
  condition: (typeof statusConditions)[number]
  ownerSummary: string | null
  publicSummaryCandidate: string | null
  privateNote: string | null
  effectiveAt: number
  validUntil: number | null
  recordedAt: number
  publicationVersion: number
  publicDisposition: "private" | PublicDisposition
}

export interface OwnerComponentDto {
  componentId: string
  componentPublicId: string
  componentVersion: number
  createdAt: number
  updatedAt: number
  metadata: {
    revisionId: string
    revisionVersion: number
    recordedAt: number
    lifecycle: "active" | "archived"
    ownerName: string
    ownerSummary: string | null
    ownerSortOrder: number
    defaultValidityMs: number | null
    privateNote: string | null
    publicDraft: {
      name: string
      summary: string | null
      sortOrder: number
    } | null
  }
  publication: {
    isComponentPublic: boolean
    componentMetadata: OwnerPublicationStreamDto<ComponentPublicSnapshot>
    componentStatus: OwnerPublicationStreamDto<StatusPublicSnapshot>
  }
  status: StatusProjection
  selectedStatus: OwnerStatusTransitionDto | null
  statusHistory: readonly OwnerStatusTransitionDto[]
}

export interface OwnerDashboardDto {
  asOf: number
  overall: ReturnType<typeof deriveOverallStatus>
  components: readonly OwnerComponentDto[]
}

function parseComponentRow(row: unknown) {
  const parsed = componentRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerDataIntegrityError()
  return parsed.data
}

function parseTransitionRow(row: unknown) {
  const parsed = transitionRowSchema.safeParse(row)
  if (!parsed.success) throw new OwnerDataIntegrityError()
  return parsed.data
}

function actionToDisposition(
  action: PublicationAction | null,
): "private" | PublicDisposition {
  switch (action) {
    case null:
      return "private"
    case "publish":
      return "published"
    case "withdraw":
      return "withdrawn"
    case "redact":
      return "redacted"
    case "suppress":
      return "suppressed"
  }
}

function createStreamState<Snapshot>(input: {
  version: number | null
  action: PublicationAction | null
  disposition: "published" | "closed" | null
  sourceType: string | null
  sourceId: string | null
  sourceRevision: number | null
  snapshotJson: string | null
  expectedSourceType: string
  snapshotSchema: z.ZodType<Snapshot>
}): OwnerPublicationStreamDto<Snapshot> {
  if (
    input.version === null ||
    input.action === null ||
    input.disposition === null
  ) {
    return {
      version: 0,
      lastAction: null,
      resultingDisposition: "private",
      currentSource: null,
    }
  }

  if (input.disposition === "closed") {
    return {
      version: input.version,
      lastAction: input.action,
      resultingDisposition: "closed",
      currentSource: null,
    }
  }

  if (
    input.sourceType !== input.expectedSourceType ||
    input.sourceId === null ||
    input.sourceRevision === null ||
    input.snapshotJson === null
  ) {
    throw new OwnerDataIntegrityError()
  }

  return {
    version: input.version,
    lastAction: input.action,
    resultingDisposition: "published",
    currentSource: {
      sourceId: input.sourceId,
      sourceRevision: input.sourceRevision,
      snapshot: parseStoredJson(
        input.snapshotSchema,
        input.snapshotJson,
        () => new OwnerDataIntegrityError(),
      ),
    },
  }
}

async function readComponents(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked_revisions AS (
      SELECT
        component_revisions.*,
        row_number() OVER (
          PARTITION BY component_id
          ORDER BY component_version DESC, id DESC
        ) AS rank
      FROM component_revisions
    ),
    latest_revisions AS (
      SELECT * FROM ranked_revisions WHERE rank = 1
    ),
    ranked_publications AS (
      SELECT
        stream_type,
        stream_id,
        publication_version,
        action,
        resulting_disposition,
        resulting_source_type,
        resulting_source_id,
        resulting_source_revision,
        resulting_current_snapshot_json,
        row_number() OVER (
          PARTITION BY stream_type, stream_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type IN ('component_metadata', 'component_status')
    ),
    latest_metadata AS (
      SELECT *
      FROM ranked_publications
      WHERE rank = 1 AND stream_type = 'component_metadata'
    ),
    latest_status AS (
      SELECT *
      FROM ranked_publications
      WHERE rank = 1 AND stream_type = 'component_status'
    )
    SELECT
      components.id AS component_id,
      components.public_id AS component_public_id,
      components.version AS component_version,
      components.created_at AS component_created_at,
      components.updated_at AS component_updated_at,
      latest_revisions.id AS revision_id,
      latest_revisions.component_version AS revision_component_version,
      latest_revisions.lifecycle,
      latest_revisions.owner_name,
      latest_revisions.owner_summary,
      latest_revisions.owner_sort_order,
      latest_revisions.public_name,
      latest_revisions.public_summary,
      latest_revisions.public_sort_order,
      latest_revisions.default_validity_ms,
      latest_revisions.private_note,
      latest_revisions.recorded_at AS revision_recorded_at,
      latest_metadata.publication_version AS metadata_publication_version,
      latest_metadata.action AS metadata_publication_action,
      latest_metadata.resulting_disposition AS metadata_resulting_disposition,
      latest_metadata.resulting_source_type AS metadata_resulting_source_type,
      latest_metadata.resulting_source_id AS metadata_resulting_source_id,
      latest_metadata.resulting_source_revision AS metadata_resulting_source_revision,
      latest_metadata.resulting_current_snapshot_json AS metadata_resulting_snapshot_json,
      latest_status.publication_version AS status_publication_version,
      latest_status.action AS status_publication_action,
      latest_status.resulting_disposition AS status_resulting_disposition,
      latest_status.resulting_source_type AS status_resulting_source_type,
      latest_status.resulting_source_id AS status_resulting_source_id,
      latest_status.resulting_source_revision AS status_resulting_source_revision,
      latest_status.resulting_current_snapshot_json AS status_resulting_snapshot_json
    FROM components
    LEFT JOIN latest_revisions
      ON latest_revisions.component_id = components.id
    LEFT JOIN latest_metadata
      ON latest_metadata.stream_id = components.id
    LEFT JOIN latest_status
      ON latest_status.stream_id = components.id
  `)
}

async function readTransitions(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked_publications AS (
      SELECT
        stream_id,
        target_source_id,
        publication_version,
        action,
        row_number() OVER (
          PARTITION BY stream_id, target_source_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'component_status'
    )
    SELECT
      status_transitions.id,
      status_transitions.component_id,
      status_transitions.component_version,
      status_transitions.condition,
      status_transitions.owner_summary,
      status_transitions.public_summary,
      status_transitions.private_note,
      status_transitions.effective_at,
      status_transitions.valid_until,
      status_transitions.recorded_at,
      status_transitions.owner_ordinal,
      ranked_publications.publication_version,
      ranked_publications.action AS publication_action
    FROM status_transitions
    LEFT JOIN ranked_publications
      ON ranked_publications.stream_id = status_transitions.component_id
      AND ranked_publications.target_source_id = status_transitions.id
      AND ranked_publications.rank = 1
    ORDER BY
      status_transitions.effective_at DESC,
      status_transitions.recorded_at DESC,
      status_transitions.owner_ordinal DESC,
      status_transitions.id DESC
  `)
}

async function readHasActiveMaintenance(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    WITH ranked_events AS (
      SELECT
        phase,
        row_number() OVER (
          PARTITION BY maintenance_window_id
          ORDER BY maintenance_version DESC, id DESC
        ) AS rank
      FROM maintenance_events
    )
    SELECT phase
    FROM ranked_events
    WHERE rank = 1
  `)

  return result.rows.some((row) => {
    const parsed = maintenancePhaseRowSchema.safeParse(row)
    if (!parsed.success) throw new OwnerDataIntegrityError()
    return parsed.data.phase === "in_progress"
  })
}

export async function readOwnerDashboard(
  connection: DatabaseConnection,
  now: number,
): Promise<OwnerDashboardDto> {
  const [componentResult, transitionResult, hasActiveMaintenance] =
    await Promise.all([
      readComponents(connection),
      readTransitions(connection),
      readHasActiveMaintenance(connection),
    ])
  const transitionRows = transitionResult.rows.map(parseTransitionRow)
  const activeProjections: StatusProjection[] = []
  const components = componentResult.rows
    .map(parseComponentRow)
    .map<OwnerComponentDto>((component) => {
      const transitionRecords = transitionRows
        .filter((transition) => transition.component_id === component.component_id)
        .map((transition) => ({
          candidate: {
            id: transition.id,
            condition: transition.condition,
            effectiveAt: transition.effective_at,
            validUntil: transition.valid_until,
            recordedAt: transition.recorded_at,
            audienceOrdinal: transition.owner_ordinal,
          } satisfies StatusTransitionCandidate,
          dto: {
            transitionId: transition.id,
            componentVersion: transition.component_version,
            condition: transition.condition,
            ownerSummary: transition.owner_summary,
            publicSummaryCandidate: transition.public_summary,
            privateNote: transition.private_note,
            effectiveAt: transition.effective_at,
            validUntil: transition.valid_until,
            recordedAt: transition.recorded_at,
            publicationVersion: transition.publication_version ?? 0,
            publicDisposition: actionToDisposition(
              transition.publication_action,
            ),
          } satisfies OwnerStatusTransitionDto,
        }))
      const status = projectOwnerStatus(
        transitionRecords.map((record) => record.candidate),
        now,
      )
      const selectedStatus =
        transitionRecords.find(
          (record) => record.candidate.id === status.selectedTransitionId,
        )?.dto ?? null
      const statusHistory = transitionRecords.map((record) => record.dto)

      if (component.lifecycle === "active") activeProjections.push(status)

      const metadataPublication = createStreamState({
        version: component.metadata_publication_version,
        action: component.metadata_publication_action,
        disposition: component.metadata_resulting_disposition,
        sourceType: component.metadata_resulting_source_type,
        sourceId: component.metadata_resulting_source_id,
        sourceRevision: component.metadata_resulting_source_revision,
        snapshotJson: component.metadata_resulting_snapshot_json,
        expectedSourceType: "component_revision",
        snapshotSchema: componentPublicSnapshotSchema,
      })

      return {
        componentId: component.component_id,
        componentPublicId: component.component_public_id,
        componentVersion: component.component_version,
        createdAt: component.component_created_at,
        updatedAt: component.component_updated_at,
        metadata: {
          revisionId: component.revision_id,
          revisionVersion: component.revision_component_version,
          recordedAt: component.revision_recorded_at,
          lifecycle: component.lifecycle,
          ownerName: component.owner_name,
          ownerSummary: component.owner_summary,
          ownerSortOrder: component.owner_sort_order,
          defaultValidityMs: component.default_validity_ms,
          privateNote: component.private_note,
          publicDraft:
            component.public_name === null ||
            component.public_sort_order === null
              ? null
              : {
                  name: component.public_name,
                  summary: component.public_summary,
                  sortOrder: component.public_sort_order,
                },
        },
        publication: {
          isComponentPublic:
            metadataPublication.resultingDisposition === "published",
          componentMetadata: metadataPublication,
          componentStatus: createStreamState({
            version: component.status_publication_version,
            action: component.status_publication_action,
            disposition: component.status_resulting_disposition,
            sourceType: component.status_resulting_source_type,
            sourceId: component.status_resulting_source_id,
            sourceRevision: component.status_resulting_source_revision,
            snapshotJson: component.status_resulting_snapshot_json,
            expectedSourceType: "status_transition",
            snapshotSchema: statusPublicSnapshotSchema,
          }),
        },
        status,
        selectedStatus,
        statusHistory,
      }
    })
    .toSorted(
      (left, right) =>
        left.metadata.ownerSortOrder - right.metadata.ownerSortOrder ||
        left.componentId.localeCompare(right.componentId),
    )

  return {
    asOf: now,
    overall: deriveOverallStatus(activeProjections, hasActiveMaintenance),
    components,
  }
}
