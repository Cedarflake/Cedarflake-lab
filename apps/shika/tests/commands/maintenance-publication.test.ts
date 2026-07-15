import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import {
  closeMaintenancePublicationForOwner,
  type CloseMaintenancePublicationInput,
} from "../../src/lib/commands/maintenance-publication"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { readOwnerMaintenanceWindows } from "../../src/lib/data/owner-maintenance-repository"
import { readPublicMaintenanceWindows } from "../../src/lib/data/public-maintenance-repository"
import { readPublicTimelinePage } from "../../src/lib/data/public-timeline-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createPublicCursorCodec } from "../../src/lib/timeline/public-cursor"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

const cursorCodec = createPublicCursorCodec(
  "maintenance-publication-test-cursor-secret-001",
)

async function createPublicComponent(
  connection: DatabaseConnection,
  now: number,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "OWNER-CANARY-COMPONENT",
    ownerSummary: "OWNER-CANARY-COMPONENT-SUMMARY",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "OWNER-CANARY-COMPONENT-NOTE",
    publicName: "Public availability",
    publicSummary: null,
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "OWNER-CANARY-STATUS-SUMMARY",
      publicSummary: null,
      privateNote: "OWNER-CANARY-STATUS-NOTE",
    },
  })
}

function publicScheduleInput(
  componentId: string,
  now: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-MAINTENANCE-TITLE",
    ownerSummary: "OWNER-CANARY-MAINTENANCE-SUMMARY",
    privateNote: "OWNER-CANARY-MAINTENANCE-NOTE",
    startsAt: now + 60_000,
    endsAt: now + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion: 2,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedMaintenancePublicationVersion: 0 as const,
      title: "Public maintenance",
      summary: "Public maintenance summary",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
    },
  }
}

function publicStartInput(input: {
  maintenanceWindowId: string
  componentId: string
  now: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    operation: "start" as const,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: 1,
    effectiveAt: input.now + 1,
    ownerSummary: "OWNER-CANARY-START-SUMMARY",
    privateNote: "OWNER-CANARY-START-NOTE",
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: 3,
        expectedComponentMetadataPublicationVersion: 1,
        outcome: "unchanged" as const,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedMaintenancePublicationVersion: 1,
      summary: "Public maintenance started",
    },
  }
}

function privateNoteInput(input: {
  maintenanceWindowId: string
  componentId: string
  now: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    operation: "note" as const,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: 1,
    effectiveAt: input.now + 1,
    ownerSummary: "OWNER-CANARY-PRIVATE-NOTE-SUMMARY",
    privateNote: "OWNER-CANARY-PRIVATE-NOTE",
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: 3,
        expectedComponentMetadataPublicationVersion: null,
        outcome: "unchanged" as const,
      },
    ],
    publication: { mode: "private" as const },
  }
}

function privacyInput(input: {
  action: "redact" | "suppress"
  maintenanceWindowId: string
  maintenanceVersion: number
  publicationVersion: number
  componentId: string
  componentVersion: number
  componentPublicationVersion?: number
  idempotencyKey?: string
}): CloseMaintenancePublicationInput {
  return {
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.maintenanceVersion,
    expectedMaintenancePublicationVersion: input.publicationVersion,
    action: input.action,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: input.componentVersion,
        expectedComponentMetadataPublicationVersion:
          input.componentPublicationVersion ?? 1,
      },
    ],
  }
}

async function maintenanceTimelineEntries(connection: DatabaseConnection) {
  const page = await readPublicTimelinePage(connection, {
    limit: 100,
    cursorCodec,
  })

  assert.equal(page.kind, "page")
  return page.entries.filter(
    (entry) =>
      entry.kind === "maintenance" ||
      entry.kind === "withdrawn" ||
      entry.kind === "redacted",
  )
}

async function readMutationState(
  connection: DatabaseConnection,
  maintenanceWindowId: string,
  componentId: string,
) {
  const result = await connection.client.execute({
    sql: `
      SELECT
        (SELECT version FROM maintenance_windows WHERE id = ?) AS maintenance_version,
        (SELECT updated_at FROM maintenance_windows WHERE id = ?) AS maintenance_updated_at,
        (SELECT count(*) FROM maintenance_events WHERE maintenance_window_id = ?) AS maintenance_events,
        (SELECT count(*) FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ?) AS maintenance_publications,
        (SELECT version FROM components WHERE id = ?) AS component_version,
        (SELECT owner_ordinal FROM timeline_clock WHERE id = 1) AS owner_ordinal,
        (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal,
        (SELECT public_privacy_epoch FROM timeline_clock WHERE id = 1) AS public_privacy_epoch,
        (SELECT count(*) FROM command_receipts WHERE action = 'close_maintenance_publication') AS receipts
    `,
    args: [
      maintenanceWindowId,
      maintenanceWindowId,
      maintenanceWindowId,
      maintenanceWindowId,
      componentId,
    ],
  })

  return result.rows[0]
}

describe("maintenance publication closure", () => {
  let connection: DatabaseConnection
  let now: number
  let componentId: string
  let maintenanceWindowId: string

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
    now = Date.now()
    const component = await createPublicComponent(connection, now)
    const maintenance = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput(component.componentId, now),
    )
    componentId = component.componentId
    maintenanceWindowId = maintenance.maintenanceWindowId
  })

  afterEach(() => connection.client.close())

  it("withdraws current discovery while retaining history and a generic entry", async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      idempotencyKey,
      maintenanceWindowId,
      expectedMaintenanceVersion: 1,
      expectedMaintenancePublicationVersion: 1,
      action: "withdraw" as const,
    }
    const before = await readMutationState(
      connection,
      maintenanceWindowId,
      componentId,
    )
    const first = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      input,
    )
    const after = await readMutationState(
      connection,
      maintenanceWindowId,
      componentId,
    )
    const publicationEvents = await connection.client.execute({
      sql: "SELECT action, target_snapshot_json, resulting_disposition, timeline_entry_id, timeline_snapshot_json, public_privacy_epoch FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version",
      args: [maintenanceWindowId],
    })

    assert.deepEqual(first, {
      maintenanceWindowId,
      maintenanceVersion: 1,
      maintenancePublicationVersion: 2,
      publicPrivacyEpoch: Number(before?.public_privacy_epoch),
      componentVersions: [],
    })
    assert.equal(after?.maintenance_version, 1)
    assert.equal(after?.maintenance_events, 1)
    assert.equal(after?.component_version, before?.component_version)
    assert.equal(
      Number(after?.owner_ordinal),
      Number(before?.owner_ordinal) + 1,
    )
    assert.equal(
      Number(after?.public_ordinal),
      Number(before?.public_ordinal) + 1,
    )
    assert.equal(
      after?.public_privacy_epoch,
      before?.public_privacy_epoch,
    )
    assert.deepEqual(await readPublicMaintenanceWindows(connection), [])
    assert.deepEqual(
      (await maintenanceTimelineEntries(connection)).map(
        (entry) => entry.kind,
      ),
      ["withdrawn", "maintenance"],
    )
    assert.equal(publicationEvents.rows[1]?.action, "withdraw")
    assert.notEqual(publicationEvents.rows[1]?.target_snapshot_json, null)
    assert.equal(
      publicationEvents.rows[1]?.resulting_disposition,
      "closed",
    )
    assert.notEqual(
      publicationEvents.rows[0]?.timeline_entry_id,
      publicationEvents.rows[1]?.timeline_entry_id,
    )
    assert.equal(
      JSON.parse(
        String(publicationEvents.rows[1]?.timeline_snapshot_json),
      ).kind,
      "withdrawn",
    )

    await connection.client.execute({
      sql: "UPDATE command_receipts SET response_body_json = NULL, response_expires_at = NULL WHERE owner_key = ? AND action = 'close_maintenance_publication' AND idempotency_key = ?",
      args: [owner.ownerKey, idempotencyKey],
    })
    const replay = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      input,
    )

    assert.deepEqual(replay, first)
    assert.deepEqual(
      await readMutationState(
        connection,
        maintenanceWindowId,
        componentId,
      ),
      after,
    )
    await assert.rejects(
      closeMaintenancePublicationForOwner(connection, owner, {
        ...input,
        expectedMaintenanceVersion: 2,
      }),
      IdempotencyConflictError,
    )
  })

  it("redacts every historical source and resets stale public cursors", async () => {
    await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicStartInput({ maintenanceWindowId, componentId, now }),
    )
    const beforeClock = await connection.client.execute(
      "SELECT public_ordinal, public_privacy_epoch FROM timeline_clock WHERE id = 1",
    )
    const staleCursor = cursorCodec.encode({
      version: 1,
      asOfPublicOrdinal: Number(beforeClock.rows[0]?.public_ordinal),
      privacyEpoch: Number(beforeClock.rows[0]?.public_privacy_epoch),
      last: null,
    })
    const result = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      privacyInput({
        action: "redact",
        maintenanceWindowId,
        maintenanceVersion: 2,
        publicationVersion: 2,
        componentId,
        componentVersion: 3,
      }),
    )
    const sourceStates = await connection.client.execute({
      sql: `
        WITH ranked AS (
          SELECT
            action,
            target_source_id,
            target_snapshot_json,
            timeline_snapshot_json,
            public_privacy_epoch,
            row_number() OVER (
              PARTITION BY target_source_id
              ORDER BY publication_version DESC, id DESC
            ) AS rank
          FROM publication_events
          WHERE stream_type = 'maintenance' AND stream_id = ?
        )
        SELECT action, target_snapshot_json, timeline_snapshot_json, public_privacy_epoch
        FROM ranked
        WHERE rank = 1
      `,
      args: [maintenanceWindowId],
    })
    const stalePage = await readPublicTimelinePage(connection, {
      limit: 100,
      cursor: staleCursor,
      cursorCodec,
    })

    assert.equal(result.maintenanceVersion, 2)
    assert.equal(result.maintenancePublicationVersion, 4)
    assert.deepEqual(result.componentVersions, [
      { componentId, componentVersion: 4 },
    ])
    assert.equal(
      result.publicPrivacyEpoch,
      Number(beforeClock.rows[0]?.public_privacy_epoch) + 1,
    )
    assert.equal(sourceStates.rows.length, 2)
    assert.equal(
      sourceStates.rows.every((row) => row.action === "redact"),
      true,
    )
    assert.equal(
      sourceStates.rows.every((row) => row.target_snapshot_json !== null),
      true,
    )
    assert.equal(
      sourceStates.rows.every(
        (row) =>
          JSON.parse(String(row.timeline_snapshot_json)).kind === "redacted",
      ),
      true,
    )
    assert.deepEqual(await readPublicMaintenanceWindows(connection), [])
    assert.deepEqual(
      (await maintenanceTimelineEntries(connection)).map(
        (entry) => entry.kind,
      ),
      ["redacted", "redacted"],
    )
    assert.deepEqual(stalePage, {
      kind: "reset",
      entries: [],
      nextCursor: null,
    })

    const ownerWindows = await readOwnerMaintenanceWindows(connection, now + 2)
    assert.equal(ownerWindows[0]?.maintenanceVersion, 2)
    assert.equal(ownerWindows[0]?.events.length, 2)
  })

  it("suppresses every historical source without leaving a tombstone", async () => {
    await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicStartInput({ maintenanceWindowId, componentId, now }),
    )
    const before = await maintenanceTimelineEntries(connection)
    const result = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      privacyInput({
        action: "suppress",
        maintenanceWindowId,
        maintenanceVersion: 2,
        publicationVersion: 2,
        componentId,
        componentVersion: 3,
      }),
    )
    const sourceStates = await connection.client.execute({
      sql: `
        WITH ranked AS (
          SELECT
            action,
            target_source_id,
            target_snapshot_json,
            timeline_snapshot_json,
            resulting_disposition,
            row_number() OVER (
              PARTITION BY target_source_id
              ORDER BY publication_version DESC, id DESC
            ) AS rank
          FROM publication_events
          WHERE stream_type = 'maintenance' AND stream_id = ?
        )
        SELECT action, target_snapshot_json, timeline_snapshot_json, resulting_disposition
        FROM ranked
        WHERE rank = 1
      `,
      args: [maintenanceWindowId],
    })
    const root = await connection.client.execute({
      sql: "SELECT version, (SELECT count(*) FROM maintenance_events WHERE maintenance_window_id = ?) AS events FROM maintenance_windows WHERE id = ?",
      args: [maintenanceWindowId, maintenanceWindowId],
    })

    assert.equal(
      before.filter((entry) => entry.kind === "maintenance").length,
      2,
    )
    assert.equal(result.maintenancePublicationVersion, 4)
    assert.deepEqual(result.componentVersions, [
      { componentId, componentVersion: 4 },
    ])
    assert.equal(sourceStates.rows.length, 2)
    assert.equal(
      sourceStates.rows.every(
        (row) =>
          row.action === "suppress" &&
          row.target_snapshot_json === null &&
          row.timeline_snapshot_json === null &&
          row.resulting_disposition === "closed",
      ),
      true,
    )
    assert.deepEqual(await readPublicMaintenanceWindows(connection), [])
    assert.deepEqual(await maintenanceTimelineEntries(connection), [])
    assert.deepEqual(root.rows[0], { version: 2, events: 2 })

    const ownerWindows = await readOwnerMaintenanceWindows(connection, now + 2)
    assert.equal(ownerWindows[0]?.maintenanceVersion, 2)
    assert.equal(ownerWindows[0]?.events.length, 2)
  })

  it("removes withdrawal history on redaction and allows later suppression", async () => {
    const withdrawal = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        action: "withdraw",
      },
    )
    const redaction = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      privacyInput({
        action: "redact",
        maintenanceWindowId,
        maintenanceVersion: 1,
        publicationVersion: withdrawal.maintenancePublicationVersion,
        componentId,
        componentVersion: 3,
      }),
    )
    assert.deepEqual(
      (await maintenanceTimelineEntries(connection)).map(
        (entry) => entry.kind,
      ),
      ["redacted"],
    )

    const suppression = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      privacyInput({
        action: "suppress",
        maintenanceWindowId,
        maintenanceVersion: 1,
        publicationVersion: redaction.maintenancePublicationVersion,
        componentId,
        componentVersion: 4,
      }),
    )

    assert.equal(
      suppression.publicPrivacyEpoch,
      redaction.publicPrivacyEpoch + 1,
    )
    assert.equal(suppression.maintenancePublicationVersion, 4)
    assert.deepEqual(suppression.componentVersions, [
      { componentId, componentVersion: 5 },
    ])
    assert.deepEqual(await maintenanceTimelineEntries(connection), [])
  })

  it("rolls back stale aggregate, publication, and dependency guards", async () => {
    const before = await readMutationState(
      connection,
      maintenanceWindowId,
      componentId,
    )

    await assert.rejects(
      closeMaintenancePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        expectedMaintenancePublicationVersion: 1,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_VERSION_CONFLICT",
    )
    await assert.rejects(
      closeMaintenancePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 2,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      closeMaintenancePublicationForOwner(
        connection,
        owner,
        privacyInput({
          action: "redact",
          maintenanceWindowId,
          maintenanceVersion: 1,
          publicationVersion: 1,
          componentId,
          componentVersion: 4,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_VERSION_CONFLICT",
    )
    await assert.rejects(
      closeMaintenancePublicationForOwner(
        connection,
        owner,
        privacyInput({
          action: "redact",
          maintenanceWindowId,
          maintenanceVersion: 1,
          publicationVersion: 1,
          componentId,
          componentVersion: 3,
          componentPublicationVersion: 2,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_PUBLICATION_VERSION_CONFLICT",
    )

    assert.deepEqual(
      await readMutationState(
        connection,
        maintenanceWindowId,
        componentId,
      ),
      before,
    )
  })

  it("rejects an old root guard after a concurrent private source event", async () => {
    const preparedInput = {
      idempotencyKey: crypto.randomUUID(),
      maintenanceWindowId,
      expectedMaintenanceVersion: 1,
      expectedMaintenancePublicationVersion: 1,
      action: "withdraw" as const,
    }

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateNoteInput({ maintenanceWindowId, componentId, now }),
    )

    await assert.rejects(
      closeMaintenancePublicationForOwner(
        connection,
        owner,
        preparedInput,
      ),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_VERSION_CONFLICT",
    )

    const state = await readMutationState(
      connection,
      maintenanceWindowId,
      componentId,
    )
    assert.equal(state?.maintenance_version, 2)
    assert.equal(state?.maintenance_events, 2)
    assert.equal(state?.maintenance_publications, 1)
    assert.equal(state?.receipts, 0)
  })

  it("fails closed when the current publication snapshot is inconsistent", async () => {
    const publication = await connection.client.execute({
      sql: "SELECT resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [maintenanceWindowId],
    })
    const snapshot = JSON.parse(
      String(publication.rows[0]?.resulting_current_snapshot_json),
    ) as Record<string, unknown>

    await connection.client.execute({
      sql: "UPDATE publication_events SET resulting_current_snapshot_json = ? WHERE stream_type = 'maintenance' AND stream_id = ?",
      args: [
        JSON.stringify({ ...snapshot, title: "MISMATCHED-PUBLIC-TITLE" }),
        maintenanceWindowId,
      ],
    })
    const before = await readMutationState(
      connection,
      maintenanceWindowId,
      componentId,
    )

    await assert.rejects(
      closeMaintenancePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "INVALID_PUBLIC_SNAPSHOT",
    )
    assert.deepEqual(
      await readMutationState(
        connection,
        maintenanceWindowId,
        componentId,
      ),
      before,
    )
  })
})
