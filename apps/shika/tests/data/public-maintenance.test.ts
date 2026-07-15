import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import {
  PublicMaintenanceDataIntegrityError,
  readPublicMaintenanceWindows,
} from "../../src/lib/data/public-maintenance-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createComponent(
  connection: DatabaseConnection,
  name: string,
  now: number,
  visibility: "private" | "public" = "public",
) {
  if (visibility === "private") {
    return createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility,
      ownerName: `Secret ${name}`,
      ownerSummary: "Private component summary",
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "Private component note",
      initialStatus: null,
    })
  }

  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility,
    ownerName: `Secret ${name}`,
    ownerSummary: "Private component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    publicName: name,
    publicSummary: null,
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Private status summary",
      publicSummary: null,
      privateNote: "Private status note",
    },
  })
}

async function schedulePublic(input: {
  connection: DatabaseConnection
  componentId: string
  title: string
  startsAt: number
  endsAt: number
  effectiveAt: number
}) {
  return scheduleMaintenanceForOwner(input.connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    title: `Secret ${input.title}`,
    ownerSummary: "Private owner schedule summary",
    privateNote: "Private maintenance note",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: "Asia/Shanghai",
    effectiveAt: input.effectiveAt,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: 2,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public",
      expectedMaintenancePublicationVersion: 0,
      title: input.title,
      summary: `${input.title} public summary`,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: "Asia/Shanghai",
    },
  })
}

function publicAppend(input: {
  operation: "start" | "cancel"
  maintenanceWindowId: string
  expectedMaintenanceVersion: number
  expectedMaintenancePublicationVersion: number
  componentId: string
  effectiveAt: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    operation: input.operation,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.expectedMaintenanceVersion,
    effectiveAt: input.effectiveAt,
    ownerSummary: "Private lifecycle summary",
    privateNote: "Private lifecycle note",
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
      expectedMaintenancePublicationVersion:
        input.expectedMaintenancePublicationVersion,
      summary: `${input.operation} public summary`,
    },
  }
}

describe("public maintenance repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns in-progress windows first and scheduled windows by start time", async () => {
    const now = Date.now()
    const laterComponent = await createComponent(
      connection,
      "Later component",
      now,
    )
    const earlierComponent = await createComponent(
      connection,
      "Earlier component",
      now,
    )
    const activeComponent = await createComponent(
      connection,
      "Active component",
      now,
    )
    const later = await schedulePublic({
      connection,
      componentId: laterComponent.componentId,
      title: "Later window",
      startsAt: now + 400_000,
      endsAt: now + 500_000,
      effectiveAt: now,
    })
    const earlier = await schedulePublic({
      connection,
      componentId: earlierComponent.componentId,
      title: "Earlier window",
      startsAt: now + 200_000,
      endsAt: now + 300_000,
      effectiveAt: now,
    })
    const active = await schedulePublic({
      connection,
      componentId: activeComponent.componentId,
      title: "Active window",
      startsAt: now + 600_000,
      endsAt: now + 700_000,
      effectiveAt: now,
    })

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppend({
        operation: "start",
        maintenanceWindowId: active.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        componentId: activeComponent.componentId,
        effectiveAt: now + 1,
      }),
    )

    const windows = await readPublicMaintenanceWindows(connection)

    assert.deepEqual(
      windows.map((window) => window.maintenancePublicId),
      [
        active.maintenancePublicId,
        earlier.maintenancePublicId,
        later.maintenancePublicId,
      ],
    )
    assert.deepEqual(
      windows.map((window) => window.phase),
      ["in_progress", "scheduled", "scheduled"],
    )
  })

  it("does not expose private, withdrawn, or suppressed windows", async () => {
    const now = Date.now()
    const privateComponent = await createComponent(
      connection,
      "Private component",
      now,
      "private",
    )
    const withdrawnComponent = await createComponent(
      connection,
      "Withdrawn component",
      now,
    )
    const suppressedComponent = await createComponent(
      connection,
      "Suppressed component",
      now,
    )

    await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Private schedule",
      ownerSummary: null,
      privateNote: null,
      startsAt: now + 100_000,
      endsAt: now + 200_000,
      timezone: "Asia/Shanghai",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: privateComponent.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })
    const withdrawn = await schedulePublic({
      connection,
      componentId: withdrawnComponent.componentId,
      title: "Withdrawn window",
      startsAt: now + 100_000,
      endsAt: now + 200_000,
      effectiveAt: now,
    })
    const suppressed = await schedulePublic({
      connection,
      componentId: suppressedComponent.componentId,
      title: "Suppressed window",
      startsAt: now + 100_000,
      endsAt: now + 200_000,
      effectiveAt: now,
    })

    for (const [window, action] of [
      [withdrawn, "withdraw"],
      [suppressed, "suppress"],
    ] as const) {
      const previous = await connection.client.execute({
        sql: "SELECT target_source_id, target_source_revision, target_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
        args: [window.maintenanceWindowId],
      })
      const allocation = await connection.client.execute(
        "UPDATE timeline_clock SET owner_ordinal = owner_ordinal + 1, public_ordinal = public_ordinal + 1, public_privacy_epoch = public_privacy_epoch + ?, updated_at = ? WHERE id = 1 RETURNING owner_ordinal, public_ordinal, public_privacy_epoch",
        [action === "suppress" ? 1 : 0, now],
      )

      await connection.client.execute({
        sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'maintenance', ?, 2, ?, 'maintenance_event', ?, ?, ?, 'closed', 1, ?, ?, ?, ?, ?)",
        args: [
          crypto.randomUUID(),
          window.maintenanceWindowId,
          action,
          String(previous.rows[0]?.target_source_id),
          Number(previous.rows[0]?.target_source_revision),
          action === "suppress"
            ? null
            : String(previous.rows[0]?.target_snapshot_json),
          now,
          Number(allocation.rows[0]?.owner_ordinal),
          Number(allocation.rows[0]?.public_ordinal),
          Number(allocation.rows[0]?.public_privacy_epoch),
          crypto.randomUUID(),
        ],
      })
    }

    assert.deepEqual(await readPublicMaintenanceWindows(connection), [])
  })

  it("keeps terminal windows out of active and upcoming results", async () => {
    const now = Date.now()
    const component = await createComponent(connection, "Cancelled", now)
    const schedule = await schedulePublic({
      connection,
      componentId: component.componentId,
      title: "Cancelled window",
      startsAt: now + 100_000,
      endsAt: now + 200_000,
      effectiveAt: now,
    })

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppend({
        operation: "cancel",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        componentId: component.componentId,
        effectiveAt: now + 1,
      }),
    )

    assert.deepEqual(await readPublicMaintenanceWindows(connection), [])
  })

  it("reads only the public snapshot and fails closed when it is invalid", async () => {
    const now = Date.now()
    const component = await createComponent(connection, "Public name", now)
    const schedule = await schedulePublic({
      connection,
      componentId: component.componentId,
      title: "Public title",
      startsAt: now + 100_000,
      endsAt: now + 200_000,
      effectiveAt: now,
    })
    const before = await readPublicMaintenanceWindows(connection)

    await connection.client.execute({
      sql: "UPDATE maintenance_events SET title = ?, owner_summary = ?, private_note = ?, public_title = ? WHERE maintenance_window_id = ?",
      args: [
        "OWNER-CANARY-TITLE",
        "OWNER-CANARY-SUMMARY",
        "OWNER-CANARY-NOTE",
        "OWNER-CANARY-PUBLIC-DRAFT",
        schedule.maintenanceWindowId,
      ],
    })
    await connection.client.execute({
      sql: "UPDATE maintenance_event_components SET owner_name_snapshot = ?, public_name_snapshot = ? WHERE maintenance_event_id = ?",
      args: [
        "OWNER-CANARY-COMPONENT",
        "OWNER-CANARY-PUBLIC-CANDIDATE",
        schedule.maintenanceEventId,
      ],
    })

    const afterOwnerMutation = await readPublicMaintenanceWindows(connection)
    assert.deepEqual(afterOwnerMutation, before)
    const serialized = JSON.stringify(afterOwnerMutation)
    assert.equal(serialized.includes("OWNER-CANARY"), false)
    assert.equal(serialized.includes(component.componentId), false)

    await connection.client.execute({
      sql: "UPDATE publication_events SET resulting_current_snapshot_json = ? WHERE stream_type = 'maintenance' AND stream_id = ?",
      args: [JSON.stringify({ privateNote: "leak" }), schedule.maintenanceWindowId],
    })

    await assert.rejects(
      readPublicMaintenanceWindows(connection),
      PublicMaintenanceDataIntegrityError,
    )
  })
})
