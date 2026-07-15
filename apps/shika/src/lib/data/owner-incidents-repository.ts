import { z } from "zod"

import {
  assertIncidentPhaseCommand,
  incidentPhases,
  incidentSeverities,
  type IncidentPhase,
  type IncidentSeverity,
} from "@/domain/incidents"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  incidentPublicSnapshotSchema,
  type IncidentPublicSnapshot,
} from "@/lib/public/incident-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

const incidentRootRowSchema = z
  .object({
    id: z.string().min(1),
    public_id: z.string().min(1),
    version: z.number().int().positive().safe(),
    created_at: z.number().int().nonnegative().safe(),
    updated_at: z.number().int().nonnegative().safe(),
  })
  .strict()

const incidentUpdateKinds = [
  "created",
  "note",
  "phase",
  "metadata",
  "resolved",
  "reopened",
] as const

const incidentUpdateRowSchema = z
  .object({
    id: z.string().min(1),
    incident_id: z.string().min(1),
    incident_version: z.number().int().positive().safe(),
    kind: z.enum(incidentUpdateKinds),
    phase: z.enum(incidentPhases),
    severity: z.enum(incidentSeverities),
    title: z.string().min(1),
    owner_summary: z.string().nullable(),
    private_note: z.string().nullable(),
    reason: z.string().nullable(),
    public_title: z.string().nullable(),
    public_phase: z.enum(incidentPhases).nullable(),
    public_severity: z.enum(incidentSeverities).nullable(),
    public_summary: z.string().nullable(),
    effective_at: z.number().int().nonnegative().safe(),
    recorded_at: z.number().int().nonnegative().safe(),
    owner_ordinal: z.number().int().positive().safe(),
    public_entry_id: z.string().min(1),
    correlation_id: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const publicFields = [
      value.public_title,
      value.public_phase,
      value.public_severity,
    ]
    const isPrivate = publicFields.every((field) => field === null)
    const isPublic = publicFields.every((field) => field !== null)

    if (!isPrivate && !isPublic) {
      context.addIssue({
        code: "custom",
        path: ["public_title"],
        message: "Public incident candidate is incomplete",
      })
    }

    if (isPrivate && value.public_summary !== null) {
      context.addIssue({
        code: "custom",
        path: ["public_summary"],
        message: "A private incident update cannot contain public copy",
      })
    }

    if (value.kind === "resolved" && value.phase !== "resolved") {
      context.addIssue({
        code: "custom",
        path: ["phase"],
        message: "Resolved update has an invalid phase",
      })
    }

    if (value.kind === "reopened" && value.phase !== "investigating") {
      context.addIssue({
        code: "custom",
        path: ["phase"],
        message: "Reopened update has an invalid phase",
      })
    }
  })

const incidentReferenceRowSchema = z
  .object({
    incident_update_id: z.string().min(1),
    position: z.number().int().nonnegative().safe(),
    component_id: z.string().min(1),
    component_version: z.number().int().positive().safe(),
    component_revision_id: z.string().min(1),
    owner_name_snapshot: z.string().min(1),
  })
  .strict()

const incidentPublicReferenceRowSchema = z
  .object({
    incident_update_id: z.string().min(1),
    position: z.number().int().nonnegative().safe(),
    component_id: z.string().min(1),
    public_component_id_snapshot: z.string().min(1),
    public_name_snapshot: z.string().min(1),
    component_metadata_publication_version: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

const publicationRowSchema = z
  .object({
    stream_id: z.string().min(1),
    publication_version: z.number().int().positive().safe(),
    action: z.enum(["publish", "withdraw", "redact", "suppress"]),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_id: z.string().min(1).nullable(),
    resulting_source_revision: z.number().int().positive().safe().nullable(),
    resulting_current_snapshot_json: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const currentFields = [
      value.resulting_source_id,
      value.resulting_source_revision,
      value.resulting_current_snapshot_json,
    ]
    const hasNoCurrentSource = currentFields.every((field) => field === null)
    const hasCurrentSource = currentFields.every((field) => field !== null)
    const isPublished =
      value.action === "publish" && value.resulting_disposition === "published"
    const isClosed =
      value.action !== "publish" && value.resulting_disposition === "closed"

    if (
      (!isPublished && !isClosed) ||
      (isPublished && !hasCurrentSource) ||
      (isClosed && !hasNoCurrentSource)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resulting_source_id"],
        message: "Current incident publication state is inconsistent",
      })
    }
  })

export class OwnerIncidentDataIntegrityError extends Error {
  constructor() {
    super("Owner incident data is invalid")
    this.name = "OwnerIncidentDataIntegrityError"
  }
}

export interface OwnerIncidentReferenceDto {
  position: number
  componentId: string
  componentVersion: number
  componentRevisionId: string
  ownerName: string
}

export interface OwnerIncidentPublicReferenceDto {
  position: number
  componentId: string
  componentPublicId: string
  name: string
  componentMetadataPublicationVersion: number
}

export interface OwnerIncidentUpdateDto {
  updateId: string
  incidentVersion: number
  kind: (typeof incidentUpdateKinds)[number]
  phase: IncidentPhase
  severity: IncidentSeverity
  title: string
  ownerSummary: string | null
  privateNote: string | null
  reason: string | null
  publicCandidate: {
    title: string
    phase: IncidentPhase
    severity: IncidentSeverity
    summary: string | null
  } | null
  effectiveAt: number
  recordedAt: number
  ownerOrdinal: number
  publicEntryId: string
  correlationId: string
  affectedComponents: readonly OwnerIncidentReferenceDto[]
  publicAffectedComponents: readonly OwnerIncidentPublicReferenceDto[]
}

export interface OwnerIncidentDto {
  incidentId: string
  incidentPublicId: string
  version: number
  createdAt: number
  updatedAt: number
  latestPhase: IncidentPhase
  latestSeverity: IncidentSeverity
  latestTitle: string
  publication: {
    version: number
    lastAction: "publish" | "withdraw" | "redact" | "suppress" | null
    resultingDisposition: "private" | "published" | "closed"
    sourceUpdateId: string | null
    currentSnapshot: IncidentPublicSnapshot | null
  }
  updates: readonly OwnerIncidentUpdateDto[]
}

function parseRow<Output>(schema: z.ZodType<Output>, row: unknown) {
  const parsed = schema.safeParse(row)
  if (!parsed.success) throw new OwnerIncidentDataIntegrityError()
  return parsed.data
}

async function readRoots(connection: DatabaseConnection) {
  return connection.client.execute(
    "SELECT id, public_id, version, created_at, updated_at FROM incidents",
  )
}

async function readUpdates(connection: DatabaseConnection) {
  return connection.client.execute(`
    SELECT
      id,
      incident_id,
      incident_version,
      kind,
      phase,
      severity,
      title,
      owner_summary,
      private_note,
      reason,
      public_title,
      public_phase,
      public_severity,
      public_summary,
      effective_at,
      recorded_at,
      owner_ordinal,
      public_entry_id,
      correlation_id
    FROM incident_updates
    ORDER BY incident_id, incident_version, id
  `)
}

async function readReferences(connection: DatabaseConnection) {
  return connection.client.execute(`
    SELECT
      incident_update_id,
      position,
      component_id,
      component_version,
      component_revision_id,
      owner_name_snapshot
    FROM incident_update_components
    ORDER BY incident_update_id, position, component_id
  `)
}

async function readPublicReferences(connection: DatabaseConnection) {
  return connection.client.execute(`
    SELECT
      incident_update_id,
      position,
      component_id,
      public_component_id_snapshot,
      public_name_snapshot,
      component_metadata_publication_version
    FROM incident_update_public_components
    ORDER BY incident_update_id, position, component_id
  `)
}

async function readLatestPublicationStates(connection: DatabaseConnection) {
  return connection.client.execute(`
    WITH ranked AS (
      SELECT
        stream_id,
        publication_version,
        action,
        resulting_disposition,
        resulting_source_id,
        resulting_source_revision,
        resulting_current_snapshot_json,
        row_number() OVER (
          PARTITION BY stream_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'incident'
    )
    SELECT
      stream_id,
      publication_version,
      action,
      resulting_disposition,
      resulting_source_id,
      resulting_source_revision,
      resulting_current_snapshot_json
    FROM ranked
    WHERE rank = 1
  `)
}

function assertUpdateSequence(
  updates: readonly z.infer<typeof incidentUpdateRowSchema>[],
) {
  for (const [index, update] of updates.entries()) {
    if (update.incident_version !== index + 1) {
      throw new OwnerIncidentDataIntegrityError()
    }

    if (index === 0) {
      if (update.kind !== "created" || update.phase === "resolved") {
        throw new OwnerIncidentDataIntegrityError()
      }
      continue
    }

    const previous = updates[index - 1]
    if (!previous) throw new OwnerIncidentDataIntegrityError()

    try {
      switch (update.kind) {
        case "note":
        case "metadata":
          if (update.phase !== previous.phase) {
            throw new OwnerIncidentDataIntegrityError()
          }
          break
        case "phase":
          assertIncidentPhaseCommand({
            from: previous.phase,
            to: update.phase,
            operation: "phase_update",
            reason: update.reason ?? "",
          })
          break
        case "resolved":
          assertIncidentPhaseCommand({
            from: previous.phase,
            to: update.phase,
            operation: "resolve",
            reason: update.reason ?? "",
          })
          break
        case "reopened":
          assertIncidentPhaseCommand({
            from: previous.phase,
            to: update.phase,
            operation: "reopen",
            reason: update.reason ?? "",
          })
          break
        case "created":
          throw new OwnerIncidentDataIntegrityError()
      }
    } catch {
      throw new OwnerIncidentDataIntegrityError()
    }
  }
}

function mapPublicationState(
  root: z.infer<typeof incidentRootRowSchema>,
  updates: readonly OwnerIncidentUpdateDto[],
  publication: z.infer<typeof publicationRowSchema> | undefined,
): OwnerIncidentDto["publication"] {
  if (!publication) {
    return {
      version: 0,
      lastAction: null,
      resultingDisposition: "private",
      sourceUpdateId: null,
      currentSnapshot: null,
    }
  }

  if (publication.resulting_disposition === "closed") {
    return {
      version: publication.publication_version,
      lastAction: publication.action,
      resultingDisposition: "closed",
      sourceUpdateId: null,
      currentSnapshot: null,
    }
  }

  const sourceUpdateId = publication.resulting_source_id
  const sourceRevision = publication.resulting_source_revision
  const snapshotJson = publication.resulting_current_snapshot_json
  if (
    sourceUpdateId === null ||
    sourceRevision === null ||
    snapshotJson === null
  ) {
    throw new OwnerIncidentDataIntegrityError()
  }

  const source = updates.find(
    (update) =>
      update.updateId === sourceUpdateId &&
      update.incidentVersion === sourceRevision,
  )
  if (!source?.publicCandidate) {
    throw new OwnerIncidentDataIntegrityError()
  }

  const currentSnapshot = parseStoredJson(
    incidentPublicSnapshotSchema,
    snapshotJson,
    () => new OwnerIncidentDataIntegrityError(),
  )
  const expectedSnapshot: IncidentPublicSnapshot = {
    schemaVersion: 1,
    incidentPublicId: root.public_id,
    publicEntryId: source.publicEntryId,
    title: source.publicCandidate.title,
    phase: source.publicCandidate.phase,
    severity: source.publicCandidate.severity,
    summary: source.publicCandidate.summary,
    affectedComponents: source.publicAffectedComponents.map((component) => ({
      componentPublicId: component.componentPublicId,
      name: component.name,
      position: component.position,
    })),
    effectiveAt: source.effectiveAt,
  }

  if (JSON.stringify(currentSnapshot) !== JSON.stringify(expectedSnapshot)) {
    throw new OwnerIncidentDataIntegrityError()
  }

  return {
    version: publication.publication_version,
    lastAction: publication.action,
    resultingDisposition: "published",
    sourceUpdateId,
    currentSnapshot,
  }
}

export async function readOwnerIncidents(
  connection: DatabaseConnection,
): Promise<readonly OwnerIncidentDto[]> {
  const [
    rootResult,
    updateResult,
    referenceResult,
    publicReferenceResult,
    publicationResult,
  ] = await Promise.all([
    readRoots(connection),
    readUpdates(connection),
    readReferences(connection),
    readPublicReferences(connection),
    readLatestPublicationStates(connection),
  ])
  const roots = rootResult.rows.map((row) =>
    parseRow(incidentRootRowSchema, row),
  )
  const updates = updateResult.rows.map((row) =>
    parseRow(incidentUpdateRowSchema, row),
  )
  const references = referenceResult.rows.map((row) =>
    parseRow(incidentReferenceRowSchema, row),
  )
  const publicReferences = publicReferenceResult.rows.map((row) =>
    parseRow(incidentPublicReferenceRowSchema, row),
  )
  const publicationByIncidentId = new Map(
    publicationResult.rows.map((row) => {
      const publication = parseRow(publicationRowSchema, row)
      return [publication.stream_id, publication] as const
    }),
  )

  return roots
    .map<OwnerIncidentDto>((root) => {
      const incidentUpdates = updates.filter(
        (update) => update.incident_id === root.id,
      )
      assertUpdateSequence(incidentUpdates)

      const latest = incidentUpdates.at(-1)
      if (!latest || latest.incident_version !== root.version) {
        throw new OwnerIncidentDataIntegrityError()
      }

      const mappedUpdates = incidentUpdates.map<OwnerIncidentUpdateDto>(
        (update) => {
          const updateReferences = references.filter(
            (reference) => reference.incident_update_id === update.id,
          )
          if (updateReferences.length === 0) {
            throw new OwnerIncidentDataIntegrityError()
          }
          const updatePublicReferences = publicReferences.filter(
            (reference) => reference.incident_update_id === update.id,
          )

          const publicCandidate =
            update.public_title !== null &&
            update.public_phase !== null &&
            update.public_severity !== null
              ? {
                  title: update.public_title,
                  phase: update.public_phase,
                  severity: update.public_severity,
                  summary: update.public_summary,
                }
              : null
          if (
            (publicCandidate === null && updatePublicReferences.length > 0) ||
            (publicCandidate !== null && updatePublicReferences.length === 0)
          ) {
            throw new OwnerIncidentDataIntegrityError()
          }

          const mappedReferences =
            updateReferences.map<OwnerIncidentReferenceDto>((reference) => ({
              position: reference.position,
              componentId: reference.component_id,
              componentVersion: reference.component_version,
              componentRevisionId: reference.component_revision_id,
              ownerName: reference.owner_name_snapshot,
            }))
          const mappedPublicReferences =
            updatePublicReferences.map<OwnerIncidentPublicReferenceDto>(
              (reference) => ({
                position: reference.position,
                componentId: reference.component_id,
                componentPublicId: reference.public_component_id_snapshot,
                name: reference.public_name_snapshot,
                componentMetadataPublicationVersion:
                  reference.component_metadata_publication_version,
              }),
            )

          return {
            updateId: update.id,
            incidentVersion: update.incident_version,
            kind: update.kind,
            phase: update.phase,
            severity: update.severity,
            title: update.title,
            ownerSummary: update.owner_summary,
            privateNote: update.private_note,
            reason: update.reason,
            publicCandidate,
            effectiveAt: update.effective_at,
            recordedAt: update.recorded_at,
            ownerOrdinal: update.owner_ordinal,
            publicEntryId: update.public_entry_id,
            correlationId: update.correlation_id,
            affectedComponents: mappedReferences,
            publicAffectedComponents: mappedPublicReferences,
          }
        },
      )
      const publication = publicationByIncidentId.get(root.id)

      return {
        incidentId: root.id,
        incidentPublicId: root.public_id,
        version: root.version,
        createdAt: root.created_at,
        updatedAt: root.updated_at,
        latestPhase: latest.phase,
        latestSeverity: latest.severity,
        latestTitle: latest.title,
        publication: mapPublicationState(root, mappedUpdates, publication),
        updates: mappedUpdates,
      }
    })
    .toSorted(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        right.incidentId.localeCompare(left.incidentId),
    )
}
