import { randomUUID } from "node:crypto"

import { z } from "zod"

import { assertValidStatusInterval, statusConditions } from "@/domain/status"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  createComponentPublicSnapshot,
  createStatusPublicSnapshot,
} from "@/lib/public/snapshots"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import { CommandValidationError } from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import { withWriteTransaction } from "./write-transaction"

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)

const timestampSchema = z.number().int().nonnegative().safe()

const initialStatusSchema = z
  .object({
    condition: z.enum(statusConditions),
    effectiveAt: timestampSchema,
    validUntil: timestampSchema.nullable().default(null),
    ownerSummary: nullableText(280),
    publicSummary: nullableText(280),
    privateNote: nullableText(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertValidStatusInterval(value.effectiveAt, value.validUntil)
    } catch {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "validUntil must be later than effectiveAt",
      })
    }
  })

const baseComponentSchema = z.object({
  idempotencyKey: z.uuid(),
  ownerName: z.string().trim().min(1).max(80),
  ownerSummary: nullableText(280),
  ownerSortOrder: z.number().int().nonnegative().safe(),
  defaultValidityMs: z.number().int().positive().safe().nullable().default(null),
  privateNote: nullableText(2_000),
})

const createPrivateComponentSchema = baseComponentSchema
  .extend({
    visibility: z.literal("private"),
    initialStatus: initialStatusSchema.nullable().default(null),
  })
  .strict()

const createPublicComponentSchema = baseComponentSchema
  .extend({
    visibility: z.literal("public"),
    publicName: z.string().trim().min(1).max(80),
    publicSummary: nullableText(280),
    publicSortOrder: z.number().int().nonnegative().safe(),
    initialStatus: initialStatusSchema,
  })
  .strict()

export const createComponentInputSchema = z.discriminatedUnion("visibility", [
  createPrivateComponentSchema,
  createPublicComponentSchema,
])

export type CreateComponentInput = z.infer<typeof createComponentInputSchema>

export interface CreateComponentResult {
  componentId: string
  componentPublicId: string
  componentVersion: number
  componentMetadataPublicationVersion: number
  componentStatusPublicationVersion: number
}

function parseReceiptResult(resultRef: string): CreateComponentResult {
  const parsed = z
    .object({
      componentId: z.string().min(1),
      componentPublicId: z.string().min(1),
      componentVersion: z.number().int().positive(),
      componentMetadataPublicationVersion: z.number().int().nonnegative(),
      componentStatusPublicationVersion: z.number().int().nonnegative(),
    })
    .parse(JSON.parse(resultRef))

  return parsed
}

export async function createComponentForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CreateComponentResult> {
  const input = createComponentInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const componentId = randomUUID()
  const componentPublicId = randomUUID()
  const componentRevisionId = randomUUID()
  const statusTransitionId = input.initialStatus ? randomUUID() : null
  const statusPublicEntryId = input.initialStatus ? randomUUID() : null
  const correlationId = randomUUID()
  const metadataPublicationEventId =
    input.visibility === "public" ? randomUUID() : null
  const statusPublicationEventId =
    input.visibility === "public" ? randomUUID() : null
  const recordedAt = Date.now()

  if (
    input.visibility === "public" &&
    (input.initialStatus.effectiveAt > recordedAt ||
      (input.initialStatus.validUntil !== null &&
        input.initialStatus.validUntil <= recordedAt))
  ) {
    throw new CommandValidationError(
      "PUBLIC_STARTING_STATUS_NOT_CURRENT",
      "A public component requires a starting status that is current now",
    )
  }

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "create_component",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseReceiptResult(existingResultRef)

    const isPublic = input.visibility === "public"
    const finalVersion = input.initialStatus ? 2 : 1
    const ownerOrdinalCount = input.initialStatus ? (isPublic ? 3 : 1) : 0
    const publicOrdinalCount = isPublic ? 2 : 0
    const allocation =
      ownerOrdinalCount > 0 || publicOrdinalCount > 0
        ? await allocateOrdinals(
            transaction,
            ownerOrdinalCount,
            publicOrdinalCount,
            recordedAt,
          )
        : { ownerOrdinal: 0, publicOrdinal: 0, publicPrivacyEpoch: 0 }
    const firstOwnerOrdinal = allocation.ownerOrdinal - ownerOrdinalCount + 1
    const firstPublicOrdinal = allocation.publicOrdinal - publicOrdinalCount + 1

    await transaction.execute({
      sql: "INSERT INTO components (id, public_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [
        componentId,
        componentPublicId,
        finalVersion,
        recordedAt,
        recordedAt,
      ],
    })
    await transaction.execute({
      sql: "INSERT INTO component_revisions (id, component_id, component_version, lifecycle, owner_name, owner_summary, owner_sort_order, public_name, public_summary, public_sort_order, default_validity_ms, private_note, recorded_at, correlation_id) VALUES (?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        componentRevisionId,
        componentId,
        input.ownerName,
        input.ownerSummary,
        input.ownerSortOrder,
        isPublic ? input.publicName : null,
        isPublic ? input.publicSummary : null,
        isPublic ? input.publicSortOrder : null,
        input.defaultValidityMs,
        input.privateNote,
        recordedAt,
        correlationId,
      ],
    })

    if (input.initialStatus && statusTransitionId && statusPublicEntryId) {
      await transaction.execute({
        sql: "INSERT INTO status_transitions (id, component_id, component_version, condition, owner_summary, public_summary, private_note, effective_at, valid_until, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          statusTransitionId,
          componentId,
          input.initialStatus.condition,
          input.initialStatus.ownerSummary,
          isPublic ? input.initialStatus.publicSummary : null,
          input.initialStatus.privateNote,
          input.initialStatus.effectiveAt,
          input.initialStatus.validUntil,
          recordedAt,
          firstOwnerOrdinal,
          statusPublicEntryId,
          correlationId,
        ],
      })
    }

    if (
      isPublic &&
      input.initialStatus &&
      statusTransitionId &&
      statusPublicEntryId &&
      metadataPublicationEventId &&
      statusPublicationEventId
    ) {
      const componentSnapshot = createComponentPublicSnapshot({
        schemaVersion: 1,
        componentPublicId,
        name: input.publicName,
        summary: input.publicSummary,
        sortOrder: input.publicSortOrder,
      })
      const statusSnapshot = createStatusPublicSnapshot({
        schemaVersion: 1,
        publicEntryId: statusPublicEntryId,
        componentPublicId,
        componentName: input.publicName,
        condition: input.initialStatus.condition,
        summary: input.initialStatus.publicSummary,
        effectiveAt: input.initialStatus.effectiveAt,
        validUntil: input.initialStatus.validUntil,
      })
      const componentSnapshotJson = JSON.stringify(componentSnapshot)
      const statusSnapshotJson = JSON.stringify(statusSnapshot)

      await transaction.execute({
        sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_metadata', ?, 1, 'publish', 'component_revision', ?, 1, ?, 'published', 'component_revision', ?, 1, ?, 1, ?, ?, ?, ?, ?)",
        args: [
          metadataPublicationEventId,
          componentId,
          componentRevisionId,
          componentSnapshotJson,
          componentRevisionId,
          componentSnapshotJson,
          recordedAt,
          firstOwnerOrdinal + 1,
          firstPublicOrdinal,
          allocation.publicPrivacyEpoch,
          correlationId,
        ],
      })
      await transaction.execute({
        sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, 1, 'publish', 'status_transition', ?, 2, ?, 'published', 'status_transition', ?, 2, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
        args: [
          statusPublicationEventId,
          componentId,
          statusTransitionId,
          statusSnapshotJson,
          statusTransitionId,
          statusSnapshotJson,
          statusPublicEntryId,
          input.initialStatus.effectiveAt,
          recordedAt,
          statusSnapshotJson,
          recordedAt,
          firstOwnerOrdinal + 2,
          firstPublicOrdinal + 1,
          allocation.publicPrivacyEpoch,
          correlationId,
        ],
      })
    }

    const result: CreateComponentResult = {
      componentId,
      componentPublicId,
      componentVersion: finalVersion,
      componentMetadataPublicationVersion: isPublic ? 1 : 0,
      componentStatusPublicationVersion: isPublic ? 1 : 0,
    }
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "create_component",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
