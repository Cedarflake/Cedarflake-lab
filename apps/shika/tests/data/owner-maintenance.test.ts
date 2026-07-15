import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { publishMaintenanceForOwner } from "../../src/lib/commands/publish-maintenance"
import { createOwnerMaintenanceLoader } from "../../src/lib/data/owner-maintenance-loader"
import {
  OwnerMaintenanceDataIntegrityError,
  readOwnerMaintenanceWindows,
} from "../../src/lib/data/owner-maintenance-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPrivateComponent(
  connection: DatabaseConnection,
  name: string,
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "private",
    ownerName: name,
    ownerSummary: `${name} owner summary`,
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: `${name} private note`,
    initialStatus: null,
  })
}

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

function privateScheduleInput(input: {
  componentId: string
  startsAt: number
  endsAt: number
  effectiveAt: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-MAINTENANCE-TITLE",
    ownerSummary: "OWNER-CANARY-MAINTENANCE-SUMMARY",
    privateNote: "OWNER-CANARY-MAINTENANCE-NOTE",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: "Asia/Shanghai",
    effectiveAt: input.effectiveAt,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: 1,
      },
    ],
    publication: { mode: "private" as const },
  }
}

function publicScheduleInput(input: {
  componentId: string
  startsAt: number
  endsAt: number
  effectiveAt: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "OWNER-CANARY-MAINTENANCE-TITLE",
    ownerSummary: "OWNER-CANARY-MAINTENANCE-SUMMARY",
    privateNote: "OWNER-CANARY-MAINTENANCE-NOTE",
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
      mode: "public" as const,
      expectedMaintenancePublicationVersion: 0 as const,
      title: "Public maintenance",
      summary: "Public maintenance summary",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: "Asia/Shanghai",
    },
  }
}

function privateAppendInput(input: {
  operation: "start" | "complete" | "note"
  maintenanceWindowId: string
  expectedMaintenanceVersion: number
  componentId: string
  effectiveAt: number
}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    operation: input.operation,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.expectedMaintenanceVersion,
    effectiveAt: input.effectiveAt,
    ownerSummary: `${input.operation} OWNER-CANARY-SUMMARY`,
    privateNote: `${input.operation} OWNER-CANARY-NOTE`,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: 1,
        expectedComponentMetadataPublicationVersion: null,
        outcome: "unchanged" as const,
      },
    ],
    publication: { mode: "private" as const },
  }
}

function publicAppendInput(input: {
  operation: "start"
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
    ownerSummary: "start OWNER-CANARY-SUMMARY",
    privateNote: "start OWNER-CANARY-NOTE",
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
      summary: "Public maintenance started",
    },
  }
}

describe("owner maintenance repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns complete owner history with the latest event as authoritative", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput({
        componentId: component.componentId,
        startsAt: now + 60_000,
        endsAt: now + 120_000,
        effectiveAt: now,
      }),
    )

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "start",
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        componentId: component.componentId,
        effectiveAt: now + 1,
      }),
    )
    await appendMaintenanceEventForOwner(connection, owner, {
      ...privateAppendInput({
        operation: "note",
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        componentId: component.componentId,
        effectiveAt: now + 2,
      }),
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 3,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "unchanged" as const,
        },
      ],
    })

    const windows = await readOwnerMaintenanceWindows(connection, now + 3)
    const window = windows.find(
      (candidate) =>
        candidate.maintenanceWindowId === scheduled.maintenanceWindowId,
    )

    assert.ok(window)
    assert.equal(window.maintenanceVersion, 3)
    assert.equal(window.phase, "in_progress")
    assert.equal(window.isOverdue, false)
    assert.deepEqual(window.publication, {
      version: 2,
      lastAction: "publish",
      disposition: "published",
      resultingDisposition: "published",
    })
    assert.deepEqual(
      window.events.map((event) => ({
        version: event.maintenanceVersion,
        kind: event.kind,
        phase: event.phase,
        disposition: event.publication.disposition,
      })),
      [
        {
          version: 3,
          kind: "note",
          phase: "in_progress",
          disposition: "private",
        },
        {
          version: 2,
          kind: "started",
          phase: "in_progress",
          disposition: "published",
        },
        {
          version: 1,
          kind: "scheduled",
          phase: "scheduled",
          disposition: "published",
        },
      ],
    )
    assert.equal(window.latestEvent.ownerSummary, "note OWNER-CANARY-SUMMARY")
    assert.equal(window.latestEvent.privateNote, "note OWNER-CANARY-NOTE")
    assert.equal(window.latestEvent.publicDraft, null)
    assert.equal(
      window.latestEvent.affectedComponents[0]?.ownerNameSnapshot,
      "OWNER-CANARY-COMPONENT",
    )
    assert.equal(
      window.latestEvent.affectedComponents[0]?.publicSnapshot,
      null,
    )
    assert.deepEqual(window.events[1]?.publicDraft, {
      title: "Public maintenance",
      phase: "in_progress",
      summary: "Public maintenance started",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
    })
    assert.equal(
      window.events[1]?.affectedComponents[0]?.publicSnapshot?.componentPublicId,
      component.componentPublicId,
    )
  })

  it("derives overdue markers without changing the authoritative phase", async () => {
    const now = Date.now()
    const scheduledComponent = await createPrivateComponent(
      connection,
      "Scheduled component",
    )
    const activeComponent = await createPrivateComponent(
      connection,
      "Active component",
    )
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: scheduledComponent.componentId,
        startsAt: now - 60_000,
        endsAt: now + 60_000,
        effectiveAt: now - 120_000,
      }),
    )
    const active = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput({
        componentId: activeComponent.componentId,
        startsAt: now - 120_000,
        endsAt: now - 60_000,
        effectiveAt: now - 180_000,
      }),
    )

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "start",
        maintenanceWindowId: active.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        componentId: activeComponent.componentId,
        effectiveAt: now - 90_000,
      }),
    )

    const overdue = await readOwnerMaintenanceWindows(connection, now)
    const scheduledWindow = overdue.find(
      (window) => window.maintenanceWindowId === scheduled.maintenanceWindowId,
    )
    const activeWindow = overdue.find(
      (window) => window.maintenanceWindowId === active.maintenanceWindowId,
    )

    assert.ok(scheduledWindow)
    assert.ok(activeWindow)
    assert.deepEqual(
      {
        phase: scheduledWindow.phase,
        isOverdue: scheduledWindow.isOverdue,
        overdueReason: scheduledWindow.overdueReason,
      },
      {
        phase: "scheduled",
        isOverdue: true,
        overdueReason: "awaiting_start",
      },
    )
    assert.deepEqual(
      {
        phase: activeWindow.phase,
        isOverdue: activeWindow.isOverdue,
        overdueReason: activeWindow.overdueReason,
      },
      {
        phase: "in_progress",
        isOverdue: true,
        overdueReason: "awaiting_completion",
      },
    )

    await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "complete",
        maintenanceWindowId: active.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        componentId: activeComponent.componentId,
        effectiveAt: now + 1,
      }),
    )

    const completed = (
      await readOwnerMaintenanceWindows(connection, now + 2)
    ).find(
      (window) => window.maintenanceWindowId === active.maintenanceWindowId,
    )

    assert.ok(completed)
    assert.equal(completed.phase, "completed")
    assert.equal(completed.isOverdue, false)
    assert.equal(completed.overdueReason, null)
  })

  it("projects an explicit private-to-public metadata revision without rewriting history", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      {
        ...privateScheduleInput({
          componentId: component.componentId,
          startsAt: now + 60_000,
          endsAt: now + 120_000,
          effectiveAt: now,
        }),
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: component.componentVersion,
          },
        ],
      },
    )

    await publishMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      maintenanceWindowId: scheduled.maintenanceWindowId,
      expectedMaintenanceVersion: 1,
      expectedMaintenancePublicationVersion: 0,
      effectiveAt: now + 1,
      publicTitle: "Public planned rest",
      publicSummary: "Responses may pause",
      publicStartsAt: now + 60_000,
      publicEndsAt: now + 120_000,
      publicTimezone: "Asia/Shanghai",
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion: 1,
        },
      ],
    })

    const window = (
      await readOwnerMaintenanceWindows(connection, now + 2)
    ).find(
      (candidate) =>
        candidate.maintenanceWindowId === scheduled.maintenanceWindowId,
    )

    assert.ok(window)
    assert.equal(window.maintenanceVersion, 2)
    assert.deepEqual(window.publication, {
      version: 1,
      lastAction: "publish",
      disposition: "published",
      resultingDisposition: "published",
    })
    assert.equal(window.latestEvent.kind, "metadata")
    assert.equal(window.latestEvent.privateNote, null)
    assert.deepEqual(window.latestEvent.publicDraft, {
      title: "Public planned rest",
      phase: "scheduled",
      summary: "Responses may pause",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
    })
    assert.equal(window.events[1]?.publication.disposition, "private")
    assert.equal(window.events[1]?.publicDraft, null)
    assert.equal(
      window.latestEvent.affectedComponents[0]?.publicSnapshot?.name,
      "Public availability",
    )
    assert.equal(
      window.latestEvent.affectedComponents[0]?.componentVersion,
      component.componentVersion + 1,
    )
  })

  it("fails closed when event references are inconsistent", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const scheduled = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput({
        componentId: component.componentId,
        startsAt: now + 60_000,
        endsAt: now + 120_000,
        effectiveAt: now,
      }),
    )

    await connection.client.execute({
      sql: "UPDATE maintenance_event_components SET public_component_id_snapshot = NULL, public_name_snapshot = NULL, component_metadata_publication_version = NULL WHERE maintenance_event_id = ?",
      args: [scheduled.maintenanceEventId],
    })

    await assert.rejects(
      readOwnerMaintenanceWindows(connection, now),
      OwnerMaintenanceDataIntegrityError,
    )
  })
})

describe("owner maintenance loader", () => {
  it("authorizes before reading owner maintenance", async () => {
    const calls: string[] = []
    const loader = createOwnerMaintenanceLoader({
      authorize: async () => {
        calls.push("authorize")
      },
      readMaintenance: async () => {
        calls.push("read")
        return []
      },
    })

    assert.deepEqual(await loader(123), [])
    assert.deepEqual(calls, ["authorize", "read"])
  })

  it("does not read owner maintenance when authorization fails", async () => {
    const calls: string[] = []
    const authorizationError = new Error("unauthorized")
    const loader = createOwnerMaintenanceLoader({
      authorize: async () => {
        calls.push("authorize")
        throw authorizationError
      },
      readMaintenance: async () => {
        calls.push("read")
        return []
      },
    })

    await assert.rejects(loader(123), authorizationError)
    assert.deepEqual(calls, ["authorize"])
  })
})
