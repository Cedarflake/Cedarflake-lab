import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  projectPublicStatus,
  statusConditions,
  type PublicDisposition,
  type PublicStatusTransitionCandidate,
} from "@/domain/status"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  statusPublicSnapshotSchema,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"
import {
  createRedactedTimelineSnapshot,
  createWithdrawnTimelineSnapshot,
} from "@/lib/public/timeline-snapshots"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import { withWriteTransaction, type StatementExecutor } from "./write-transaction"

export const closeStatusPublicationInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    componentId: z.uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    statusTransitionId: z.uuid(),
    expectedStatusPublicationVersion: z.number().int().positive().safe(),
    action: z.enum(["withdraw", "redact", "suppress"]),
  })
  .strict()

export type CloseStatusPublicationInput = z.infer<
  typeof closeStatusPublicationInputSchema
>

export interface CloseStatusPublicationResult {
  componentId: string
  componentVersion: number
  statusTransitionId: string
  statusPublicationVersion: number
  publicPrivacyEpoch: number
}

interface PublishedStatusSource {
  sourceRevision: number
  publicEntryId: string
  recordedAt: number
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

function parseResult(resultRef: string): CloseStatusPublicationResult {
  return z
    .object({
      componentId: z.string().uuid(),
      componentVersion: z.number().int().positive(),
      statusTransitionId: z.string().uuid(),
      statusPublicationVersion: z.number().int().positive(),
      publicPrivacyEpoch: z.number().int().nonnegative(),
    })
    .parse(JSON.parse(resultRef) as unknown)
}

function invalidSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public status snapshot is invalid",
  )
}

async function readPublishedStatusSources(
  transaction: StatementExecutor,
  componentId: string,
): Promise<PublishedStatusSource[]> {
  const result = await transaction.execute({
    sql: `
      WITH ranked AS (
        SELECT
          stream_id,
          target_source_id,
          target_source_revision,
          action,
          target_snapshot_json,
          publication_version,
          row_number() OVER (
            PARTITION BY target_source_id
            ORDER BY publication_version DESC, id DESC
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
        status_transitions.owner_ordinal,
        status_transitions.public_entry_id
      FROM ranked
      INNER JOIN status_transitions
        ON status_transitions.id = ranked.target_source_id
      WHERE ranked.rank = 1
    `,
    args: [componentId],
  })

  return result.rows.map((row) => {
    const disposition = actionToDisposition(row.action)
    const snapshot =
      disposition === "published" || disposition === "withdrawn"
        ? parseStoredJson(
            statusPublicSnapshotSchema,
            row.target_snapshot_json,
            invalidSnapshot,
          )
        : null

    return {
      sourceRevision: Number(row.target_source_revision),
      publicEntryId: String(row.public_entry_id),
      recordedAt: Number(row.recorded_at),
      candidate: {
        id: String(row.id),
        condition: z.enum(statusConditions).parse(row.condition),
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

function assertClosureAllowed(
  current: PublicDisposition,
  action: CloseStatusPublicationInput["action"],
) {
  if (current === "suppressed") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A suppressed status report cannot change publication state",
    )
  }

  if (current === "redacted" && action !== "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A redacted status report can only be suppressed",
    )
  }

  if (action === "withdraw" && current !== "published") {
    throw new CommandValidationError(
      "PUBLICATION_NOT_LIVE",
      "Only a published status report can be withdrawn",
    )
  }
}

export async function closeStatusPublicationForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CloseStatusPublicationResult> {
  const input = closeStatusPublicationInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const publicationEventId = randomUUID()
  const withdrawalEntryId = input.action === "withdraw" ? randomUUID() : null
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_status_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseResult(existingResultRef)

    const componentResult = await transaction.execute({
      sql: "SELECT version FROM components WHERE id = ?",
      args: [input.componentId],
    })
    const component = componentResult.rows[0]

    if (!component) {
      throw new CommandNotFoundError(
        "COMPONENT_NOT_FOUND",
        "The status component does not exist",
      )
    }

    if (Number(component.version) !== input.expectedComponentVersion) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "The component changed after the publication action was prepared",
      )
    }

    const streamResult = await transaction.execute({
      sql: "SELECT publication_version FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [input.componentId],
    })
    const currentPublicationVersion = Number(
      streamResult.rows[0]?.publication_version ?? 0,
    )

    if (
      currentPublicationVersion !== input.expectedStatusPublicationVersion
    ) {
      throw new CommandConflictError(
        "STATUS_PUBLICATION_VERSION_CONFLICT",
        "The status publication changed after the action was prepared",
      )
    }

    const sources = await readPublishedStatusSources(
      transaction,
      input.componentId,
    )
    const target = sources.find(
      (source) => source.candidate.id === input.statusTransitionId,
    )

    if (!target) {
      throw new CommandNotFoundError(
        "STATUS_PUBLICATION_NOT_FOUND",
        "The published status report does not exist",
      )
    }

    assertClosureAllowed(target.candidate.publicDisposition, input.action)

    const targetSnapshotResult = await transaction.execute({
      sql: "SELECT target_snapshot_json FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? AND target_source_id = ? AND target_snapshot_json IS NOT NULL ORDER BY publication_version DESC LIMIT 1",
      args: [input.componentId, input.statusTransitionId],
    })
    const targetSnapshot = parseStoredJson(
      statusPublicSnapshotSchema,
      targetSnapshotResult.rows[0]?.target_snapshot_json,
      invalidSnapshot,
    )
    const nextDisposition: PublicDisposition =
      input.action === "withdraw"
        ? "withdrawn"
        : input.action === "redact"
          ? "redacted"
          : "suppressed"
    const updatedSources = sources.map((source) =>
      source.candidate.id === input.statusTransitionId
        ? {
            ...source,
            candidate: {
              ...source.candidate,
              publicDisposition: nextDisposition,
            },
            snapshot: null,
          }
        : source,
    )
    const projection = projectPublicStatus(
      updatedSources.map((source) => source.candidate),
      recordedAt,
    )
    const selected = updatedSources.find(
      (source) => source.candidate.id === projection.selectedTransitionId,
    )
    const hasCurrentSnapshot =
      projection.condition !== "unknown" && selected?.snapshot !== null
    const nextComponentVersion = input.expectedComponentVersion + 1
    const nextPublicationVersion = currentPublicationVersion + 1
    const updateResult = await transaction.execute({
      sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [
        nextComponentVersion,
        recordedAt,
        input.componentId,
        input.expectedComponentVersion,
      ],
    })

    if (!updateResult.rows[0]) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "The component changed during the publication action",
      )
    }

    const allocation = await allocateOrdinals(
      transaction,
      1,
      1,
      recordedAt,
      input.action === "redact" || input.action === "suppress" ? 1 : 0,
    )
    const timelineEntryId = withdrawalEntryId ?? target.publicEntryId
    const timelineEffectiveAt =
      input.action === "withdraw"
        ? recordedAt
        : target.candidate.effectiveAt
    const timelineRecordedAt =
      input.action === "withdraw" ? recordedAt : target.recordedAt
    const timelineSnapshot =
      input.action === "withdraw" && withdrawalEntryId
        ? createWithdrawnTimelineSnapshot({
            schemaVersion: 1,
            kind: "withdrawn",
            publicEntryId: withdrawalEntryId,
          })
        : input.action === "redact"
          ? createRedactedTimelineSnapshot({
              schemaVersion: 1,
              kind: "redacted",
              publicEntryId: target.publicEntryId,
            })
          : null

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, ?, ?, 'status_transition', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        publicationEventId,
        input.componentId,
        nextPublicationVersion,
        input.action,
        input.statusTransitionId,
        target.sourceRevision,
        input.action === "suppress" ? null : JSON.stringify(targetSnapshot),
        hasCurrentSnapshot ? "published" : "closed",
        hasCurrentSnapshot ? "status_transition" : null,
        hasCurrentSnapshot ? selected?.candidate.id ?? null : null,
        hasCurrentSnapshot ? selected?.sourceRevision ?? null : null,
        hasCurrentSnapshot ? JSON.stringify(selected?.snapshot) : null,
        timelineEntryId,
        timelineEffectiveAt,
        timelineRecordedAt,
        timelineSnapshot === null ? null : JSON.stringify(timelineSnapshot),
        recordedAt,
        allocation.ownerOrdinal,
        allocation.publicOrdinal,
        allocation.publicPrivacyEpoch,
        correlationId,
      ],
    })

    const result: CloseStatusPublicationResult = {
      componentId: input.componentId,
      componentVersion: nextComponentVersion,
      statusTransitionId: input.statusTransitionId,
      statusPublicationVersion: nextPublicationVersion,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
    }

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_status_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
