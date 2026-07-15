import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  assertValidStatusInterval,
  projectPublicStatus,
  statusConditions,
  type PublicDisposition,
  type PublicStatusTransitionCandidate,
  type StatusCondition,
} from "@/domain/status"
import {
  componentPublicSnapshotSchema,
  createStatusPublicSnapshot,
  statusPublicSnapshotSchema,
  type ComponentPublicSnapshot,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import type { StatementExecutor } from "./write-transaction"

interface PrivateStatusTransitionPublication {
  mode: "private"
}

interface PublicStatusTransitionPublication {
  mode: "public"
  publicSummary: string | null
  expectedComponentMetadataPublicationVersion: number
  expectedStatusPublicationVersion: number
}

export interface StatusTransitionWriteInput {
  componentId: string
  expectedComponentVersion: number
  condition: StatusCondition
  effectiveAt: number
  validUntil: number | null
  ownerSummary: string | null
  privateNote: string | null
  publication:
    | PrivateStatusTransitionPublication
    | PublicStatusTransitionPublication
}

export interface StatusTransitionWriteResult {
  componentId: string
  componentVersion: number
  statusTransitionId: string
  statusPublicationVersion: number
}

interface PublishedStatusSource {
  sourceRevision: number
  candidate: PublicStatusTransitionCandidate
  snapshot: StatusPublicSnapshot | null
}

function actionToDisposition(action: unknown): PublicDisposition {
  switch (action) {
    case "publish":
      return "published"
    case "withdraw":
      return "withdrawn"
    case "redact":
      return "redacted"
    case "suppress":
      return "suppressed"
    default:
      throw new CommandValidationError(
        "INVALID_PUBLICATION_STATE",
        "Stored publication state is invalid",
      )
  }
}

async function readPublishedStatusSources(
  transaction: StatementExecutor,
  componentId: string,
): Promise<PublishedStatusSource[]> {
  const result = await transaction.execute({
    sql: `
      WITH ranked AS (
        SELECT
          target_source_id,
          target_source_revision,
          action,
          target_snapshot_json,
          publication_version,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC
          ) AS rank
        FROM publication_events
        WHERE stream_type = 'component_status' AND stream_id = ?
      )
      SELECT
        ranked.target_source_revision,
        ranked.action,
        ranked.target_snapshot_json,
        status_transitions.id,
        status_transitions.condition,
        status_transitions.effective_at,
        status_transitions.valid_until,
        status_transitions.recorded_at,
        status_transitions.owner_ordinal
      FROM ranked
      INNER JOIN status_transitions
        ON status_transitions.id = ranked.target_source_id
      WHERE ranked.rank = 1
    `,
    args: [componentId],
  })

  return result.rows.map((row) => {
    const disposition = actionToDisposition(row.action)
    const condition = z.enum(statusConditions).parse(row.condition)
    const snapshot =
      disposition === "published" || disposition === "withdrawn"
        ? parseStoredJson(
            statusPublicSnapshotSchema,
            row.target_snapshot_json,
            () =>
              new CommandValidationError(
                "INVALID_PUBLIC_SNAPSHOT",
                "Stored public status snapshot is invalid",
              ),
          )
        : null

    return {
      sourceRevision: Number(row.target_source_revision),
      candidate: {
        id: String(row.id),
        condition,
        effectiveAt: Number(row.effective_at),
        validUntil:
          row.valid_until === null ? null : Number(row.valid_until),
        recordedAt: Number(row.recorded_at),
        audienceOrdinal: Number(row.owner_ordinal),
        publicDisposition: disposition,
      },
      snapshot,
    }
  })
}

export async function writeStatusTransition(
  transaction: StatementExecutor,
  input: StatusTransitionWriteInput,
  context: {
    recordedAt: number
    correlationId: string
  },
): Promise<StatusTransitionWriteResult> {
  try {
    assertValidStatusInterval(input.effectiveAt, input.validUntil)
  } catch {
    throw new CommandValidationError(
      "INVALID_STATUS_INTERVAL",
      "Status expiry must be later than its effective time",
    )
  }

  const transitionId = randomUUID()
  const publicEntryId = randomUUID()
  const publicationEventId = randomUUID()
  const componentResult = await transaction.execute({
    sql: `
      SELECT
        components.version,
        components.public_id,
        component_revisions.lifecycle
      FROM components
      INNER JOIN component_revisions
        ON component_revisions.component_id = components.id
      WHERE components.id = ?
      ORDER BY component_revisions.component_version DESC
      LIMIT 1
    `,
    args: [input.componentId],
  })
  const component = componentResult.rows[0]

  if (!component) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "The status component does not exist",
    )
  }

  if (String(component.lifecycle) !== "active") {
    throw new CommandValidationError(
      "COMPONENT_ARCHIVED",
      "An archived component cannot receive a status report",
    )
  }

  if (Number(component.version) !== input.expectedComponentVersion) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "The component changed after the report was prepared",
    )
  }

  const publicPublication =
    input.publication.mode === "public" ? input.publication : null
  const isPublic = publicPublication !== null
  let componentSnapshot: ComponentPublicSnapshot | null = null
  let currentStatusPublicationVersion = 0
  let priorSources: PublishedStatusSource[] = []

  if (publicPublication) {
    const metadataResult = await transaction.execute({
      sql: "SELECT publication_version, resulting_disposition, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [input.componentId],
    })
    const metadata = metadataResult.rows[0]

    if (!metadata || String(metadata.resulting_disposition) !== "published") {
      throw new CommandValidationError(
        "COMPONENT_NOT_PUBLIC",
        "A private component cannot publish a status report",
      )
    }

    if (
      Number(metadata.publication_version) !==
      publicPublication.expectedComponentMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "The component publication changed after the report was prepared",
      )
    }

    componentSnapshot = parseStoredJson(
      componentPublicSnapshotSchema,
      metadata.resulting_current_snapshot_json,
      () =>
        new CommandValidationError(
          "INVALID_PUBLIC_SNAPSHOT",
          "Stored public component snapshot is invalid",
        ),
    )

    const statusVersionResult = await transaction.execute({
      sql: "SELECT publication_version FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [input.componentId],
    })
    currentStatusPublicationVersion = Number(
      statusVersionResult.rows[0]?.publication_version ?? 0,
    )

    if (
      currentStatusPublicationVersion !==
      publicPublication.expectedStatusPublicationVersion
    ) {
      throw new CommandConflictError(
        "STATUS_PUBLICATION_VERSION_CONFLICT",
        "The public status changed after the report was prepared",
      )
    }

    priorSources = await readPublishedStatusSources(
      transaction,
      input.componentId,
    )
  }

  const allocation = await allocateOrdinals(
    transaction,
    isPublic ? 2 : 1,
    isPublic ? 1 : 0,
    context.recordedAt,
  )
  const transitionOwnerOrdinal = allocation.ownerOrdinal - (isPublic ? 1 : 0)
  const nextComponentVersion = input.expectedComponentVersion + 1
  const updateResult = await transaction.execute({
    sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
    args: [
      nextComponentVersion,
      context.recordedAt,
      input.componentId,
      input.expectedComponentVersion,
    ],
  })

  if (!updateResult.rows[0]) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "The component changed during the status update",
    )
  }

  await transaction.execute({
    sql: "INSERT INTO status_transitions (id, component_id, component_version, condition, owner_summary, public_summary, private_note, effective_at, valid_until, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      transitionId,
      input.componentId,
      nextComponentVersion,
      input.condition,
      input.ownerSummary,
      publicPublication?.publicSummary ?? null,
      input.privateNote,
      input.effectiveAt,
      input.validUntil,
      context.recordedAt,
      transitionOwnerOrdinal,
      publicEntryId,
      context.correlationId,
    ],
  })

  const nextStatusPublicationVersion = isPublic
    ? currentStatusPublicationVersion + 1
    : currentStatusPublicationVersion

  if (publicPublication && componentSnapshot) {
    const targetSnapshot = createStatusPublicSnapshot({
      schemaVersion: 1,
      publicEntryId,
      componentPublicId: componentSnapshot.componentPublicId,
      componentName: componentSnapshot.name,
      condition: input.condition,
      summary: publicPublication.publicSummary,
      effectiveAt: input.effectiveAt,
      validUntil: input.validUntil,
    })
    const newSource: PublishedStatusSource = {
      sourceRevision: nextComponentVersion,
      candidate: {
        id: transitionId,
        condition: input.condition,
        effectiveAt: input.effectiveAt,
        validUntil: input.validUntil,
        recordedAt: context.recordedAt,
        audienceOrdinal: transitionOwnerOrdinal,
        publicDisposition: "published",
      },
      snapshot: targetSnapshot,
    }
    const sources = [...priorSources, newSource]
    const projection = projectPublicStatus(
      sources.map((source) => source.candidate),
      context.recordedAt,
    )
    const selectedSource = sources.find(
      (source) => source.candidate.id === projection.selectedTransitionId,
    )
    const hasCurrentSnapshot =
      projection.condition !== "unknown" && selectedSource?.snapshot
    const targetSnapshotJson = JSON.stringify(targetSnapshot)
    const resultingSnapshotJson = hasCurrentSnapshot
      ? JSON.stringify(selectedSource.snapshot)
      : null

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, ?, 'publish', 'status_transition', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        publicationEventId,
        input.componentId,
        nextStatusPublicationVersion,
        transitionId,
        nextComponentVersion,
        targetSnapshotJson,
        hasCurrentSnapshot ? "published" : "closed",
        hasCurrentSnapshot ? "status_transition" : null,
        hasCurrentSnapshot ? selectedSource.candidate.id : null,
        hasCurrentSnapshot ? selectedSource.sourceRevision : null,
        resultingSnapshotJson,
        publicEntryId,
        input.effectiveAt,
        context.recordedAt,
        targetSnapshotJson,
        context.recordedAt,
        allocation.ownerOrdinal,
        allocation.publicOrdinal,
        allocation.publicPrivacyEpoch,
        context.correlationId,
      ],
    })
  }

  return {
    componentId: input.componentId,
    componentVersion: nextComponentVersion,
    statusTransitionId: transitionId,
    statusPublicationVersion: nextStatusPublicationVersion,
  }
}
