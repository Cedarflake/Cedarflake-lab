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
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { maintenancePublicSnapshotSchema } from "../../src/lib/public/maintenance-snapshots"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPrivateComponent(connection: DatabaseConnection) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "private",
    ownerName: "Private energy",
    ownerSummary: "Owner-only component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Private component note",
    initialStatus: null,
  })
}

async function createPublicComponent(
  connection: DatabaseConnection,
  now = Date.now(),
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Secret internal availability",
    ownerSummary: "Secret internal component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Secret private component note",
    publicName: "Availability",
    publicSummary: "When I can respond",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Secret internal status",
      publicSummary: "Responding normally",
      privateNote: "Secret private transition note",
    },
  })
}

function privateScheduleInput(
  componentId: string,
  expectedComponentVersion: number,
  now = Date.now(),
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Owner rest window",
    ownerSummary: "Internal schedule summary",
    privateNote: "Private schedule note",
    startsAt: now + 60_000,
    endsAt: now + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt: now,
    affectedComponents: [{ componentId, expectedComponentVersion }],
    publication: { mode: "private" as const },
  }
}

function publicScheduleInput(
  componentId: string,
  expectedComponentVersion: number,
  now = Date.now(),
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Secret owner rest window",
    ownerSummary: "Secret internal schedule summary",
    privateNote: "Secret maintenance note",
    startsAt: now + 60_000,
    endsAt: now + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt: now,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedMaintenancePublicationVersion: 0 as const,
      title: "Planned rest",
      summary: "Responses may pause briefly",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
    },
  }
}

function privateAppendInput(input: {
  operation: "reschedule" | "start" | "complete" | "cancel" | "note"
  maintenanceWindowId: string
  expectedMaintenanceVersion: number
  componentId: string
  expectedComponentVersion: number
  now?: number
}) {
  const now = input.now ?? Date.now()
  const base = {
    idempotencyKey: crypto.randomUUID(),
    operation: input.operation,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.expectedMaintenanceVersion,
    effectiveAt: now,
    ownerSummary: `${input.operation} owner summary`,
    privateNote: `${input.operation} private note`,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: input.expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: null,
        outcome: "unchanged" as const,
      },
    ],
    publication: { mode: "private" as const },
  }

  return input.operation === "reschedule"
    ? {
        ...base,
        operation: "reschedule" as const,
        startsAt: now + 180_000,
        endsAt: now + 240_000,
        timezone: "Asia/Shanghai",
      }
    : base
}

function publicAppendInput(input: {
  operation: "reschedule" | "start" | "complete" | "cancel" | "note"
  maintenanceWindowId: string
  expectedMaintenanceVersion: number
  expectedMaintenancePublicationVersion: number
  componentId: string
  expectedComponentVersion: number
  summary: string
  now?: number
}) {
  const now = input.now ?? Date.now()
  const base = {
    idempotencyKey: crypto.randomUUID(),
    operation: input.operation,
    maintenanceWindowId: input.maintenanceWindowId,
    expectedMaintenanceVersion: input.expectedMaintenanceVersion,
    effectiveAt: now,
    ownerSummary: `${input.operation} secret owner summary`,
    privateNote: `${input.operation} secret private note`,
    affectedComponents: [
      {
        componentId: input.componentId,
        expectedComponentVersion: input.expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
        outcome: "unchanged" as const,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedMaintenancePublicationVersion:
        input.expectedMaintenancePublicationVersion,
      summary: input.summary,
    },
  }

  return input.operation === "reschedule"
    ? {
        ...base,
        operation: "reschedule" as const,
        publication: {
          ...base.publication,
          startsAt: now + 180_000,
          endsAt: now + 240_000,
          timezone: "Asia/Shanghai",
        },
        startsAt: now + 180_000,
        endsAt: now + 240_000,
        timezone: "Asia/Shanghai",
      }
    : base
}

describe("maintenance commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("schedules private maintenance and permanently replays the same command", async () => {
    const component = await createPrivateComponent(connection)
    const input = privateScheduleInput(component.componentId, 1)
    const first = await scheduleMaintenanceForOwner(connection, owner, input)
    const second = await scheduleMaintenanceForOwner(connection, owner, input)
    const state = await connection.client.execute(
      "SELECT (SELECT count(*) FROM maintenance_windows) AS windows, (SELECT count(*) FROM maintenance_events) AS events, (SELECT count(*) FROM maintenance_event_components) AS component_refs, (SELECT count(*) FROM publication_events WHERE stream_type = 'maintenance') AS publications, (SELECT version FROM components WHERE id = ?) AS component_version, (SELECT owner_ordinal FROM timeline_clock) AS owner_ordinal, (SELECT public_ordinal FROM timeline_clock) AS public_ordinal",
      [component.componentId],
    )
    const event = await connection.client.execute({
      sql: "SELECT phase, public_title, public_phase, public_summary FROM maintenance_events WHERE id = ?",
      args: [first.maintenanceEventId],
    })

    assert.deepEqual(second, first)
    assert.deepEqual(first.componentVersions, [
      { componentId: component.componentId, componentVersion: 1 },
    ])
    assert.equal(first.maintenanceVersion, 1)
    assert.equal(first.maintenancePublicationVersion, 0)
    assert.deepEqual(state.rows[0], {
      windows: 1,
      events: 1,
      component_refs: 1,
      publications: 0,
      component_version: 1,
      owner_ordinal: 1,
      public_ordinal: 0,
    })
    assert.deepEqual(event.rows[0], {
      phase: "scheduled",
      public_title: null,
      public_phase: null,
      public_summary: null,
    })
  })

  it("publishes an audience-safe schedule and guards the public dependency", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const input = publicScheduleInput(component.componentId, 2, now)
    const result = await scheduleMaintenanceForOwner(connection, owner, input)
    const publication = await connection.client.execute({
      sql: "SELECT publication_version, target_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ?",
      args: [result.maintenanceWindowId],
    })
    const reference = await connection.client.execute({
      sql: "SELECT component_version, owner_name_snapshot, public_component_id_snapshot, public_name_snapshot, component_metadata_publication_version FROM maintenance_event_components WHERE maintenance_event_id = ?",
      args: [result.maintenanceEventId],
    })
    const clock = await connection.client.execute(
      "SELECT owner_ordinal, public_ordinal FROM timeline_clock",
    )
    const serialized = String(publication.rows[0]?.target_snapshot_json)
    const snapshot = maintenancePublicSnapshotSchema.parse(
      JSON.parse(serialized) as unknown,
    )

    assert.equal(result.maintenancePublicationVersion, 1)
    assert.deepEqual(result.componentVersions, [
      { componentId: component.componentId, componentVersion: 3 },
    ])
    assert.equal(publication.rows[0]?.publication_version, 1)
    assert.equal(snapshot.phase, "scheduled")
    assert.equal(snapshot.title, "Planned rest")
    assert.deepEqual(snapshot.affectedComponents, [
      {
        componentPublicId: component.componentPublicId,
        name: "Availability",
      },
    ])
    assert.equal(serialized.includes(component.componentId), false)
    assert.equal(serialized.includes(input.title), false)
    assert.equal(serialized.includes(String(input.ownerSummary)), false)
    assert.equal(serialized.includes(String(input.privateNote)), false)
    assert.deepEqual(reference.rows[0], {
      component_version: 3,
      owner_name_snapshot: "Secret internal availability",
      public_component_id_snapshot: component.componentPublicId,
      public_name_snapshot: "Availability",
      component_metadata_publication_version: 1,
    })
    assert.deepEqual(clock.rows[0], {
      owner_ordinal: 5,
      public_ordinal: 3,
    })
  })

  it("rolls back a stale public component publication guard", async () => {
    const component = await createPublicComponent(connection)
    const input = publicScheduleInput(component.componentId, 2)
    input.affectedComponents[0] = {
      ...input.affectedComponents[0],
      expectedComponentMetadataPublicationVersion: 2,
    }

    await assert.rejects(
      scheduleMaintenanceForOwner(connection, owner, input),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_PUBLICATION_VERSION_CONFLICT",
    )

    const state = await connection.client.execute({
      sql: "SELECT (SELECT count(*) FROM maintenance_windows) AS windows, (SELECT version FROM components WHERE id = ?) AS component_version, (SELECT owner_ordinal FROM timeline_clock) AS owner_ordinal, (SELECT public_ordinal FROM timeline_clock) AS public_ordinal",
      args: [component.componentId],
    })

    assert.deepEqual(state.rows[0], {
      windows: 0,
      component_version: 2,
      owner_ordinal: 3,
      public_ordinal: 2,
    })
  })

  it("advances a private lifecycle only through explicit commands", async () => {
    const component = await createPrivateComponent(connection)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput(component.componentId, 1, Date.now() - 600_000),
    )
    const rescheduled = await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "reschedule",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 1,
      }),
    )
    const started = await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "start",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        componentId: component.componentId,
        expectedComponentVersion: 1,
      }),
    )
    const completed = await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "complete",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 3,
        componentId: component.componentId,
        expectedComponentVersion: 1,
      }),
    )
    const phases = await connection.client.execute(
      "SELECT phase FROM maintenance_events ORDER BY maintenance_version",
    )

    assert.equal(rescheduled.maintenanceVersion, 2)
    assert.equal(started.maintenanceVersion, 3)
    assert.equal(completed.maintenanceVersion, 4)
    assert.deepEqual(
      phases.rows.map((row) => row.phase),
      ["scheduled", "scheduled", "in_progress", "completed"],
    )

    await assert.rejects(
      appendMaintenanceEventForOwner(
        connection,
        owner,
        privateAppendInput({
          operation: "start",
          maintenanceWindowId: schedule.maintenanceWindowId,
          expectedMaintenanceVersion: 4,
          componentId: component.componentId,
          expectedComponentVersion: 1,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "INVALID_MAINTENANCE_TRANSITION",
    )
  })

  it("requires public lifecycle publication without sweeping a private note", async () => {
    const component = await createPublicComponent(connection)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput(component.componentId, 2),
    )

    await assert.rejects(
      appendMaintenanceEventForOwner(
        connection,
        owner,
        privateAppendInput({
          operation: "start",
          maintenanceWindowId: schedule.maintenanceWindowId,
          expectedMaintenanceVersion: 1,
          componentId: component.componentId,
          expectedComponentVersion: 3,
        }),
      ),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLIC_LIFECYCLE_REQUIRES_PUBLICATION",
    )

    const started = await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "start",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 3,
        summary: "The planned pause has started",
      }),
    )
    const privateNote = await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "note",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        componentId: component.componentId,
        expectedComponentVersion: 3,
      }),
    )
    const completed = await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "complete",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 3,
        expectedMaintenancePublicationVersion: 2,
        componentId: component.componentId,
        expectedComponentVersion: 3,
        summary: "The planned pause is complete",
      }),
    )
    const publications = await connection.client.execute({
      sql: "SELECT publication_version, target_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version",
      args: [schedule.maintenanceWindowId],
    })
    const latestSerialized = String(
      publications.rows.at(-1)?.target_snapshot_json,
    )
    const latest = maintenancePublicSnapshotSchema.parse(
      JSON.parse(latestSerialized) as unknown,
    )

    assert.equal(started.maintenancePublicationVersion, 2)
    assert.equal(privateNote.maintenancePublicationVersion, 2)
    assert.equal(completed.maintenancePublicationVersion, 3)
    assert.equal(publications.rows.length, 3)
    assert.equal(latest.phase, "completed")
    assert.equal(latest.summary, "The planned pause is complete")
    assert.equal(latestSerialized.includes("note private note"), false)
    assert.equal(latestSerialized.includes("note owner summary"), false)
  })

  it("publishes reschedule, note, and cancellation snapshots explicitly", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput(component.componentId, 2, now),
    )
    const rescheduled = await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "reschedule",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        expectedMaintenancePublicationVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 3,
        summary: "The public schedule moved",
        now,
      }),
    )
    const noted = await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "note",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 2,
        expectedMaintenancePublicationVersion: 2,
        componentId: component.componentId,
        expectedComponentVersion: 3,
        summary: "A public scheduling note",
        now: now + 1,
      }),
    )
    const cancelled = await appendMaintenanceEventForOwner(
      connection,
      owner,
      publicAppendInput({
        operation: "cancel",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 3,
        expectedMaintenancePublicationVersion: 3,
        componentId: component.componentId,
        expectedComponentVersion: 3,
        summary: "The planned pause was cancelled",
        now: now + 2,
      }),
    )
    const latestPublication = await connection.client.execute({
      sql: "SELECT target_snapshot_json FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [schedule.maintenanceWindowId],
    })
    const snapshot = maintenancePublicSnapshotSchema.parse(
      JSON.parse(
        String(latestPublication.rows[0]?.target_snapshot_json),
      ) as unknown,
    )

    assert.equal(rescheduled.maintenancePublicationVersion, 2)
    assert.equal(noted.maintenancePublicationVersion, 3)
    assert.equal(cancelled.maintenancePublicationVersion, 4)
    assert.equal(snapshot.kind, "cancelled")
    assert.equal(snapshot.phase, "cancelled")
    assert.equal(snapshot.summary, "The planned pause was cancelled")
    assert.equal(snapshot.startsAt, now + 180_000)
    assert.equal(snapshot.endsAt, now + 240_000)
  })

  it("rejects stale maintenance, publication, and component guards atomically", async () => {
    const component = await createPublicComponent(connection)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicScheduleInput(component.componentId, 2),
    )
    const valid = publicAppendInput({
      operation: "start",
      maintenanceWindowId: schedule.maintenanceWindowId,
      expectedMaintenanceVersion: 1,
      expectedMaintenancePublicationVersion: 1,
      componentId: component.componentId,
      expectedComponentVersion: 3,
      summary: "Starting",
    })

    await assert.rejects(
      appendMaintenanceEventForOwner(connection, owner, {
        ...valid,
        idempotencyKey: crypto.randomUUID(),
        expectedMaintenanceVersion: 2,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_VERSION_CONFLICT",
    )
    await assert.rejects(
      appendMaintenanceEventForOwner(connection, owner, {
        ...valid,
        idempotencyKey: crypto.randomUUID(),
        publication: {
          ...valid.publication,
          expectedMaintenancePublicationVersion: 2,
        },
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "MAINTENANCE_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      appendMaintenanceEventForOwner(connection, owner, {
        ...valid,
        idempotencyKey: crypto.randomUUID(),
        affectedComponents: [
          {
            ...valid.affectedComponents[0],
            expectedComponentVersion: 4,
          },
        ],
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_VERSION_CONFLICT",
    )

    const state = await connection.client.execute({
      sql: "SELECT (SELECT version FROM maintenance_windows WHERE id = ?) AS version, (SELECT count(*) FROM maintenance_events WHERE maintenance_window_id = ?) AS events, (SELECT count(*) FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ?) AS publications",
      args: [
        schedule.maintenanceWindowId,
        schedule.maintenanceWindowId,
        schedule.maintenanceWindowId,
      ],
    })

    assert.deepEqual(state.rows[0], {
      version: 1,
      events: 1,
      publications: 1,
    })
  })

  it("supports explicit cancellation from a scheduled window", async () => {
    const component = await createPrivateComponent(connection)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput(component.componentId, 1),
    )
    const cancelled = await appendMaintenanceEventForOwner(
      connection,
      owner,
      privateAppendInput({
        operation: "cancel",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 1,
      }),
    )
    const event = await connection.client.execute({
      sql: "SELECT kind, phase FROM maintenance_events WHERE id = ?",
      args: [cancelled.maintenanceEventId],
    })

    assert.deepEqual(event.rows[0], {
      kind: "cancelled",
      phase: "cancelled",
    })
  })

  it("applies explicit start and completion status transitions atomically", async () => {
    const now = Date.now()
    const component = await createPrivateComponent(connection)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput(component.componentId, 1, now),
    )
    const started = await appendMaintenanceEventForOwner(connection, owner, {
      ...privateAppendInput({
        operation: "start",
        maintenanceWindowId: schedule.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 1,
        now: now + 1,
      }),
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "transition",
          transition: {
            condition: "limited",
            validUntil: null,
            ownerSummary: "Taking a planned pause",
            privateNote: null,
            publication: { mode: "private" },
          },
        },
      ],
    })
    const completed = await appendMaintenanceEventForOwner(
      connection,
      owner,
      {
        ...privateAppendInput({
          operation: "complete",
          maintenanceWindowId: schedule.maintenanceWindowId,
          expectedMaintenanceVersion: started.maintenanceVersion,
          componentId: component.componentId,
          expectedComponentVersion: 2,
          now: now + 2,
        }),
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: 2,
            expectedComponentMetadataPublicationVersion: null,
            outcome: "transition",
            transition: {
              condition: "available",
              validUntil: null,
              ownerSummary: "Back from the planned pause",
              privateNote: null,
              publication: { mode: "private" },
            },
          },
        ],
      },
    )
    const references = await connection.client.execute({
      sql: "SELECT maintenance_events.kind, maintenance_event_components.component_version FROM maintenance_events INNER JOIN maintenance_event_components ON maintenance_event_components.maintenance_event_id = maintenance_events.id WHERE maintenance_events.maintenance_window_id = ? ORDER BY maintenance_events.maintenance_version",
      args: [schedule.maintenanceWindowId],
    })
    const transitions = await connection.client.execute({
      sql: "SELECT condition FROM status_transitions WHERE component_id = ? ORDER BY component_version",
      args: [component.componentId],
    })
    const correlation = await connection.client.execute({
      sql: "SELECT maintenance_events.correlation_id AS maintenance_correlation_id, status_transitions.correlation_id AS status_correlation_id FROM maintenance_events INNER JOIN status_transitions ON status_transitions.id = ? WHERE maintenance_events.id = ?",
      args: [
        started.statusTransitions[0]?.statusTransitionId ?? "",
        started.maintenanceEventId,
      ],
    })

    assert.deepEqual(started.componentVersions, [
      { componentId: component.componentId, componentVersion: 2 },
    ])
    assert.deepEqual(completed.componentVersions, [
      { componentId: component.componentId, componentVersion: 3 },
    ])
    assert.equal(started.statusTransitions.length, 1)
    assert.equal(completed.statusTransitions.length, 1)
    assert.deepEqual(references.rows, [
      { kind: "scheduled", component_version: 1 },
      { kind: "started", component_version: 2 },
      { kind: "completed", component_version: 3 },
    ])
    assert.deepEqual(
      transitions.rows.map((row) => row.condition),
      ["limited", "available"],
    )
    assert.equal(
      correlation.rows[0]?.status_correlation_id,
      correlation.rows[0]?.maintenance_correlation_id,
    )
  })

  it("rolls back maintenance start when a status publication guard is stale", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now)
    const schedule = await scheduleMaintenanceForOwner(
      connection,
      owner,
      privateScheduleInput(component.componentId, 2, now),
    )

    await assert.rejects(
      appendMaintenanceEventForOwner(connection, owner, {
        ...privateAppendInput({
          operation: "start",
          maintenanceWindowId: schedule.maintenanceWindowId,
          expectedMaintenanceVersion: 1,
          componentId: component.componentId,
          expectedComponentVersion: 2,
          now: now + 1,
        }),
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: 2,
            expectedComponentMetadataPublicationVersion: null,
            outcome: "transition",
            transition: {
              condition: "limited",
              validUntil: null,
              ownerSummary: null,
              privateNote: null,
              publication: {
                mode: "public",
                publicSummary: "Temporarily limited",
                expectedComponentMetadataPublicationVersion: 1,
                expectedStatusPublicationVersion: 0,
              },
            },
          },
        ],
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "STATUS_PUBLICATION_VERSION_CONFLICT",
    )

    const state = await connection.client.execute({
      sql: "SELECT maintenance_windows.version, (SELECT count(*) FROM maintenance_events WHERE maintenance_window_id = maintenance_windows.id) AS events, (SELECT count(*) FROM status_transitions WHERE component_id = ?) AS transitions, (SELECT version FROM components WHERE id = ?) AS component_version FROM maintenance_windows WHERE maintenance_windows.id = ?",
      args: [
        component.componentId,
        component.componentId,
        schedule.maintenanceWindowId,
      ],
    })
    assert.deepEqual(state.rows[0], {
      version: 1,
      events: 1,
      transitions: 1,
      component_version: 2,
    })
  })

  it("rejects unsupported component outcomes and conflicting retries", async () => {
    const component = await createPrivateComponent(connection)
    const input = privateScheduleInput(component.componentId, 1)
    const scheduled = await scheduleMaintenanceForOwner(connection, owner, input)

    await assert.rejects(
      scheduleMaintenanceForOwner(connection, owner, {
        ...input,
        title: "Different payload",
      }),
      IdempotencyConflictError,
    )

    const unsupported = {
      ...privateAppendInput({
        operation: "reschedule",
        maintenanceWindowId: scheduled.maintenanceWindowId,
        expectedMaintenanceVersion: 1,
        componentId: component.componentId,
        expectedComponentVersion: 1,
      }),
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "transition",
          transition: {
            condition: "limited",
            validUntil: null,
            ownerSummary: null,
            privateNote: null,
            publication: { mode: "private" },
          },
        },
      ],
    }

    await assert.rejects(
      appendMaintenanceEventForOwner(connection, owner, unsupported),
      { name: "ZodError" },
    )
  })
})
