import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import { closeIncidentPublicationForOwner } from "../../src/lib/commands/incident-publication"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
} from "../../src/lib/commands/incidents"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { reportStatusForOwner } from "../../src/lib/commands/status"
import {
  PublicTimelineDataIntegrityError,
  readPublicTimelinePage,
  type PublicIncidentTimelineEntry,
  type PublicMaintenanceTimelineEntry,
} from "../../src/lib/data/public-timeline-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import {
  createRedactedTimelineSnapshot,
  createWithdrawnTimelineSnapshot,
} from "../../src/lib/public/timeline-snapshots"
import { createPublicCursorCodec } from "../../src/lib/timeline/public-cursor"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

const cursorCodec = createPublicCursorCodec(
  "public-timeline-integration-test-key-001",
)

async function createPublicComponent(
  connection: DatabaseConnection,
  effectiveAt: number,
  publicSummary = "Initial public summary",
) {
  return createComponentForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public",
    ownerName: "Secret internal availability",
    ownerSummary: "Secret owner component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Secret component note",
    publicName: "Availability",
    publicSummary: "When I can respond",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available",
      effectiveAt,
      validUntil: null,
      ownerSummary: "Secret owner status summary",
      publicSummary,
      privateNote: "Secret transition note",
    },
  })
}

function publicIncidentInput(
  componentId: string,
  expectedComponentVersion: number,
  effectiveAt: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Secret owner incident title",
    severity: "major" as const,
    initialPhase: "investigating" as const,
    ownerSummary: "Secret owner incident summary",
    privateNote: "Secret incident note",
    effectiveAt,
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion,
        expectedComponentMetadataPublicationVersion: 1,
      },
    ],
    publication: {
      mode: "public" as const,
      expectedPublicationVersion: 0 as const,
      publicTitle: "Response delays",
      publicSeverity: "minor" as const,
      publicSummary: "Replies may be delayed",
    },
  }
}

function publicMaintenanceInput(
  componentId: string,
  expectedComponentVersion: number,
  effectiveAt: number,
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    title: "Secret owner rest window",
    ownerSummary: "Secret owner maintenance summary",
    privateNote: "Secret maintenance note",
    startsAt: effectiveAt + 60_000,
    endsAt: effectiveAt + 120_000,
    timezone: "Asia/Shanghai",
    effectiveAt,
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
      startsAt: effectiveAt + 60_000,
      endsAt: effectiveAt + 120_000,
      timezone: "Asia/Shanghai",
    },
  }
}

async function readStatusTimelineRows(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    SELECT timeline_entry_id, timeline_snapshot_json, public_ordinal
    FROM publication_events
    WHERE stream_type = 'component_status'
    ORDER BY public_ordinal
  `)

  return result.rows.map((row) => ({
    publicEntryId: String(row.timeline_entry_id),
    snapshot: JSON.parse(String(row.timeline_snapshot_json)) as unknown,
    publicOrdinal: Number(row.public_ordinal),
  }))
}

async function insertPrivacyClosure(
  connection: DatabaseConnection,
  input: {
    action: "redact" | "suppress"
    publicEntryId: string
    snapshot: unknown | null
  },
) {
  const sourceResult = await connection.client.execute({
    sql: `
      SELECT
        stream_id,
        target_source_type,
        target_source_id,
        target_source_revision,
        timeline_effective_at,
        timeline_recorded_at,
        snapshot_schema_version
      FROM publication_events
      WHERE timeline_entry_id = ?
      ORDER BY public_ordinal
      LIMIT 1
    `,
    args: [input.publicEntryId],
  })
  const source = sourceResult.rows[0]
  assert.ok(source)
  const versionResult = await connection.client.execute({
    sql: "SELECT max(publication_version) AS version FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ?",
    args: [source.stream_id],
  })
  const clockResult = await connection.client.execute(
    "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock WHERE id = 1",
  )
  const clock = clockResult.rows[0]
  assert.ok(clock)
  const recordedAt = Date.now()
  const ownerOrdinal = Number(clock.owner_ordinal) + 1
  const publicOrdinal = Number(clock.public_ordinal) + 1
  const privacyEpoch = Number(clock.public_privacy_epoch) + 1
  const snapshotJson = input.snapshot === null ? null : JSON.stringify(input.snapshot)

  await connection.client.batch(
    [
      {
        sql: `
          INSERT INTO publication_events (
            id,
            stream_type,
            stream_id,
            publication_version,
            action,
            target_source_type,
            target_source_id,
            target_source_revision,
            target_snapshot_json,
            resulting_disposition,
            resulting_source_type,
            resulting_source_id,
            resulting_source_revision,
            resulting_current_snapshot_json,
            timeline_entry_id,
            timeline_effective_at,
            timeline_recorded_at,
            timeline_snapshot_json,
            snapshot_schema_version,
            recorded_at,
            owner_ordinal,
            public_ordinal,
            public_privacy_epoch,
            correlation_id
          ) VALUES (?, 'component_status', ?, ?, ?, ?, ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          crypto.randomUUID(),
          source.stream_id,
          Number(versionResult.rows[0]?.version) + 1,
          input.action,
          source.target_source_type,
          source.target_source_id,
          Number(source.target_source_revision),
          snapshotJson,
          input.publicEntryId,
          Number(source.timeline_effective_at),
          Number(source.timeline_recorded_at),
          snapshotJson,
          Number(source.snapshot_schema_version),
          recordedAt,
          ownerOrdinal,
          publicOrdinal,
          privacyEpoch,
          crypto.randomUUID(),
        ],
      },
      {
        sql: "UPDATE timeline_clock SET owner_ordinal = ?, public_ordinal = ?, public_privacy_epoch = ?, updated_at = ? WHERE id = 1",
        args: [ownerOrdinal, publicOrdinal, privacyEpoch, recordedAt],
      },
    ],
    "write",
  )
}

async function insertWithdrawalNotice(
  connection: DatabaseConnection,
  sourceEntryId: string,
) {
  const sourceResult = await connection.client.execute({
    sql: "SELECT * FROM publication_events WHERE timeline_entry_id = ? ORDER BY public_ordinal LIMIT 1",
    args: [sourceEntryId],
  })
  const source = sourceResult.rows[0]
  assert.ok(source)
  const versionResult = await connection.client.execute({
    sql: "SELECT max(publication_version) AS version FROM publication_events WHERE stream_type = ? AND stream_id = ?",
    args: [source.stream_type, source.stream_id],
  })
  const clockResult = await connection.client.execute(
    "SELECT owner_ordinal, public_ordinal, public_privacy_epoch FROM timeline_clock WHERE id = 1",
  )
  const clock = clockResult.rows[0]
  assert.ok(clock)
  const recordedAt = Date.now()
  const ownerOrdinal = Number(clock.owner_ordinal) + 1
  const publicOrdinal = Number(clock.public_ordinal) + 1
  const publicEntryId = crypto.randomUUID()
  const snapshotJson = JSON.stringify(
    createWithdrawnTimelineSnapshot({
      schemaVersion: 1,
      kind: "withdrawn",
      publicEntryId,
    }),
  )

  await connection.client.batch(
    [
      {
        sql: `
          INSERT INTO publication_events (
            id, stream_type, stream_id, publication_version, action,
            target_source_type, target_source_id, target_source_revision,
            target_snapshot_json, resulting_disposition,
            resulting_source_type, resulting_source_id,
            resulting_source_revision, resulting_current_snapshot_json,
            timeline_entry_id, timeline_effective_at, timeline_recorded_at,
            timeline_snapshot_json, snapshot_schema_version, recorded_at,
            owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id
          ) VALUES (?, 'component_status', ?, ?, 'withdraw', ?, ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `,
        args: [
          crypto.randomUUID(),
          source.stream_id,
          Number(versionResult.rows[0]?.version) + 1,
          source.target_source_type,
          source.target_source_id,
          Number(source.target_source_revision),
          source.target_snapshot_json,
          publicEntryId,
          recordedAt,
          recordedAt,
          snapshotJson,
          recordedAt,
          ownerOrdinal,
          publicOrdinal,
          Number(clock.public_privacy_epoch),
          crypto.randomUUID(),
        ],
      },
      {
        sql: "UPDATE timeline_clock SET owner_ordinal = ?, public_ordinal = ?, updated_at = ? WHERE id = 1",
        args: [ownerOrdinal, publicOrdinal, recordedAt],
      },
    ],
    "write",
  )

  return publicEntryId
}

describe("public timeline repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns only explicit public snapshots and ignores private activity", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    const before = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      condition: "unavailable",
      effectiveAt: now,
      validUntil: null,
      ownerSummary: "Secret private status",
      privateNote: "Secret private report note",
      publication: { mode: "private" },
    })

    const after = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    assert.deepEqual(after, before)
    assert.equal(before.kind, "page")
    if (before.kind !== "page") return

    assert.equal(before.entries.length, 1)
    assert.deepEqual(before.entries[0], {
      schemaVersion: 1,
      kind: "component_status",
      publicEntryId: before.entries[0]?.publicEntryId,
      publicOrdinal: 2,
      effectiveAt: now - 1_000,
      recordedAt: before.entries[0]?.recordedAt,
      componentPublicId: component.componentPublicId,
      componentName: "Availability",
      condition: "available",
      summary: "Initial public summary",
      validUntil: null,
    })
    const serialized = JSON.stringify(after)
    for (const secret of [
      component.componentId,
      "Secret internal availability",
      "Secret owner component summary",
      "Secret component note",
      "Secret owner status summary",
      "Secret transition note",
      "Secret private status",
      "Secret private report note",
    ]) {
      assert.equal(serialized.includes(secret), false)
    }
  })

  it("maps public incident creation and phase updates without private fields", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(component.componentId, component.componentVersion, now),
    )
    const beforePrivateNote = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    const privateNote = await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "note",
      incidentId: incident.incidentId,
      expectedIncidentVersion: incident.incidentVersion,
      ownerSummary: "Secret owner-only incident note",
      privateNote: "Secret private incident follow-up",
      effectiveAt: now + 1,
      publication: { mode: "private" },
    })
    const afterPrivateNote = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    assert.deepEqual(afterPrivateNote, beforePrivateNote)

    await appendIncidentUpdateForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "phase_update",
      incidentId: incident.incidentId,
      expectedIncidentVersion: privateNote.incidentVersion,
      to: "identified",
      reason: "Secret diagnostic reason",
      ownerSummary: "Secret identified owner summary",
      privateNote: "Secret identified private note",
      effectiveAt: now + 2,
      publication: {
        mode: "public",
        expectedPublicationVersion: privateNote.incidentPublicationVersion,
        publicSummary: "The cause has been identified",
      },
    })
    const page = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    assert.equal(page.kind, "page")
    if (page.kind !== "page") return

    const incidentEntries = page.entries.filter(
      (entry): entry is PublicIncidentTimelineEntry =>
        entry.kind === "incident",
    )
    assert.equal(incidentEntries.length, 2)
    assert.deepEqual(
      incidentEntries.map((entry) => ({
        phase: entry.phase,
        severity: entry.severity,
        summary: entry.summary,
      })),
      [
        {
          phase: "identified",
          severity: "minor",
          summary: "The cause has been identified",
        },
        {
          phase: "investigating",
          severity: "minor",
          summary: "Replies may be delayed",
        },
      ],
    )
    assert.equal(incidentEntries[0]?.incidentPublicId, incident.incidentPublicId)
    assert.equal(incidentEntries[0]?.detailAvailable, true)
    assert.equal(incidentEntries[0]?.title, "Response delays")
    assert.deepEqual(incidentEntries[0]?.affectedComponents, [
      {
        componentPublicId: component.componentPublicId,
        name: "Availability",
        position: 0,
      },
    ])

    const serialized = JSON.stringify(page)
    for (const secret of [
      incident.incidentId,
      component.componentId,
      "Secret owner incident title",
      "Secret owner incident summary",
      "Secret incident note",
      "Secret owner-only incident note",
      "Secret private incident follow-up",
      "Secret diagnostic reason",
      "Secret identified owner summary",
      "Secret identified private note",
    ]) {
      assert.equal(serialized.includes(secret), false)
    }
  })

  it("marks retained incident history as non-linkable after withdrawal", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(
        component.componentId,
        component.componentVersion,
        now,
      ),
    )

    await closeIncidentPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      action: "withdraw",
      incidentId: incident.incidentId,
      expectedIncidentVersion: incident.incidentVersion,
      expectedIncidentPublicationVersion:
        incident.incidentPublicationVersion,
    })

    const page = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    assert.equal(page.kind, "page")
    if (page.kind !== "page") return

    const incidentEntries = page.entries.filter(
      (entry): entry is PublicIncidentTimelineEntry =>
        entry.kind === "incident",
    )
    assert.equal(incidentEntries.length, 1)
    assert.equal(incidentEntries[0]?.detailAvailable, false)
    assert.equal(
      page.entries.some((entry) => entry.kind === "withdrawn"),
      true,
    )
  })

  it("maps maintenance schedule and lifecycle without sweeping private notes", async () => {
    const now = Date.now()
    const component = await createPublicComponent(connection, now - 1_000)
    const maintenance = await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicMaintenanceInput(
        component.componentId,
        component.componentVersion,
        now,
      ),
    )
    const componentVersion = maintenance.componentVersions[0]?.componentVersion
    assert.equal(componentVersion, 3)
    if (!componentVersion) return

    const beforePrivateNote = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    const privateNote = await appendMaintenanceEventForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "note",
      maintenanceWindowId: maintenance.maintenanceWindowId,
      expectedMaintenanceVersion: maintenance.maintenanceVersion,
      effectiveAt: now + 1,
      ownerSummary: "Secret maintenance owner note",
      privateNote: "Secret maintenance private follow-up",
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: componentVersion,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "unchanged",
        },
      ],
      publication: { mode: "private" },
    })
    const afterPrivateNote = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    assert.deepEqual(afterPrivateNote, beforePrivateNote)

    await appendMaintenanceEventForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "start",
      maintenanceWindowId: maintenance.maintenanceWindowId,
      expectedMaintenanceVersion: privateNote.maintenanceVersion,
      effectiveAt: now + 2,
      ownerSummary: "Secret started owner summary",
      privateNote: "Secret started private note",
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: componentVersion,
          expectedComponentMetadataPublicationVersion: 1,
          outcome: "unchanged",
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion:
          privateNote.maintenancePublicationVersion,
        summary: "The planned pause has started",
      },
    })
    const page = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })

    assert.equal(page.kind, "page")
    if (page.kind !== "page") return

    const maintenanceEntries = page.entries.filter(
      (entry): entry is PublicMaintenanceTimelineEntry =>
        entry.kind === "maintenance",
    )
    assert.equal(maintenanceEntries.length, 2)
    assert.deepEqual(
      maintenanceEntries.map((entry) => ({
        maintenanceKind: entry.maintenanceKind,
        phase: entry.phase,
        summary: entry.summary,
      })),
      [
        {
          maintenanceKind: "started",
          phase: "in_progress",
          summary: "The planned pause has started",
        },
        {
          maintenanceKind: "scheduled",
          phase: "scheduled",
          summary: "Responses may pause briefly",
        },
      ],
    )
    assert.equal(
      maintenanceEntries[0]?.maintenancePublicId,
      maintenance.maintenancePublicId,
    )
    assert.equal(maintenanceEntries[0]?.title, "Planned rest")
    assert.equal(maintenanceEntries[0]?.startsAt, now + 60_000)
    assert.equal(maintenanceEntries[0]?.endsAt, now + 120_000)
    assert.equal(maintenanceEntries[0]?.timezone, "Asia/Shanghai")
    assert.deepEqual(maintenanceEntries[0]?.affectedComponents, [
      {
        componentPublicId: component.componentPublicId,
        name: "Availability",
      },
    ])

    const serialized = JSON.stringify(page)
    for (const secret of [
      maintenance.maintenanceWindowId,
      component.componentId,
      "Secret owner rest window",
      "Secret owner maintenance summary",
      "Secret maintenance note",
      "Secret maintenance owner note",
      "Secret maintenance private follow-up",
      "Secret started owner summary",
      "Secret started private note",
    ]) {
      assert.equal(serialized.includes(secret), false)
    }
  })

  it("paginates mixed entry kinds by the complete stable order tuple", async () => {
    const effectiveAt = Date.now() - 10_000
    const component = await createPublicComponent(connection, effectiveAt)
    const incident = await createIncidentForOwner(
      connection,
      owner,
      publicIncidentInput(
        component.componentId,
        component.componentVersion,
        effectiveAt,
      ),
    )
    const incidentComponentVersion =
      incident.componentVersions[0]?.componentVersion
    assert.equal(incidentComponentVersion, 3)
    if (!incidentComponentVersion) return

    await scheduleMaintenanceForOwner(
      connection,
      owner,
      publicMaintenanceInput(
        component.componentId,
        incidentComponentVersion,
        effectiveAt,
      ),
    )
    const equalRecordedAt = Date.now() - 5_000
    await connection.client.execute({
      sql: "UPDATE publication_events SET timeline_recorded_at = ? WHERE timeline_entry_id IS NOT NULL",
      args: [equalRecordedAt],
    })

    const entries = []
    let cursor: string | null = null

    for (let index = 0; index < 3; index += 1) {
      const page = await readPublicTimelinePage(connection, {
        limit: 1,
        cursor,
        cursorCodec,
      })
      assert.equal(page.kind, "page")
      if (page.kind !== "page") return

      const entry = page.entries[0]
      assert.ok(entry)
      entries.push(entry)
      cursor = page.nextCursor
    }

    assert.equal(cursor, null)
    assert.deepEqual(
      entries.map((entry) => ({
        kind: entry.kind,
        publicOrdinal: entry.publicOrdinal,
      })),
      [
        { kind: "maintenance", publicOrdinal: 4 },
        { kind: "incident", publicOrdinal: 3 },
        { kind: "component_status", publicOrdinal: 2 },
      ],
    )
    assert.equal(new Set(entries.map((entry) => entry.publicEntryId)).size, 3)
  })

  it("keeps the first-page upper bound and uses the complete order tuple", async () => {
    const effectiveAt = Date.now() - 10_000
    const component = await createPublicComponent(connection, effectiveAt)
    const second = await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      condition: "limited",
      effectiveAt,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "Second public report",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })
    const equalRecordedAt = Date.now() - 5_000
    await connection.client.execute({
      sql: "UPDATE publication_events SET timeline_recorded_at = ? WHERE stream_type = 'component_status'",
      args: [equalRecordedAt],
    })

    const firstPage = await readPublicTimelinePage(connection, {
      limit: 1,
      cursorCodec,
    })
    assert.equal(firstPage.kind, "page")
    if (firstPage.kind !== "page") return

    assert.equal(firstPage.entries[0]?.kind, "component_status")
    assert.equal(
      firstPage.entries[0]?.kind === "component_status"
        ? firstPage.entries[0].condition
        : null,
      "limited",
    )
    assert.ok(firstPage.nextCursor)

    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: second.componentVersion,
      condition: "degraded",
      effectiveAt,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "New after page one",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: second.statusPublicationVersion,
      },
    })

    const secondPage = await readPublicTimelinePage(connection, {
      limit: 1,
      cursor: firstPage.nextCursor,
      cursorCodec,
    })
    assert.equal(secondPage.kind, "page")
    if (secondPage.kind !== "page") return

    assert.equal(secondPage.entries.length, 1)
    assert.equal(
      secondPage.entries[0]?.kind === "component_status"
        ? secondPage.entries[0].condition
        : null,
      "available",
    )
    assert.equal(secondPage.nextCursor, null)
    assert.equal(JSON.stringify(secondPage).includes("New after page one"), false)
  })

  it("applies the latest privacy closure before filtering and resets stale cursors", async () => {
    const now = Date.now()
    const component = await createPublicComponent(
      connection,
      now - 2_000,
      "Initial secret public summary",
    )
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      condition: "limited",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "Current safe public summary",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })
    const originalRows = await readStatusTimelineRows(connection)
    const initialEntry = originalRows[0]
    assert.ok(initialEntry)
    const beforeClosure = await readPublicTimelinePage(connection, {
      limit: 1,
      cursorCodec,
    })
    assert.equal(beforeClosure.kind, "page")
    if (beforeClosure.kind !== "page") return
    assert.ok(beforeClosure.nextCursor)
    const withdrawalEntryId = await insertWithdrawalNotice(
      connection,
      initialEntry.publicEntryId,
    )

    await insertPrivacyClosure(connection, {
      action: "redact",
      publicEntryId: initialEntry.publicEntryId,
      snapshot: createRedactedTimelineSnapshot({
        schemaVersion: 1,
        kind: "redacted",
        publicEntryId: initialEntry.publicEntryId,
      }),
    })

    const stalePage = await readPublicTimelinePage(connection, {
      limit: 1,
      cursor: beforeClosure.nextCursor,
      cursorCodec,
    })
    assert.deepEqual(stalePage, {
      kind: "reset",
      entries: [],
      nextCursor: null,
    })

    const redactedPage = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    assert.equal(redactedPage.kind, "page")
    if (redactedPage.kind !== "page") return

    assert.equal(
      redactedPage.entries.some(
        (entry) =>
          entry.kind === "redacted" &&
          entry.publicEntryId === initialEntry.publicEntryId,
      ),
      true,
    )
    assert.equal(
      redactedPage.entries.some(
        (entry) => entry.publicEntryId === withdrawalEntryId,
      ),
      false,
    )
    assert.equal(
      JSON.stringify(redactedPage).includes("Initial secret public summary"),
      false,
    )

    await insertPrivacyClosure(connection, {
      action: "suppress",
      publicEntryId: initialEntry.publicEntryId,
      snapshot: null,
    })
    const suppressedPage = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    assert.equal(suppressedPage.kind, "page")
    if (suppressedPage.kind !== "page") return

    assert.equal(
      suppressedPage.entries.some(
        (entry) => entry.publicEntryId === initialEntry.publicEntryId,
      ),
      false,
    )
  })

  it("adds a withdrawal notice without replacing retained public history", async () => {
    await createPublicComponent(connection, Date.now() - 1_000)
    const [sourceEntry] = await readStatusTimelineRows(connection)
    assert.ok(sourceEntry)
    const withdrawalEntryId = await insertWithdrawalNotice(
      connection,
      sourceEntry.publicEntryId,
    )

    const page = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    assert.equal(page.kind, "page")
    if (page.kind !== "page") return

    assert.equal(page.entries.length, 2)
    assert.equal(
      page.entries.some(
        (entry) =>
          entry.kind === "component_status" &&
          entry.publicEntryId === sourceEntry.publicEntryId,
      ),
      true,
    )
    assert.equal(
      page.entries.some(
        (entry) =>
          entry.kind === "withdrawn" &&
          entry.publicEntryId === withdrawalEntryId,
      ),
      true,
    )
  })

  it("fails closed on a malformed redaction tombstone", async () => {
    const component = await createPublicComponent(connection, Date.now() - 1_000)
    const [initialEntry] = await readStatusTimelineRows(connection)
    assert.ok(initialEntry)

    await insertPrivacyClosure(connection, {
      action: "redact",
      publicEntryId: initialEntry.publicEntryId,
      snapshot: {
        schemaVersion: 1,
        kind: "redacted",
        publicEntryId: initialEntry.publicEntryId,
        privateLeak: component.componentId,
      },
    })

    await assert.rejects(
      readPublicTimelinePage(connection, { limit: 10, cursorCodec }),
      PublicTimelineDataIntegrityError,
    )
  })
})
