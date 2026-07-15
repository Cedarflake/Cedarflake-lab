import assert from "node:assert/strict"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { migrate } from "drizzle-orm/libsql/migrator"

import { createDatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase, migrationsFolder } from "./helpers"

async function createMigrationsFolderThrough(index: number) {
  const directory = await mkdtemp(join(tmpdir(), "shika-old-migrations-"))
  const metaDirectory = join(directory, "meta")
  await mkdir(metaDirectory)
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as {
    version: string
    dialect: string
    entries: Array<{ idx: number; tag: string }>
  }
  const entries = journal.entries.filter((entry) => entry.idx <= index)

  for (const entry of entries) {
    await copyFile(
      join(migrationsFolder, `${entry.tag}.sql`),
      join(directory, `${entry.tag}.sql`),
    )
  }
  await writeFile(
    join(metaDirectory, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    "utf8",
  )

  return directory
}

describe("database migrations", () => {
  it("builds an empty database and initializes the timeline clock", async () => {
    const connection = await createMigratedTestDatabase()

    try {
      const tables = await connection.client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      const names = tables.rows.map((row) => String(row.name))
      const clock = await connection.client.execute(
        "SELECT id, owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock",
      )

      assert.equal(names.includes("auth_account"), true)
      assert.equal(names.includes("incident_update_public_components"), true)
      assert.equal(names.includes("publication_events"), true)
      assert.equal(names.includes("timeline_clock"), true)
      assert.deepEqual(clock.rows, [
        {
          id: 1,
          owner_ordinal: 0,
          public_ordinal: 0,
          public_privacy_epoch: 0,
        },
      ])
    } finally {
      connection.client.close()
    }
  })

  it("can apply committed migrations repeatedly to one database", async () => {
    const connection = await createMigratedTestDatabase()

    try {
      await migrate(connection.db, {
        migrationsFolder,
      })

      const result = await connection.client.execute(
        "SELECT count(*) AS count FROM timeline_clock",
      )
      assert.equal(Number(result.rows[0]?.count), 1)
    } finally {
      connection.client.close()
    }
  })

  it("preserves command receipts while upgrading through the 0002 table rebuild", async () => {
    const oldMigrationsFolder = await createMigrationsFolderThrough(1)
    const connection = await createDatabaseConnection({ url: ":memory:" })
    const receipt = {
      ownerKey: "github:10",
      action: "publish-status",
      idempotencyKey: "receipt-1",
      payloadHash: "a".repeat(64),
      resultRef: "status-publication:1",
      responseBodyJson: '{"ok":true}',
      responseExpiresAt: 1_700_000_060_000,
      createdAt: 1_700_000_000_000,
    }

    try {
      await migrate(connection.db, {
        migrationsFolder: oldMigrationsFolder,
      })
      await connection.client.execute({
        sql: "INSERT INTO command_receipts (owner_key, action, idempotency_key, payload_hash, result_ref, response_body_json, response_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          receipt.ownerKey,
          receipt.action,
          receipt.idempotencyKey,
          receipt.payloadHash,
          receipt.resultRef,
          receipt.responseBodyJson,
          receipt.responseExpiresAt,
          receipt.createdAt,
        ],
      })

      await migrate(connection.db, { migrationsFolder })

      const persistedReceipt = await connection.client.execute(
        "SELECT owner_key, action, idempotency_key, payload_hash, result_ref, response_body_json, response_expires_at, created_at FROM command_receipts",
      )
      const foreignKeys = await connection.client.execute(
        "PRAGMA foreign_keys",
      )
      const foreignKeyErrors = await connection.client.execute(
        "PRAGMA foreign_key_check",
      )
      const indexes = await connection.client.execute(
        "PRAGMA index_list('command_receipts')",
      )
      const expiryIndex = indexes.rows.find(
        (row) =>
          String(row.name) === "command_receipts_response_expiry_idx",
      )
      const expiryIndexColumns = await connection.client.execute(
        "PRAGMA index_info('command_receipts_response_expiry_idx')",
      )

      assert.deepEqual(persistedReceipt.rows, [
        {
          owner_key: receipt.ownerKey,
          action: receipt.action,
          idempotency_key: receipt.idempotencyKey,
          payload_hash: receipt.payloadHash,
          result_ref: receipt.resultRef,
          response_body_json: receipt.responseBodyJson,
          response_expires_at: receipt.responseExpiresAt,
          created_at: receipt.createdAt,
        },
      ])
      assert.equal(Number(foreignKeys.rows[0]?.foreign_keys), 1)
      assert.deepEqual(foreignKeyErrors.rows, [])
      assert.notEqual(expiryIndex, undefined)
      assert.equal(Number(expiryIndex?.partial), 1)
      assert.deepEqual(
        expiryIndexColumns.rows.map((row) => String(row.name)),
        ["response_expires_at"],
      )

      await assert.rejects(
        () =>
          connection.client.execute({
            sql: "INSERT INTO command_receipts (owner_key, action, idempotency_key, payload_hash, result_ref, response_body_json, response_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            args: [
              "github:0",
              receipt.action,
              "invalid-owner",
              receipt.payloadHash,
              receipt.resultRef,
              receipt.responseBodyJson,
              receipt.responseExpiresAt,
              receipt.createdAt,
            ],
          }),
        /constraint/i,
      )
      await assert.rejects(
        () =>
          connection.client.execute({
            sql: "INSERT INTO command_receipts (owner_key, action, idempotency_key, payload_hash, result_ref, response_body_json, response_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            args: [
              receipt.ownerKey,
              receipt.action,
              receipt.idempotencyKey,
              receipt.payloadHash,
              "status-publication:duplicate",
              receipt.responseBodyJson,
              receipt.responseExpiresAt,
              receipt.createdAt,
            ],
          }),
        /constraint|unique/i,
      )
    } finally {
      connection.client.close()
      await rm(oldMigrationsFolder, { recursive: true, force: true })
    }
  })

  it("backfills legacy incident public references without breaking foreign keys", async () => {
    const oldMigrationsFolder = await createMigrationsFolderThrough(2)
    const connection = await createDatabaseConnection({ url: ":memory:" })
    const timestamp = Date.now()

    try {
      await migrate(connection.db, {
        migrationsFolder: oldMigrationsFolder,
      })
      await connection.client.batch(
        [
          {
            sql: "INSERT INTO components (id, public_id, version, created_at, updated_at) VALUES ('component-1', 'public-component-1', 1, ?, ?)",
            args: [timestamp, timestamp],
          },
          {
            sql: "INSERT INTO component_revisions (id, component_id, component_version, lifecycle, owner_name, owner_sort_order, public_name, public_sort_order, recorded_at, correlation_id) VALUES ('component-revision-1', 'component-1', 1, 'active', 'Owner component', 0, 'Public component', 0, ?, 'component-correlation-1')",
            args: [timestamp],
          },
          {
            sql: "INSERT INTO incidents (id, public_id, version, created_at, updated_at) VALUES ('incident-1', 'public-incident-1', 1, ?, ?)",
            args: [timestamp, timestamp],
          },
          {
            sql: "INSERT INTO incident_updates (id, incident_id, incident_version, kind, phase, severity, title, public_title, public_phase, public_severity, effective_at, recorded_at, owner_ordinal, public_entry_id, correlation_id) VALUES ('incident-update-1', 'incident-1', 1, 'created', 'investigating', 'minor', 'Owner title', 'Public title', 'investigating', 'minor', ?, ?, 1, 'public-entry-1', 'incident-correlation-1')",
            args: [timestamp, timestamp],
          },
          {
            sql: "INSERT INTO incident_update_components (incident_update_id, position, component_id, component_version, component_revision_id, owner_name_snapshot, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version) VALUES ('incident-update-1', 0, 'component-1', 1, 'component-revision-1', 'Owner component', 'public-component-1', 'Public component', 1)",
            args: [],
          },
        ],
        "write",
      )

      await migrate(connection.db, { migrationsFolder })

      const ownerColumns = await connection.client.execute(
        "PRAGMA table_info('incident_update_components')",
      )
      const ownerRows = await connection.client.execute(
        "SELECT * FROM incident_update_components",
      )
      const publicRows = await connection.client.execute(
        "SELECT * FROM incident_update_public_components",
      )
      const foreignKeyErrors = await connection.client.execute(
        "PRAGMA foreign_key_check",
      )

      assert.deepEqual(
        ownerColumns.rows.map((row) => String(row.name)),
        [
          "incident_update_id",
          "position",
          "component_id",
          "component_version",
          "component_revision_id",
          "owner_name_snapshot",
        ],
      )
      assert.deepEqual(ownerRows.rows, [
        {
          incident_update_id: "incident-update-1",
          position: 0,
          component_id: "component-1",
          component_version: 1,
          component_revision_id: "component-revision-1",
          owner_name_snapshot: "Owner component",
        },
      ])
      assert.deepEqual(publicRows.rows, [
        {
          incident_update_id: "incident-update-1",
          position: 0,
          component_id: "component-1",
          public_component_id_snapshot: "public-component-1",
          public_name_snapshot: "Public component",
          component_metadata_publication_version: 1,
        },
      ])
      assert.deepEqual(foreignKeyErrors.rows, [])
    } finally {
      connection.client.close()
      await rm(oldMigrationsFolder, { recursive: true, force: true })
    }
  })

  it("persists the migration ledger across file database reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shika-migrations-"))
    const databasePath = join(directory, "test.db").replaceAll("\\", "/")
    const url = `file:${databasePath}`

    try {
      const first = await createMigratedTestDatabase(url)
      await first.client.close()

      const second = await createMigratedTestDatabase(url)
      try {
        const result = await second.client.execute(
          "SELECT count(*) AS count FROM timeline_clock",
        )
        assert.equal(Number(result.rows[0]?.count), 1)
      } finally {
        await second.client.close()
      }
    } finally {
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
    }
  })
})
