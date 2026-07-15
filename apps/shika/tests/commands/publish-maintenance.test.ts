import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import { scheduleMaintenanceForOwner } from "../../src/lib/commands/maintenance"
import { closeMaintenancePublicationForOwner } from "../../src/lib/commands/maintenance-publication"
import { publishMaintenanceForOwner } from "../../src/lib/commands/publish-maintenance"
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
  "publish-maintenance-test-cursor-secret-0001",
)

async function createPublicComponent(
  connection: DatabaseConnection,
  now: number,
  name = "Public availability",
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: `OWNER-CANARY-${name}`,
    ownerSummary: "OWNER-CANARY-COMPONENT-SUMMARY",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "OWNER-CANARY-COMPONENT-NOTE",
    publicName: name,
    publicSummary: null,
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "OWNER-CANARY-STATUS-SUMMARY",
      publicSummary: "Public status summary",
      privateNote: "OWNER-CANARY-STATUS-NOTE",
    },
  })
}

function privateScheduleInput(input: {
  componentId: string
  componentVersion: number
  now: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-MAINTENANCE-TITLE",
    ownerSummary: "OWNER-CANARY-MAINTENANCE-SUMMARY",
    privateNote: "OWNER-CANARY-MAINTENANCE-NOTE",
    startsAt: input.now + 60_000,
    endsAt: input.now + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt: input.now,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: input.componentVersion,
      },
    ],
    publication: { mode: "private" as const },
  }
}

function publishInput(input: {
  maintenanceWindowId: string
  maintenanceVersion: number
  publicationVersion: number
  componentId: string
  componentVersion: number
  now: number
  effectiveAt?: number
  idempotencyKey?: string
}) {
  return {
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.maintenanceVersion,
    expectedMaintenancePublicationVersion: input.publicationVersion,
    effectiveAt: input.effectiveAt ?? input.now + 1,
    publicTitle: "Public planned rest",
    publicSummary: "Responses may pause briefly",
    publicStartsAt: input.now + 60_000,
    publicEndsAt: input.now + 120_000,
    publicTimezone: "Asia/Shanghai",
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: input.componentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
  }
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
        (SELECT count(*) FROM maintenance_events WHERE maintenance_window_id = ?) AS maintenance_events,
        (SELECT count(*) FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ?) AS maintenance_publications,
        (SELECT version FROM components WHERE id = ?) AS component_version,
        (SELECT owner_ordinal FROM timeline_clock WHERE id = 1) AS owner_ordinal,
        (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal,
        (SELECT public_privacy_epoch FROM timeline_clock WHERE id = 1) AS public_privacy_epoch,
        (SELECT count(*) FROM command_receipts WHERE action = 'publish_maintenance') AS receipts
    `,
    args: [
      maintenanceWindowId,
      maintenanceWindowId,
      maintenanceWindowId,
      componentId,
    ],
  })

  return result.rows[0]
}

describe("explicit maintenance publication", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("publishes only a new reviewed snapshot and permanently replays it", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const idempotencyKey = crypto.randomUUID()
    const input = publishInput({
      maintenanceWindowId: scheduled.maintenanceWindowId,
      maintenanceVersion: 1,
      publicationVersion: 0,
      componentId: component.componentId,
      componentVersion: component.componentVersion,
      now,
      idempotencyKey,
    })
    const before = await readMutationState(
      connection,
      scheduled.maintenanceWindowId,
      component.componentId,
    )
    const first = await publishMaintenanceForOwner(connection, owner, input)
    const after = await readMutationState(
      connection,
      scheduled.maintenanceWindowId,
      component.componentId,
    )
    const events = await connection.client.execute({
      sql: "SELECT maintenance_version, kind, owner_summary, private_note, public_title, public_summary FROM maintenance_events WHERE maintenance_window_id = ? ORDER BY maintenance_version",
      args: [scheduled.maintenanceWindowId],
    })
    const publications = await connection.client.execute({
      sql: "SELECT publication_version, action, target_source_id, target_source_revision, target_snapshot_json, resulting_current_snapshot_json, timeline_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version",
      args: [scheduled.maintenanceWindowId],
    })
    const publicWindows = await readPublicMaintenanceWindows(connection)
    const timeline = await readPublicTimelinePage(connection, {
      limit: 100,
      cursorCodec,
    })
    assert.equal(timeline.kind, "page")
    const publicBytes = JSON.stringify({ publicWindows, timeline })

    assert.equal(first.maintenanceVersion, 2)
    assert.equal(first.maintenancePublicationVersion, 1)
    assert.equal(first.maintenanceEventId, publications.rows[0]?.target_source_id)
    assert.deepEqual(first.componentVersions, [
      {
        componentId: component.componentId,
        componentVersion: component.componentVersion + 1,
      },
    ])
    assert.equal(Number(after?.maintenance_version), 2)
    assert.equal(Number(after?.maintenance_events), 2)
    assert.equal(Number(after?.maintenance_publications), 1)
    assert.equal(
      Number(after?.component_version),
      Number(before?.component_version) + 1,
    )
    assert.equal(Number(after?.owner_ordinal), Number(before?.owner_ordinal) + 2)
    assert.equal(Number(after?.public_ordinal), Number(before?.public_ordinal) + 1)
    assert.equal(after?.public_privacy_epoch, before?.public_privacy_epoch)
    assert.equal(Number(after?.receipts), 1)
    assert.deepEqual(
      events.rows.map((event) => ({
        version: event.maintenance_version,
        kind: event.kind,
        publicTitle: event.public_title,
      })),
      [
        { version: 1, kind: "scheduled", publicTitle: null },
        { version: 2, kind: "metadata", publicTitle: "Public planned rest" },
      ],
    )
    assert.equal(events.rows[0]?.private_note, "OWNER-CANARY-MAINTENANCE-NOTE")
    assert.equal(events.rows[1]?.private_note, null)
    assert.equal(publications.rows[0]?.publication_version, 1)
    assert.equal(publications.rows[0]?.action, "publish")
    assert.equal(publications.rows[0]?.target_source_revision, 2)
    assert.equal(
      publications.rows[0]?.target_snapshot_json,
      publications.rows[0]?.resulting_current_snapshot_json,
    )
    assert.equal(
      publications.rows[0]?.target_snapshot_json,
      publications.rows[0]?.timeline_snapshot_json,
    )
    assert.equal(publicWindows[0]?.title, "Public planned rest")
    assert.equal(publicWindows[0]?.latestKind, "scheduled")
    assert.equal(
      timeline.entries.filter((entry) => entry.kind === "maintenance").length,
      1,
    )
    assert.equal(publicBytes.includes("OWNER-CANARY-MAINTENANCE-TITLE"), false)
    assert.equal(publicBytes.includes("OWNER-CANARY-MAINTENANCE-NOTE"), false)
    assert.equal(publicBytes.includes("OWNER-CANARY-COMPONENT"), false)

    await connection.client.execute({
      sql: "UPDATE command_receipts SET response_body_json = NULL, response_expires_at = NULL WHERE owner_key = ? AND action = 'publish_maintenance' AND idempotency_key = ?",
      args: [owner.ownerKey, idempotencyKey],
    })
    const replay = await publishMaintenanceForOwner(connection, owner, input)
    assert.deepEqual(replay, first)
    assert.deepEqual(
      await readMutationState(
        connection,
        scheduled.maintenanceWindowId,
        component.componentId,
      ),
      after,
    )
    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...input,
        publicTitle: "Changed retry",
      }),
      IdempotencyConflictError,
    )
    await assert.rejects(
      publishMaintenanceForOwner(
        connection,
        owner,
        publishInput({
          maintenanceWindowId: scheduled.maintenanceWindowId,
          maintenanceVersion: 2,
          publicationVersion: 1,
          componentId: component.componentId,
          componentVersion: component.componentVersion + 1,
          now,
          effectiveAt: now + 3,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "MAINTENANCE_ALREADY_PUBLIC",
    )
  })

  it("rolls back stale aggregate, publication, component, and reference guards", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const otherComponent = await createPublicComponent(
      connection,
      now,
      "Public creative work",
    )
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const validInput = publishInput({
      maintenanceWindowId: scheduled.maintenanceWindowId,
      maintenanceVersion: 1,
      publicationVersion: 0,
      componentId: component.componentId,
      componentVersion: component.componentVersion,
      now,
    })
    const before = await readMutationState(
      connection,
      scheduled.maintenanceWindowId,
      component.componentId,
    )

    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...validInput,
        expectedMaintenanceVersion: 2,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...validInput,
        expectedMaintenancePublicationVersion: 1,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...validInput,
        affectedComponents: [
          {
            ...validInput.affectedComponents[0],
            expectedComponentVersion: component.componentVersion + 1,
          },
        ],
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...validInput,
        affectedComponents: [
          {
            ...validInput.affectedComponents[0],
            expectedComponentMetadataPublicationVersion: 2,
          },
        ],
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishMaintenanceForOwner(connection, owner, {
        ...validInput,
        affectedComponents: [
          {
            componentId: otherComponent.componentId,
            expectedComponentVersion: otherComponent.componentVersion,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_REFERENCE_SET_CONFLICT",
    )
    for (const tamperedSchedule of [
      { publicStartsAt: validInput.publicStartsAt + 1 },
      { publicEndsAt: validInput.publicEndsAt + 1 },
      { publicTimezone: "UTC" },
    ]) {
      await assert.rejects(
        publishMaintenanceForOwner(connection, owner, {
          ...validInput,
          ...tamperedSchedule,
        }),
        (error: unknown) =>
          error instanceof CommandValidationError &&
          error.code === "MAINTENANCE_SCHEDULE_MISMATCH",
      )
    }

    assert.deepEqual(
      await readMutationState(
        connection,
        scheduled.maintenanceWindowId,
        component.componentId,
      ),
      before,
    )
  })

  it("republishes a withdrawn window without sweeping private history", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const firstPublication = await publishMaintenanceForOwner(
      connection,
      owner,
      publishInput({
        maintenanceWindowId: scheduled.maintenanceWindowId,
        maintenanceVersion: 1,
        publicationVersion: 0,
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const withdrawal = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        expectedMaintenancePublicationVersion: 1,
        action: "withdraw",
      },
    )
    const secondPublication = await publishMaintenanceForOwner(
      connection,
      owner,
      publishInput({
        maintenanceWindowId: scheduled.maintenanceWindowId,
        maintenanceVersion: 2,
        publicationVersion: withdrawal.maintenancePublicationVersion,
        componentId: component.componentId,
        componentVersion: component.componentVersion + 1,
        now,
        effectiveAt: now + 3,
      }),
    )
    const publications = await connection.client.execute({
      sql: "SELECT action, target_source_revision FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version",
      args: [scheduled.maintenanceWindowId],
    })

    assert.equal(firstPublication.maintenancePublicationVersion, 1)
    assert.equal(withdrawal.maintenancePublicationVersion, 2)
    assert.equal(secondPublication.maintenanceVersion, 3)
    assert.equal(secondPublication.maintenancePublicationVersion, 3)
    assert.deepEqual(secondPublication.componentVersions, [
      {
        componentId: component.componentId,
        componentVersion: component.componentVersion + 1,
      },
    ])
    assert.deepEqual(
      publications.rows.map((row) => ({
        action: row.action,
        revision: row.target_source_revision,
      })),
      [
        { action: "publish", revision: 2 },
        { action: "withdraw", revision: 2 },
        { action: "publish", revision: 3 },
      ],
    )
    assert.equal((await readPublicMaintenanceWindows(connection)).length, 1)
  })

  it("publishes a corrected revision after redaction and reopens dependencies", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const firstPublication = await publishMaintenanceForOwner(
      connection,
      owner,
      publishInput({
        maintenanceWindowId: scheduled.maintenanceWindowId,
        maintenanceVersion: 1,
        publicationVersion: 0,
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const redaction = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: firstPublication.maintenanceVersion,
        expectedMaintenancePublicationVersion:
          firstPublication.maintenancePublicationVersion,
        action: "redact",
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: component.componentVersion + 1,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
      },
    )
    const corrected = await publishMaintenanceForOwner(
      connection,
      owner,
      {
        ...publishInput({
          maintenanceWindowId: scheduled.maintenanceWindowId,
          maintenanceVersion: firstPublication.maintenanceVersion,
          publicationVersion: redaction.maintenancePublicationVersion,
          componentId: component.componentId,
          componentVersion: component.componentVersion + 2,
          now,
          effectiveAt: now + 3,
        }),
        publicTitle: "Corrected public rest",
      },
    )

    assert.equal(corrected.maintenanceVersion, 3)
    assert.equal(corrected.maintenancePublicationVersion, 3)
    assert.deepEqual(corrected.componentVersions, [
      {
        componentId: component.componentId,
        componentVersion: component.componentVersion + 3,
      },
    ])
    assert.equal(
      (await readPublicMaintenanceWindows(connection))[0]?.title,
      "Corrected public rest",
    )
  })

  it("rejects republishing a suppressed window without allocating state", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const publication = await publishMaintenanceForOwner(
      connection,
      owner,
      publishInput({
        maintenanceWindowId: scheduled.maintenanceWindowId,
        maintenanceVersion: 1,
        publicationVersion: 0,
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        now,
      }),
    )
    const suppression = await closeMaintenancePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        expectedMaintenancePublicationVersion: 1,
        action: "suppress",
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: component.componentVersion + 1,
            expectedComponentMetadataPublicationVersion: 1,
          },
        ],
      },
    )
    const before = await readMutationState(
      connection,
      scheduled.maintenanceWindowId,
      component.componentId,
    )

    await assert.rejects(
      publishMaintenanceForOwner(
        connection,
        owner,
        publishInput({
          maintenanceWindowId: scheduled.maintenanceWindowId,
          maintenanceVersion: publication.maintenanceVersion,
          publicationVersion: suppression.maintenancePublicationVersion,
          componentId: component.componentId,
          componentVersion: component.componentVersion + 2,
          now,
          effectiveAt: now + 3,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_TERMINAL",
    )
    assert.deepEqual(
      await readMutationState(
        connection,
        scheduled.maintenanceWindowId,
        component.componentId,
      ),
      before,
    )
  })
})
