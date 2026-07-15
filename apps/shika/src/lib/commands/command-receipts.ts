import type { StatementExecutor } from "./write-transaction"
import { IdempotencyConflictError } from "./errors"

export interface ReadCommandReceiptInput {
  ownerKey: string
  action: string
  idempotencyKey: string
  payloadHash: string
}

export async function readCommandReceipt(
  transaction: StatementExecutor,
  input: ReadCommandReceiptInput,
) {
  const result = await transaction.execute({
    sql: "SELECT payload_hash, result_ref FROM command_receipts WHERE owner_key = ? AND action = ? AND idempotency_key = ? LIMIT 1",
    args: [input.ownerKey, input.action, input.idempotencyKey],
  })
  const row = result.rows[0]

  if (!row) return null

  if (String(row.payload_hash) !== input.payloadHash) {
    throw new IdempotencyConflictError()
  }

  return String(row.result_ref)
}

export interface WriteCommandReceiptInput extends ReadCommandReceiptInput {
  resultRef: string
  recordedAt: number
  responseTtlMs?: number
}

export function writeCommandReceipt(
  transaction: StatementExecutor,
  input: WriteCommandReceiptInput,
) {
  const responseExpiresAt = input.responseTtlMs
    ? input.recordedAt + input.responseTtlMs
    : null

  return transaction.execute({
    sql: "INSERT INTO command_receipts (owner_key, action, idempotency_key, payload_hash, result_ref, response_body_json, response_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      input.ownerKey,
      input.action,
      input.idempotencyKey,
      input.payloadHash,
      input.resultRef,
      input.responseTtlMs ? input.resultRef : null,
      responseExpiresAt,
      input.recordedAt,
    ],
  })
}
