import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  createSiteProfilePublicSnapshot,
  siteProfilePublicSnapshotSchema,
  type SiteProfilePublicSnapshot,
} from "@/lib/public/site-profile-snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { allocateOrdinals } from "./ordinal-allocation"
import {
  withWriteTransaction,
  type StatementExecutor,
} from "./write-transaction"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

export const publishSiteProfileInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: z.number().int().positive().safe(),
    expectedPublicationVersion: z.number().int().nonnegative().safe(),
    revisionId: z.uuid(),
    expectedRevisionVersion: z.number().int().positive().safe(),
  })
  .strict()

export const closeSiteProfilePublicationInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: z.number().int().positive().safe(),
    expectedPublicationVersion: z.number().int().positive().safe(),
    action: z.enum(["withdraw", "redact", "suppress"]),
  })
  .strict()

export type PublishSiteProfileInput = z.infer<
  typeof publishSiteProfileInputSchema
>
export type CloseSiteProfilePublicationInput = z.infer<
  typeof closeSiteProfilePublicationInputSchema
>

export interface PublishSiteProfileResult {
  siteProfileVersion: number
  revisionId: string
  revisionVersion: number
  publicationVersion: number
  publicPrivacyEpoch: number
}

export interface CloseSiteProfilePublicationResult {
  siteProfileVersion: number
  publicationVersion: number
  publicPrivacyEpoch: number
}

interface SiteProfileRoot {
  version: number
}

interface SiteProfileRevision {
  id: string
  version: number
  publicTitle: string | null
  publicSummary: string | null
  timezone: "Asia/Shanghai"
}

interface PublicationHead {
  version: number
  action: z.infer<typeof publicationActionSchema> | null
  targetSourceId: string | null
  targetSourceRevision: number | null
  resultingDisposition: "private" | "published" | "closed"
  resultingSourceId: string | null
  resultingSourceRevision: number | null
  resultingSnapshot: SiteProfilePublicSnapshot | null
}

interface PublishedSource {
  sourceId: string
  sourceRevision: number
  firstPublicationVersion: number
  latestAction: z.infer<typeof publicationActionSchema>
  snapshot: SiteProfilePublicSnapshot
}

interface PublicationState {
  head: PublicationHead
  sources: PublishedSource[]
}

const publishResultSchema = z
  .object({
    siteProfileVersion: z.number().int().positive().safe(),
    revisionId: z.uuid(),
    revisionVersion: z.number().int().positive().safe(),
    publicationVersion: z.number().int().positive().safe(),
    publicPrivacyEpoch: z.number().int().nonnegative().safe(),
  })
  .strict()

const closeResultSchema = z
  .object({
    siteProfileVersion: z.number().int().positive().safe(),
    publicationVersion: z.number().int().positive().safe(),
    publicPrivacyEpoch: z.number().int().nonnegative().safe(),
  })
  .strict()

const publicationRowSchema = z
  .object({
    publication_version: z.number().int().positive().safe(),
    action: publicationActionSchema,
    target_source_type: z.string(),
    target_source_id: z.string(),
    target_source_revision: z.number().int().positive().safe(),
    target_snapshot_json: z.unknown().nullable(),
    resulting_disposition: z.enum(["published", "closed"]),
    resulting_source_type: z.string().nullable(),
    resulting_source_id: z.string().nullable(),
    resulting_source_revision: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    resulting_current_snapshot_json: z.unknown().nullable(),
    timeline_entry_id: z.unknown().nullable(),
    timeline_effective_at: z.unknown().nullable(),
    timeline_recorded_at: z.unknown().nullable(),
    timeline_snapshot_json: z.unknown().nullable(),
    snapshot_schema_version: z.number().int().positive().safe(),
    source_site_profile_id: z.string().nullable(),
    source_site_profile_version: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),
    source_public_title: z.string().nullable(),
    source_public_summary: z.string().nullable(),
    source_timezone: z.string().nullable(),
  })
  .strict()

function invalidSiteProfileState() {
  return new CommandValidationError(
    "INVALID_SITE_PROFILE_STATE",
    "Stored site profile publication state is invalid",
  )
}

function invalidPublicSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public site profile data is invalid",
  )
}

function parsePublishResult(resultRef: string): PublishSiteProfileResult {
  try {
    return publishResultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored site profile publication result is invalid",
    )
  }
}

function parseCloseResult(
  resultRef: string,
): CloseSiteProfilePublicationResult {
  try {
    return closeResultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored site profile closure result is invalid",
    )
  }
}

async function readSiteProfileRoot(
  transaction: StatementExecutor,
): Promise<SiteProfileRoot> {
  const result = await transaction.execute(
    "SELECT id, version FROM site_profile WHERE id = 'site' LIMIT 1",
  )
  const row = result.rows[0]
  if (!row) {
    throw new CommandNotFoundError(
      "SITE_PROFILE_NOT_FOUND",
      "The site profile does not exist",
    )
  }

  const parsed = z
    .object({
      id: z.literal("site"),
      version: z.number().int().positive().safe(),
    })
    .strict()
    .safeParse(row)
  if (!parsed.success) throw invalidSiteProfileState()

  return { version: parsed.data.version }
}

async function readSiteProfileRevision(
  transaction: StatementExecutor,
  revisionId: string,
): Promise<SiteProfileRevision> {
  const result = await transaction.execute({
    sql: "SELECT id, site_profile_id, site_profile_version, public_title, public_summary, timezone FROM site_profile_revisions WHERE id = ? LIMIT 1",
    args: [revisionId],
  })
  const row = result.rows[0]
  if (!row) {
    throw new CommandNotFoundError(
      "SITE_PROFILE_REVISION_NOT_FOUND",
      "The selected site profile revision does not exist",
    )
  }

  const parsed = z
    .object({
      id: z.uuid(),
      site_profile_id: z.literal("site"),
      site_profile_version: z.number().int().positive().safe(),
      public_title: z.string().min(1).max(80).nullable(),
      public_summary: z.string().max(280).nullable(),
      timezone: z.literal("Asia/Shanghai"),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.public_title === null && value.public_summary !== null) {
        context.addIssue({
          code: "custom",
          path: ["public_summary"],
          message: "Public summary requires a public title",
        })
      }
    })
    .safeParse(row)
  if (!parsed.success) throw invalidSiteProfileState()

  return {
    id: parsed.data.id,
    version: parsed.data.site_profile_version,
    publicTitle: parsed.data.public_title,
    publicSummary: parsed.data.public_summary,
    timezone: parsed.data.timezone,
  }
}

function snapshotsMatch(
  left: SiteProfilePublicSnapshot,
  right: SiteProfilePublicSnapshot,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function parseEventSnapshot(value: unknown) {
  return parseStoredJson(
    siteProfilePublicSnapshotSchema,
    value,
    invalidPublicSnapshot,
  )
}

function validateNoTimeline(row: z.infer<typeof publicationRowSchema>) {
  if (
    row.timeline_entry_id !== null ||
    row.timeline_effective_at !== null ||
    row.timeline_recorded_at !== null ||
    row.timeline_snapshot_json !== null
  ) {
    throw invalidSiteProfileState()
  }
}

function parseSourceSnapshot(row: z.infer<typeof publicationRowSchema>) {
  const parsed = siteProfilePublicSnapshotSchema.safeParse({
    schemaVersion: 1,
    title: row.source_public_title,
    summary: row.source_public_summary,
    timezone: row.source_timezone,
  })
  if (!parsed.success) throw invalidPublicSnapshot()
  return parsed.data
}

function validatePublishedProjection(
  row: z.infer<typeof publicationRowSchema>,
  targetSnapshot: SiteProfilePublicSnapshot,
) {
  if (
    row.resulting_disposition !== "published" ||
    row.resulting_source_type !== "site_profile_revision" ||
    row.resulting_source_id !== row.target_source_id ||
    row.resulting_source_revision !== row.target_source_revision
  ) {
    throw invalidSiteProfileState()
  }

  const resultingSnapshot = parseEventSnapshot(
    row.resulting_current_snapshot_json,
  )
  if (!snapshotsMatch(resultingSnapshot, targetSnapshot)) {
    throw invalidPublicSnapshot()
  }
  return resultingSnapshot
}

function validateClosedProjection(
  row: z.infer<typeof publicationRowSchema>,
) {
  if (
    row.resulting_disposition !== "closed" ||
    row.resulting_source_type !== null ||
    row.resulting_source_id !== null ||
    row.resulting_source_revision !== null ||
    row.resulting_current_snapshot_json !== null
  ) {
    throw invalidSiteProfileState()
  }
}

async function readPublicationState(
  transaction: StatementExecutor,
): Promise<PublicationState> {
  const result = await transaction.execute(`
    SELECT
      publication_events.publication_version,
      publication_events.action,
      publication_events.target_source_type,
      publication_events.target_source_id,
      publication_events.target_source_revision,
      publication_events.target_snapshot_json,
      publication_events.resulting_disposition,
      publication_events.resulting_source_type,
      publication_events.resulting_source_id,
      publication_events.resulting_source_revision,
      publication_events.resulting_current_snapshot_json,
      publication_events.timeline_entry_id,
      publication_events.timeline_effective_at,
      publication_events.timeline_recorded_at,
      publication_events.timeline_snapshot_json,
      publication_events.snapshot_schema_version,
      site_profile_revisions.site_profile_id AS source_site_profile_id,
      site_profile_revisions.site_profile_version AS source_site_profile_version,
      site_profile_revisions.public_title AS source_public_title,
      site_profile_revisions.public_summary AS source_public_summary,
      site_profile_revisions.timezone AS source_timezone
    FROM publication_events
    LEFT JOIN site_profile_revisions
      ON site_profile_revisions.id = publication_events.target_source_id
    WHERE publication_events.stream_type = 'site_profile'
      AND publication_events.stream_id = 'site'
    ORDER BY publication_events.publication_version, publication_events.id
  `)
  const sources = new Map<string, PublishedSource>()
  let head: PublicationHead = {
    version: 0,
    action: null,
    targetSourceId: null,
    targetSourceRevision: null,
    resultingDisposition: "private",
    resultingSourceId: null,
    resultingSourceRevision: null,
    resultingSnapshot: null,
  }

  for (const rawRow of result.rows) {
    const parsed = publicationRowSchema.safeParse(rawRow)
    if (!parsed.success) throw invalidSiteProfileState()
    const row = parsed.data
    if (
      row.target_source_type !== "site_profile_revision" ||
      !z.uuid().safeParse(row.target_source_id).success ||
      row.source_site_profile_id !== "site" ||
      row.source_site_profile_version !== row.target_source_revision ||
      row.snapshot_schema_version !== 1
    ) {
      throw invalidSiteProfileState()
    }
    validateNoTimeline(row)

    const existing = sources.get(row.target_source_id)
    let resultingSnapshot: SiteProfilePublicSnapshot | null = null

    if (row.action === "publish") {
      const targetSnapshot = parseEventSnapshot(row.target_snapshot_json)
      const sourceSnapshot = parseSourceSnapshot(row)
      if (!snapshotsMatch(targetSnapshot, sourceSnapshot)) {
        throw invalidPublicSnapshot()
      }
      if (
        existing &&
        (existing.latestAction === "redact" ||
          existing.latestAction === "suppress")
      ) {
        throw invalidSiteProfileState()
      }
      resultingSnapshot = validatePublishedProjection(row, targetSnapshot)

      if (existing) {
        if (!snapshotsMatch(existing.snapshot, targetSnapshot)) {
          throw invalidPublicSnapshot()
        }
        existing.latestAction = "publish"
      } else {
        sources.set(row.target_source_id, {
          sourceId: row.target_source_id,
          sourceRevision: row.target_source_revision,
          firstPublicationVersion: row.publication_version,
          latestAction: "publish",
          snapshot: targetSnapshot,
        })
      }
    } else {
      validateClosedProjection(row)
      if (!existing) throw invalidSiteProfileState()

      if (row.action === "withdraw") {
        if (existing.latestAction !== "publish") {
          throw invalidSiteProfileState()
        }
      } else if (row.action === "redact") {
        if (
          existing.latestAction !== "publish" &&
          existing.latestAction !== "withdraw"
        ) {
          throw invalidSiteProfileState()
        }
      } else if (existing.latestAction === "suppress") {
        throw invalidSiteProfileState()
      }

      if (row.action === "suppress") {
        if (row.target_snapshot_json !== null) {
          throw invalidSiteProfileState()
        }
      } else {
        const targetSnapshot = parseEventSnapshot(row.target_snapshot_json)
        if (!snapshotsMatch(targetSnapshot, existing.snapshot)) {
          throw invalidPublicSnapshot()
        }
      }
      existing.latestAction = row.action
    }

    head = {
      version: row.publication_version,
      action: row.action,
      targetSourceId: row.target_source_id,
      targetSourceRevision: row.target_source_revision,
      resultingDisposition: row.resulting_disposition,
      resultingSourceId: row.resulting_source_id,
      resultingSourceRevision: row.resulting_source_revision,
      resultingSnapshot,
    }
  }

  return {
    head,
    sources: [...sources.values()].toSorted(
      (left, right) =>
        left.firstPublicationVersion - right.firstPublicationVersion ||
        left.sourceId.localeCompare(right.sourceId),
    ),
  }
}

function assertSiteProfileVersion(
  actual: number,
  expected: number,
) {
  if (actual !== expected) {
    throw new CommandConflictError(
      "SITE_PROFILE_VERSION_CONFLICT",
      "The site profile changed after the publication was prepared",
    )
  }
}

function assertPublicationVersion(actual: number, expected: number) {
  if (actual !== expected) {
    throw new CommandConflictError(
      "SITE_PROFILE_PUBLICATION_VERSION_CONFLICT",
      "The public site profile changed after the publication was prepared",
    )
  }
}

async function assertSiteProfileCas(
  transaction: StatementExecutor,
  expectedVersion: number,
) {
  const result = await transaction.execute({
    sql: "UPDATE site_profile SET version = version WHERE id = 'site' AND version = ? RETURNING version",
    args: [expectedVersion],
  })
  if (!result.rows[0]) {
    throw new CommandConflictError(
      "SITE_PROFILE_VERSION_CONFLICT",
      "The site profile changed during the publication",
    )
  }
}

function currentSourceLast(
  sources: readonly PublishedSource[],
  head: PublicationHead,
) {
  const currentSourceId = head.resultingSourceId ?? head.targetSourceId
  if (!currentSourceId) return [...sources]

  const current = sources.find(
    (source) => source.sourceId === currentSourceId,
  )
  if (!current) return [...sources]
  return [
    ...sources.filter((source) => source.sourceId !== currentSourceId),
    current,
  ]
}

function prepareClosureTargets(
  state: PublicationState,
  action: CloseSiteProfilePublicationInput["action"],
) {
  if (state.head.version === 0 || state.sources.length === 0) {
    throw new CommandValidationError(
      "SITE_PROFILE_NOT_PUBLIC",
      "A site profile without public history has nothing to close",
    )
  }

  if (action === "withdraw") {
    if (
      state.head.action !== "publish" ||
      state.head.resultingDisposition !== "published" ||
      state.head.resultingSourceId === null
    ) {
      throw new CommandValidationError(
        "PUBLICATION_NOT_LIVE",
        "Only a currently public site profile can be withdrawn",
      )
    }

    const target = state.sources.find(
      (source) =>
        source.sourceId === state.head.resultingSourceId &&
        source.latestAction === "publish",
    )
    if (!target) throw invalidSiteProfileState()
    return [target]
  }

  const candidates = state.sources.filter((source) =>
    action === "redact"
      ? source.latestAction === "publish" ||
        source.latestAction === "withdraw"
      : source.latestAction !== "suppress",
  )
  if (candidates.length === 0) {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "The public site profile history is already terminal",
    )
  }

  return currentSourceLast(candidates, state.head)
}

export async function publishSiteProfileForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<PublishSiteProfileResult> {
  const input = publishSiteProfileInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const eventId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_site_profile",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parsePublishResult(existingResultRef)

    const root = await readSiteProfileRoot(transaction)
    assertSiteProfileVersion(root.version, input.expectedSiteProfileVersion)
    const revision = await readSiteProfileRevision(
      transaction,
      input.revisionId,
    )
    if (revision.version !== input.expectedRevisionVersion) {
      throw new CommandConflictError(
        "SITE_PROFILE_REVISION_VERSION_CONFLICT",
        "The selected site profile revision changed after review",
      )
    }
    if (revision.version > root.version) throw invalidSiteProfileState()

    const state = await readPublicationState(transaction)
    assertPublicationVersion(
      state.head.version,
      input.expectedPublicationVersion,
    )
    if (revision.publicTitle === null) {
      throw new CommandValidationError(
        "PUBLIC_SITE_PROFILE_REQUIRED",
        "A public site profile draft is required before publication",
      )
    }

    const snapshot = createSiteProfilePublicSnapshot({
      schemaVersion: 1,
      title: revision.publicTitle,
      summary: revision.publicSummary,
      timezone: revision.timezone,
    })
    const priorSource = state.sources.find(
      (source) => source.sourceId === revision.id,
    )
    if (
      priorSource?.latestAction === "redact" ||
      priorSource?.latestAction === "suppress"
    ) {
      throw new CommandValidationError(
        "PUBLICATION_TERMINAL",
        "A redacted or suppressed site profile revision cannot be published",
      )
    }
    if (priorSource && !snapshotsMatch(priorSource.snapshot, snapshot)) {
      throw invalidPublicSnapshot()
    }
    if (
      state.head.resultingDisposition === "published" &&
      state.head.resultingSourceId === revision.id &&
      state.head.resultingSourceRevision === revision.version
    ) {
      throw new CommandValidationError(
        "PUBLICATION_UNCHANGED",
        "This site profile revision is already public",
      )
    }

    await assertSiteProfileCas(transaction, input.expectedSiteProfileVersion)
    const allocation = await allocateOrdinals(transaction, 1, 1, recordedAt)
    const nextPublicationVersion = state.head.version + 1
    const snapshotJson = JSON.stringify(snapshot)

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'site_profile', 'site', ?, 'publish', 'site_profile_revision', ?, ?, ?, 'published', 'site_profile_revision', ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        eventId,
        nextPublicationVersion,
        revision.id,
        revision.version,
        snapshotJson,
        revision.id,
        revision.version,
        snapshotJson,
        recordedAt,
        allocation.ownerOrdinal,
        allocation.publicOrdinal,
        allocation.publicPrivacyEpoch,
        correlationId,
      ],
    })

    const result: PublishSiteProfileResult = {
      siteProfileVersion: root.version,
      revisionId: revision.id,
      revisionVersion: revision.version,
      publicationVersion: nextPublicationVersion,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "publish_site_profile",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}

export async function closeSiteProfilePublicationForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CloseSiteProfilePublicationResult> {
  const input = closeSiteProfilePublicationInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_site_profile_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseCloseResult(existingResultRef)

    const root = await readSiteProfileRoot(transaction)
    assertSiteProfileVersion(root.version, input.expectedSiteProfileVersion)
    const state = await readPublicationState(transaction)
    assertPublicationVersion(
      state.head.version,
      input.expectedPublicationVersion,
    )
    const targets = prepareClosureTargets(state, input.action)

    await assertSiteProfileCas(transaction, input.expectedSiteProfileVersion)
    const allocation = await allocateOrdinals(
      transaction,
      targets.length,
      targets.length,
      recordedAt,
      input.action === "withdraw" ? 0 : 1,
    )
    const firstOwnerOrdinal = allocation.ownerOrdinal - targets.length + 1
    const firstPublicOrdinal = allocation.publicOrdinal - targets.length + 1

    for (const [index, source] of targets.entries()) {
      await transaction.execute({
        sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'site_profile', 'site', ?, ?, 'site_profile_revision', ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, 1, ?, ?, ?, ?, ?)",
        args: [
          randomUUID(),
          state.head.version + index + 1,
          input.action,
          source.sourceId,
          source.sourceRevision,
          input.action === "suppress"
            ? null
            : JSON.stringify(source.snapshot),
          recordedAt,
          firstOwnerOrdinal + index,
          firstPublicOrdinal + index,
          allocation.publicPrivacyEpoch,
          correlationId,
        ],
      })
    }

    const result: CloseSiteProfilePublicationResult = {
      siteProfileVersion: root.version,
      publicationVersion: state.head.version + targets.length,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_site_profile_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
