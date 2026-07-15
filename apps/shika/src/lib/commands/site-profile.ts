import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import { withWriteTransaction } from "./write-transaction"

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)

const publicDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    summary: nullableText(280),
  })
  .strict()

export const saveSiteProfileInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    expectedSiteProfileVersion: z.number().int().nonnegative().safe(),
    ownerTitle: z.string().trim().min(1).max(80),
    ownerSummary: nullableText(280),
    publicDraft: publicDraftSchema.nullable().default(null),
    timezone: z.literal("Asia/Shanghai"),
    privateNote: nullableText(2_000),
  })
  .strict()

export type SaveSiteProfileInput = z.infer<
  typeof saveSiteProfileInputSchema
>

export interface SaveSiteProfileResult {
  siteProfileVersion: number
  revisionId: string
  revisionVersion: number
}

const saveResultSchema = z
  .object({
    siteProfileVersion: z.number().int().positive().safe(),
    revisionId: z.uuid(),
    revisionVersion: z.number().int().positive().safe(),
  })
  .strict()

function invalidSiteProfileState() {
  return new CommandValidationError(
    "INVALID_SITE_PROFILE_STATE",
    "Stored site profile data is invalid",
  )
}

function parseResult(resultRef: string): SaveSiteProfileResult {
  try {
    return saveResultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored site profile command result is invalid",
    )
  }
}

export async function saveSiteProfileForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<SaveSiteProfileResult> {
  const input = saveSiteProfileInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const revisionId = randomUUID()
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "save_site_profile",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseResult(existingResultRef)

    const rootResult = await transaction.execute(
      "SELECT id, version FROM site_profile WHERE id = 'site' LIMIT 1",
    )
    const rootRow = rootResult.rows[0]
    let nextVersion: number

    if (input.expectedSiteProfileVersion === 0) {
      if (rootRow) {
        throw new CommandConflictError(
          "SITE_PROFILE_VERSION_CONFLICT",
          "The site profile was initialized after this draft was prepared",
        )
      }

      nextVersion = 1
      await transaction.execute({
        sql: "INSERT INTO site_profile (id, version, created_at, updated_at) VALUES ('site', 1, ?, ?)",
        args: [recordedAt, recordedAt],
      })
    } else {
      if (!rootRow) {
        throw new CommandNotFoundError(
          "SITE_PROFILE_NOT_FOUND",
          "The site profile does not exist",
        )
      }

      const root = z
        .object({
          id: z.literal("site"),
          version: z.number().int().positive().safe(),
        })
        .strict()
        .safeParse(rootRow)
      if (!root.success) throw invalidSiteProfileState()
      if (root.data.version !== input.expectedSiteProfileVersion) {
        throw new CommandConflictError(
          "SITE_PROFILE_VERSION_CONFLICT",
          "The site profile changed after this draft was prepared",
        )
      }

      nextVersion = input.expectedSiteProfileVersion + 1
      const updateResult = await transaction.execute({
        sql: "UPDATE site_profile SET version = ?, updated_at = ? WHERE id = 'site' AND version = ? RETURNING version",
        args: [
          nextVersion,
          recordedAt,
          input.expectedSiteProfileVersion,
        ],
      })
      if (!updateResult.rows[0]) {
        throw new CommandConflictError(
          "SITE_PROFILE_VERSION_CONFLICT",
          "The site profile changed during the update",
        )
      }
    }

    await transaction.execute({
      sql: "INSERT INTO site_profile_revisions (id, site_profile_id, site_profile_version, owner_title, owner_summary, public_title, public_summary, timezone, private_note, recorded_at, correlation_id) VALUES (?, 'site', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        revisionId,
        nextVersion,
        input.ownerTitle,
        input.ownerSummary,
        input.publicDraft?.title ?? null,
        input.publicDraft?.summary ?? null,
        input.timezone,
        input.privateNote,
        recordedAt,
        correlationId,
      ],
    })

    const result: SaveSiteProfileResult = {
      siteProfileVersion: nextVersion,
      revisionId,
      revisionVersion: nextVersion,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "save_site_profile",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
    })

    return result
  })
}
