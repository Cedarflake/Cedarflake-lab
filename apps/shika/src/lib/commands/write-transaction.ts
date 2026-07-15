import type { Client, Transaction } from "@libsql/client"

import type { DatabaseConnection } from "../db/create-database"

export interface StatementExecutor {
  execute: Transaction["execute"]
}

async function rollback(
  executor: StatementExecutor,
  originalError: unknown,
) {
  try {
    await executor.execute("ROLLBACK")
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      "The command and its rollback both failed",
    )
  }
}

async function withLocalWriteTransaction<T>(
  client: Client,
  operation: (executor: StatementExecutor) => Promise<T>,
) {
  await client.execute("BEGIN IMMEDIATE")

  try {
    const result = await operation(client)
    await client.execute("COMMIT")
    return result
  } catch (error) {
    await rollback(client, error)
    throw error
  }
}

export async function withWriteTransaction<T>(
  connection: DatabaseConnection,
  operation: (transaction: StatementExecutor) => Promise<T>,
) {
  if (connection.isLocal) {
    return withLocalWriteTransaction(connection.client, operation)
  }

  const transaction = await connection.client.transaction("write")

  try {
    const result = await operation(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    await rollback(transaction, error)
    throw error
  } finally {
    transaction.close()
  }
}
