import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  assertValidStatusInterval,
  statusConditions,
} from "@/domain/status"
import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"

import { hashCommandPayload } from "./canonical-payload"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import { writeStatusTransition } from "./status-transition-write"
import { withWriteTransaction } from "./write-transaction"

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)

const timestampSchema = z.number().int().nonnegative().safe()

const statusFields = {
  idempotencyKey: z.uuid(),
  componentId: z.string().uuid(),
  expectedComponentVersion: z.number().int().positive().safe(),
  condition: z.enum(statusConditions),
  effectiveAt: timestampSchema,
  validUntil: timestampSchema.nullable().default(null),
  ownerSummary: nullableText(280),
  privateNote: nullableText(2_000),
}

const privateStatusInputSchema = z
  .object({
    ...statusFields,
    publication: z.object({ mode: z.literal("private") }).strict(),
  })
  .strict()

const publicStatusInputSchema = z
  .object({
    ...statusFields,
    publication: z
      .object({
        mode: z.literal("public"),
        publicSummary: nullableText(280),
        expectedComponentMetadataPublicationVersion: z
          .number()
          .int()
          .positive()
          .safe(),
        expectedStatusPublicationVersion: z
          .number()
          .int()
          .nonnegative()
          .safe(),
      })
      .strict(),
  })
  .strict()

export const reportStatusInputSchema = z
  .union([privateStatusInputSchema, publicStatusInputSchema])
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

export type ReportStatusInput = z.infer<typeof reportStatusInputSchema>

export interface ReportStatusResult {
  componentId: string
  componentVersion: number
  statusTransitionId: string
  statusPublicationVersion: number
}

function parseResult(resultRef: string): ReportStatusResult {
  return z
    .object({
      componentId: z.string().uuid(),
      componentVersion: z.number().int().positive(),
      statusTransitionId: z.string().uuid(),
      statusPublicationVersion: z.number().int().nonnegative(),
    })
    .parse(JSON.parse(resultRef))
}

export async function reportStatusForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<ReportStatusResult> {
  const input = reportStatusInputSchema.parse(rawInput)
  const payloadHash = hashCommandPayload(input)
  const correlationId = randomUUID()
  const recordedAt = Date.now()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "report_status",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })

    if (existingResultRef) return parseResult(existingResultRef)

    const result = await writeStatusTransition(transaction, input, {
      recordedAt,
      correlationId,
    })
    const resultRef = JSON.stringify(result)

    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "report_status",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef,
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
