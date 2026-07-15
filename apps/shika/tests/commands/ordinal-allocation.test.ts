import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { allocateOrdinals } from "../../src/lib/commands/ordinal-allocation"
import { withWriteTransaction } from "../../src/lib/commands/write-transaction"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

describe("ordinal allocation", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("increments the privacy epoch once for a privacy-closing command", async () => {
    const result = await withWriteTransaction(connection, (transaction) =>
      allocateOrdinals(transaction, 2, 1, Date.now(), 1),
    )

    assert.deepEqual(result, {
      ownerOrdinal: 2,
      publicOrdinal: 1,
      publicPrivacyEpoch: 1,
    })
  })

  it("rejects invalid allocation values without changing the clock", async () => {
    await assert.rejects(
      withWriteTransaction(connection, (transaction) =>
        allocateOrdinals(transaction, -1, 0, Date.now()),
      ),
      RangeError,
    )
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
    )

    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 0,
      public_ordinal: 0,
      public_privacy_epoch: 0,
    })
  })
})
