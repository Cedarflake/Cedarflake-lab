import type { StatementExecutor } from "./write-transaction"

export interface OrdinalAllocation {
  ownerOrdinal: number
  publicOrdinal: number
  publicPrivacyEpoch: number
}

export async function allocateOrdinals(
  transaction: StatementExecutor,
  ownerCount: number,
  publicCount: number,
  recordedAt: number,
  privacyEpochDelta = 0,
): Promise<OrdinalAllocation> {
  if (
    !Number.isSafeInteger(ownerCount) ||
    ownerCount < 0 ||
    !Number.isSafeInteger(publicCount) ||
    publicCount < 0 ||
    !Number.isSafeInteger(privacyEpochDelta) ||
    privacyEpochDelta < 0 ||
    !Number.isSafeInteger(recordedAt) ||
    recordedAt < 0
  ) {
    throw new RangeError("Timeline allocation values must be nonnegative safe integers")
  }

  const result = await transaction.execute({
    sql: "UPDATE timeline_clock SET owner_ordinal = owner_ordinal + ?, public_ordinal = public_ordinal + ?, public_privacy_epoch = public_privacy_epoch + ?, updated_at = ? WHERE id = 1 RETURNING owner_ordinal, public_ordinal, public_privacy_epoch",
    args: [ownerCount, publicCount, privacyEpochDelta, recordedAt],
  })
  const row = result.rows[0]

  if (!row) {
    throw new Error("Timeline clock is not initialized")
  }

  return {
    ownerOrdinal: Number(row.owner_ordinal),
    publicOrdinal: Number(row.public_ordinal),
    publicPrivacyEpoch: Number(row.public_privacy_epoch),
  }
}
