import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import {
  changeComponentLifecycleForOwner,
  publishComponentForOwner,
  saveComponentMetadataForOwner,
} from "../../src/lib/commands/component-metadata"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import {
  appendIncidentUpdateForOwner,
  createIncidentForOwner,
} from "../../src/lib/commands/incidents"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { reportStatusForOwner } from "../../src/lib/commands/status"
import { readOwnerDashboard } from "../../src/lib/data/owner-dashboard-repository"
import { readPublicStatusPage } from "../../src/lib/data/public-status-repository"
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
  "component-metadata-test-key-is-at-least-32-bytes",
)

function privateComponentInput() {
  return {
    idempotencyKey: crypto.randomUUID(),
    visibility: "private" as const,
    ownerName: "Private availability",
    ownerSummary: "Owner-only summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Owner-only note",
    initialStatus: null,
  }
}

function publicComponentInput(now = Date.now()) {
  return {
    idempotencyKey: crypto.randomUUID(),
    visibility: "public" as const,
    ownerName: "Internal availability",
    ownerSummary: "Owner-only component summary",
    ownerSortOrder: 0,
    defaultValidityMs: null,
    privateNote: "Owner-only component note",
    publicName: "Availability",
    publicSummary: "Current availability",
    publicSortOrder: 0,
    initialStatus: {
      condition: "available" as const,
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: "Owner-only status summary",
      publicSummary: "Available normally",
      privateNote: "Owner-only status note",
    },
  }
}

function metadataInput(componentId: string, idempotencyKey = crypto.randomUUID()) {
  return {
    idempotencyKey,
    componentId,
    expectedComponentVersion: 1,
    expectedMetadataPublicationVersion: 0,
    ownerName: "Updated private availability",
    ownerSummary: "Updated owner-only summary",
    ownerSortOrder: 2,
    defaultValidityMs: 86_400_000,
    privateNote: "Updated owner-only note",
    publicDraft: {
      name: "Response availability",
      summary: "When replies are likely",
      sortOrder: 3,
    },
  }
}

function startingReport(now = Date.now()) {
  return {
    condition: "available" as const,
    effectiveAt: now - 1_000,
    validUntil: null,
    ownerSummary: "Owner-only starting status",
    publicSummary: "Available normally",
    privateNote: "Owner-only starting note",
  }
}

async function readComponentMutationState(
  connection: DatabaseConnection,
  componentId: string,
) {
  const result = await connection.client.execute({
    sql: `
      SELECT
        (SELECT version FROM components WHERE id = ?) AS component_version,
        (SELECT count(*) FROM component_revisions WHERE component_id = ?) AS revisions,
        (SELECT count(*) FROM publication_events WHERE stream_id = ?) AS publications,
        (SELECT owner_ordinal FROM timeline_clock WHERE id = 1) AS owner_ordinal,
        (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal,
        (SELECT count(*) FROM command_receipts) AS receipts
    `,
    args: [componentId, componentId, componentId],
  })
  return result.rows[0]
}

describe("component metadata and lifecycle commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("saves a private revision with aggregate continuity and permanent replay", async () => {
    const component = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const input = metadataInput(component.componentId)
    const first = await saveComponentMetadataForOwner(connection, owner, input)
    const replay = await saveComponentMetadataForOwner(connection, owner, input)
    const dashboard = await readOwnerDashboard(connection, Date.now())
    const stored = dashboard.components[0]
    const receipt = await connection.client.execute(
      "SELECT response_body_json, response_expires_at FROM command_receipts WHERE action = 'save_component_metadata'",
    )

    assert.deepEqual(replay, first)
    assert.equal(first.componentVersion, 2)
    assert.equal(first.revisionVersion, 2)
    assert.equal(first.metadataPublicationVersion, 0)
    assert.equal(stored?.componentVersion, 2)
    assert.equal(stored?.metadata.revisionVersion, 2)
    assert.equal(stored?.metadata.lifecycle, "active")
    assert.equal(stored?.metadata.ownerName, input.ownerName)
    assert.deepEqual(stored?.metadata.publicDraft, input.publicDraft)
    assert.equal(stored?.publication.isComponentPublic, false)
    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      {
        component_version: 2,
        revisions: 2,
        publications: 0,
        owner_ordinal: 0,
        public_ordinal: 0,
        receipts: 2,
      },
    )
    assert.deepEqual(receipt.rows[0], {
      response_body_json: null,
      response_expires_at: null,
    })
  })

  it("rejects idempotency reuse with different private metadata", async () => {
    const component = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const input = metadataInput(component.componentId)
    await saveComponentMetadataForOwner(connection, owner, input)

    await assert.rejects(
      saveComponentMetadataForOwner(connection, owner, {
        ...input,
        ownerName: "A conflicting name",
      }),
      IdempotencyConflictError,
    )
    const revisions = await connection.client.execute({
      sql: "SELECT count(*) AS count FROM component_revisions WHERE component_id = ?",
      args: [component.componentId],
    })
    assert.equal(Number(revisions.rows[0]?.count), 2)
  })

  it("publishes metadata and a fresh starting report atomically with permanent replay", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const saved = await saveComponentMetadataForOwner(
      connection,
      owner,
      metadataInput(component.componentId),
    )
    const input = {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: saved.componentVersion,
      expectedMetadataPublicationVersion: 0,
      expectedStatusPublicationVersion: 0,
      startingReport: startingReport(now),
    }
    const published = await publishComponentForOwner(
      connection,
      owner,
      input,
    )
    const replay = await publishComponentForOwner(
      connection,
      owner,
      input,
    )
    const publicPage = await readPublicStatusPage(connection, now)
    const publications = await connection.client.execute({
      sql: "SELECT stream_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition FROM publication_events WHERE stream_id = ? ORDER BY publication_version, stream_type",
      args: [component.componentId],
    })
    const receipt = await connection.client.execute(
      "SELECT response_body_json, response_expires_at FROM command_receipts WHERE action = 'publish_component'",
    )

    assert.deepEqual(replay, published)
    assert.equal(published.componentVersion, 3)
    assert.equal(published.revisionId, saved.revisionId)
    assert.equal(published.revisionVersion, 2)
    assert.equal(published.metadataPublicationVersion, 1)
    assert.equal(published.statusPublicationVersion, 1)
    assert.equal(publicPage.components.length, 1)
    assert.equal(publicPage.components[0]?.name, "Response availability")
    assert.equal(publicPage.components[0]?.status.condition, "available")
    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      {
        component_version: 3,
        revisions: 2,
        publications: 2,
        owner_ordinal: 3,
        public_ordinal: 2,
        receipts: 3,
      },
    )
    const metadataPublication = publications.rows.find(
      (row) => row.stream_type === "component_metadata",
    )
    const statusPublication = publications.rows.find(
      (row) => row.stream_type === "component_status",
    )
    assert.equal(metadataPublication?.target_source_id, saved.revisionId)
    assert.equal(Number(metadataPublication?.target_source_revision), 2)
    assert.equal(metadataPublication?.resulting_disposition, "published")
    assert.equal(
      statusPublication?.target_source_id,
      published.statusTransitionId,
    )
    assert.equal(Number(statusPublication?.target_source_revision), 3)
    assert.equal(statusPublication?.resulting_disposition, "published")
    const serialized = publications.rows
      .map((row) => String(row.target_snapshot_json))
      .join("\n")
    assert.equal(serialized.includes("Updated private availability"), false)
    assert.equal(serialized.includes("Updated owner-only note"), false)
    assert.equal(serialized.includes("Owner-only starting status"), false)
    assert.equal(serialized.includes("Owner-only starting note"), false)
    assert.deepEqual(receipt.rows[0], {
      response_body_json: null,
      response_expires_at: null,
    })

    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...input,
        idempotencyKey: crypto.randomUUID(),
        expectedComponentVersion: published.componentVersion,
        expectedMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_UNCHANGED",
    )
  })

  it("fails closed for stale or non-current starting reports and replays before time checks", async (context) => {
    let now = 2_000_000_000_000
    context.mock.method(Date, "now", () => now)
    const component = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const saved = await saveComponentMetadataForOwner(
      connection,
      owner,
      metadataInput(component.componentId),
    )
    const base = {
      componentId: component.componentId,
      expectedComponentVersion: saved.componentVersion,
      expectedMetadataPublicationVersion: 0,
      expectedStatusPublicationVersion: 0,
    }
    const before = await readComponentMutationState(
      connection,
      component.componentId,
    )

    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        startingReport: {
          ...startingReport(now),
          effectiveAt: now + 1,
        },
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLIC_STARTING_STATUS_NOT_CURRENT",
    )
    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        startingReport: {
          ...startingReport(now),
          validUntil: now - 1,
        },
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLIC_STARTING_STATUS_NOT_CURRENT",
    )
    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        expectedComponentVersion: 1,
        startingReport: startingReport(now),
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        expectedMetadataPublicationVersion: 1,
        startingReport: startingReport(now),
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        expectedStatusPublicationVersion: 1,
        startingReport: startingReport(now),
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "STATUS_PUBLICATION_VERSION_CONFLICT",
    )
    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      before,
    )

    const input = {
      ...base,
      idempotencyKey: crypto.randomUUID(),
      startingReport: {
        ...startingReport(now),
        validUntil: now + 100,
      },
    }
    const first = await publishComponentForOwner(connection, owner, input)
    now += 200
    const replay = await publishComponentForOwner(connection, owner, input)

    assert.deepEqual(replay, first)
    assert.equal(first.componentVersion, saved.componentVersion + 1)
  })

  it("archives every published status source atomically and preserves timeline history", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(
      connection,
      owner,
      publicComponentInput(now),
    )
    const futureStatus = await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: 2,
      condition: "limited",
      effectiveAt: now + 60_000,
      validUntil: null,
      ownerSummary: "Owner-only future status",
      privateNote: "Owner-only future note",
      publication: {
        mode: "public",
        publicSummary: "Replies may slow down",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })
    const archiveInput = {
      idempotencyKey: crypto.randomUUID(),
      operation: "archive" as const,
      componentId: component.componentId,
      expectedComponentVersion: futureStatus.componentVersion,
      expectedMetadataPublicationVersion: 1,
      expectedStatusPublicationVersion: 2,
    }
    const archived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      archiveInput,
    )
    const replay = await changeComponentLifecycleForOwner(
      connection,
      owner,
      archiveInput,
    )
    const publicPage = await readPublicStatusPage(connection, now + 120_000)
    const timeline = await readPublicTimelinePage(connection, {
      limit: 10,
      cursorCodec,
    })
    const sourceStates = await connection.client.execute({
      sql: `
        WITH ranked AS (
          SELECT
            target_source_id,
            action,
            row_number() OVER (
              PARTITION BY target_source_id
              ORDER BY publication_version DESC, id DESC
            ) AS rank
          FROM publication_events
          WHERE stream_type = 'component_status' AND stream_id = ?
        )
        SELECT action FROM ranked WHERE rank = 1 ORDER BY target_source_id
      `,
      args: [component.componentId],
    })
    const streams = await connection.client.execute({
      sql: "SELECT stream_type, publication_version, resulting_disposition FROM publication_events WHERE stream_id = ? ORDER BY public_ordinal DESC",
      args: [component.componentId],
    })
    const dashboard = await readOwnerDashboard(connection, now + 120_000)

    assert.deepEqual(replay, archived)
    assert.equal(archived.componentVersion, 4)
    assert.equal(archived.revisionVersion, 4)
    assert.equal(archived.lifecycle, "archived")
    assert.equal(archived.metadataPublicationVersion, 2)
    assert.equal(archived.statusPublicationVersion, 4)
    assert.deepEqual(
      sourceStates.rows.map((row) => String(row.action)),
      ["withdraw", "withdraw"],
    )
    assert.equal(publicPage.components.length, 0)
    assert.equal(timeline.kind, "page")
    if (timeline.kind === "page") {
      assert.equal(timeline.entries.length, 2)
      assert.equal(
        timeline.entries.every((entry) => entry.kind === "component_status"),
        true,
      )
    }
    assert.equal(
      streams.rows.find((row) => row.stream_type === "component_metadata")
        ?.resulting_disposition,
      "closed",
    )
    assert.equal(
      streams.rows.find((row) => row.stream_type === "component_status")
        ?.resulting_disposition,
      "closed",
    )
    assert.equal(dashboard.components[0]?.componentVersion, 4)
    assert.equal(dashboard.components[0]?.metadata.revisionVersion, 4)
    assert.equal(dashboard.components[0]?.metadata.lifecycle, "archived")
    assert.equal(dashboard.components[0]?.publication.isComponentPublic, false)
    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      {
        component_version: 4,
        revisions: 2,
        publications: 6,
        owner_ordinal: 8,
        public_ordinal: 6,
        receipts: 3,
      },
    )

    const unarchived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "unarchive",
        componentId: component.componentId,
        expectedComponentVersion: archived.componentVersion,
        expectedMetadataPublicationVersion:
          archived.metadataPublicationVersion,
        expectedStatusPublicationVersion: archived.statusPublicationVersion,
      },
    )
    assert.equal(unarchived.componentVersion, 5)
    assert.equal(unarchived.revisionVersion, 5)
    assert.equal(unarchived.lifecycle, "active")
    assert.equal(
      (await readPublicStatusPage(connection, now + 120_000)).components.length,
      0,
    )

    const beforeRepublish = await readComponentMutationState(
      connection,
      component.componentId,
    )
    await assert.rejects(
      publishComponentForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: unarchived.componentVersion,
        expectedMetadataPublicationVersion:
          unarchived.metadataPublicationVersion,
        expectedStatusPublicationVersion: unarchived.statusPublicationVersion,
        startingReport: {
          ...startingReport(now),
          effectiveAt: now - 2_000,
        },
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLIC_STARTING_STATUS_NOT_AUTHORITATIVE",
    )
    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      beforeRepublish,
    )

    const republished = await publishComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: unarchived.componentVersion,
      expectedMetadataPublicationVersion:
        unarchived.metadataPublicationVersion,
      expectedStatusPublicationVersion: unarchived.statusPublicationVersion,
      startingReport: {
        ...startingReport(now),
        condition: "limited",
        publicSummary: "Replies are currently limited",
      },
    })
    const republishedPage = await readPublicStatusPage(connection, Date.now())
    assert.equal(republished.componentVersion, 6)
    assert.equal(republished.metadataPublicationVersion, 3)
    assert.equal(republished.statusPublicationVersion, 5)
    assert.equal(republishedPage.components.length, 1)
    assert.equal(republishedPage.components[0]?.status.condition, "limited")
  })

  it("rolls back stale root and publication guards", async () => {
    const component = await createComponentForOwner(
      connection,
      owner,
      publicComponentInput(),
    )
    const before = await readComponentMutationState(
      connection,
      component.componentId,
    )
    const base = {
      idempotencyKey: crypto.randomUUID(),
      operation: "archive" as const,
      componentId: component.componentId,
      expectedComponentVersion: 2,
      expectedMetadataPublicationVersion: 1,
      expectedStatusPublicationVersion: 1,
    }

    await assert.rejects(
      changeComponentLifecycleForOwner(connection, owner, {
        ...base,
        expectedComponentVersion: 1,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_VERSION_CONFLICT",
    )
    await assert.rejects(
      changeComponentLifecycleForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        expectedMetadataPublicationVersion: 0,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "COMPONENT_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      changeComponentLifecycleForOwner(connection, owner, {
        ...base,
        idempotencyKey: crypto.randomUUID(),
        expectedStatusPublicationVersion: 0,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "STATUS_PUBLICATION_VERSION_CONFLICT",
    )

    assert.deepEqual(
      await readComponentMutationState(connection, component.componentId),
      before,
    )
  })

  it("blocks every active private incident phase and allows archive after resolution", async () => {
    const now = Date.now()
    const incidentComponent = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner-only incident title",
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: "Owner-only incident summary",
      privateNote: "Owner-only incident note",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: incidentComponent.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })

    const assertIncidentBlocksArchive = () =>
      assert.rejects(
        changeComponentLifecycleForOwner(connection, owner, {
          idempotencyKey: crypto.randomUUID(),
          operation: "archive",
          componentId: incidentComponent.componentId,
          expectedComponentVersion: 2,
          expectedMetadataPublicationVersion: 0,
          expectedStatusPublicationVersion: 0,
        }),
        (error: unknown) =>
          error instanceof CommandValidationError &&
          error.code === "COMPONENT_HAS_ACTIVE_DEPENDENCIES",
      )

    await assertIncidentBlocksArchive()
    const identified = await appendIncidentUpdateForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "phase_update",
        incidentId: incident.incidentId,
        expectedIncidentVersion: incident.incidentVersion,
        to: "identified",
        reason: "The cause is understood",
        ownerSummary: "Owner-only incident update",
        privateNote: null,
        effectiveAt: now + 1,
        publication: { mode: "private" },
      },
    )
    await assertIncidentBlocksArchive()

    const resolved = await appendIncidentUpdateForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "resolve",
        incidentId: incident.incidentId,
        expectedIncidentVersion: identified.incidentVersion,
        reason: "The condition has recovered",
        ownerSummary: "Owner-only resolution",
        privateNote: null,
        effectiveAt: now + 2,
        componentOutcomes: [
          {
            componentId: incidentComponent.componentId,
            expectedComponentVersion: 2,
            mode: "unchanged",
          },
        ],
        publication: { mode: "private" },
      },
    )
    assert.equal(resolved.phase, "resolved")

    const archived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "archive",
        componentId: incidentComponent.componentId,
        expectedComponentVersion: 2,
        expectedMetadataPublicationVersion: 0,
        expectedStatusPublicationVersion: 0,
      },
    )
    assert.equal(archived.lifecycle, "archived")
  })

  it("allows archive after a public incident resolves without closing its history", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(
      connection,
      owner,
      publicComponentInput(now),
    )
    const incident = await createIncidentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner-only incident title",
      severity: "major",
      initialPhase: "investigating",
      ownerSummary: "Owner-only incident summary",
      privateNote: "Owner-only incident note",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 2,
          expectedComponentMetadataPublicationVersion: 1,
        },
      ],
      publication: {
        mode: "public",
        expectedPublicationVersion: 0,
        publicTitle: "Response delay",
        publicSeverity: "minor",
        publicSummary: "Replies may be delayed",
      },
    })
    const resolved = await appendIncidentUpdateForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "resolve",
        incidentId: incident.incidentId,
        expectedIncidentVersion: incident.incidentVersion,
        reason: "The condition has recovered",
        ownerSummary: "Owner-only resolution",
        privateNote: null,
        effectiveAt: now + 1,
        componentOutcomes: [
          {
            componentId: component.componentId,
            expectedComponentVersion: 3,
            mode: "unchanged",
          },
        ],
        publication: {
          mode: "public",
          expectedPublicationVersion: incident.incidentPublicationVersion,
          publicSummary: "Responses have recovered",
        },
      },
    )
    const archived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "archive",
        componentId: component.componentId,
        expectedComponentVersion: 3,
        expectedMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    )
    const incidentPublication = await connection.client.execute({
      sql: "SELECT resulting_disposition FROM publication_events WHERE stream_type = 'incident' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [incident.incidentId],
    })

    assert.equal(resolved.phase, "resolved")
    assert.equal(archived.lifecycle, "archived")
    assert.equal(
      incidentPublication.rows[0]?.resulting_disposition,
      "published",
    )
  })

  it("blocks scheduled and in-progress maintenance and allows completed windows", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(
      connection,
      owner,
      publicComponentInput(now),
    )
    const maintenance = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner-only maintenance title",
      ownerSummary: "Owner-only maintenance summary",
      privateNote: "Owner-only maintenance note",
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 2,
          expectedComponentMetadataPublicationVersion: 1,
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion: 0,
        title: "Planned rest",
        summary: "Replies may pause briefly",
        startsAt: now + 60_000,
        endsAt: now + 120_000,
        timezone: "Asia/Shanghai",
      },
    })

    const assertMaintenanceBlocksArchive = () =>
      assert.rejects(
        changeComponentLifecycleForOwner(connection, owner, {
          idempotencyKey: crypto.randomUUID(),
          operation: "archive",
          componentId: component.componentId,
          expectedComponentVersion: 3,
          expectedMetadataPublicationVersion: 1,
          expectedStatusPublicationVersion: 1,
        }),
        (error: unknown) =>
          error instanceof CommandValidationError &&
          error.code === "COMPONENT_HAS_ACTIVE_DEPENDENCIES",
      )

    await assertMaintenanceBlocksArchive()
    const started = await appendMaintenanceEventForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "start",
        maintenanceWindowId: maintenance.maintenanceWindowId,
        expectedMaintenanceVersion: maintenance.maintenanceVersion,
        effectiveAt: now + 60_000,
        ownerSummary: "Maintenance started",
        privateNote: null,
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: 3,
            expectedComponentMetadataPublicationVersion: 1,
            outcome: "unchanged",
          },
        ],
        publication: {
          mode: "public",
          expectedMaintenancePublicationVersion:
            maintenance.maintenancePublicationVersion,
          summary: "Maintenance is in progress",
        },
      },
    )
    await assertMaintenanceBlocksArchive()

    const completed = await appendMaintenanceEventForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "complete",
        maintenanceWindowId: maintenance.maintenanceWindowId,
        expectedMaintenanceVersion: started.maintenanceVersion,
        effectiveAt: now + 120_000,
        ownerSummary: "Maintenance completed",
        privateNote: null,
        affectedComponents: [
          {
            componentId: component.componentId,
            expectedComponentVersion: 3,
            expectedComponentMetadataPublicationVersion: 1,
            outcome: "unchanged",
          },
        ],
        publication: {
          mode: "public",
          expectedMaintenancePublicationVersion:
            started.maintenancePublicationVersion,
          summary: "Maintenance is complete",
        },
      },
    )
    assert.equal(completed.maintenanceVersion, 3)

    const archived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "archive",
        componentId: component.componentId,
        expectedComponentVersion: 3,
        expectedMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    )
    const maintenancePublication = await connection.client.execute({
      sql: "SELECT resulting_disposition FROM publication_events WHERE stream_type = 'maintenance' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [maintenance.maintenanceWindowId],
    })
    assert.equal(archived.lifecycle, "archived")
    assert.equal(
      maintenancePublication.rows[0]?.resulting_disposition,
      "published",
    )
  })

  it("allows archive after scheduled maintenance is cancelled", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(
      connection,
      owner,
      privateComponentInput(),
    )
    const maintenance = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Cancelled maintenance",
      ownerSummary: null,
      privateNote: null,
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "Asia/Shanghai",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
        },
      ],
      publication: { mode: "private" },
    })
    await appendMaintenanceEventForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "cancel",
      maintenanceWindowId: maintenance.maintenanceWindowId,
      expectedMaintenanceVersion: maintenance.maintenanceVersion,
      effectiveAt: now + 1,
      ownerSummary: "Maintenance cancelled",
      privateNote: null,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: 1,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "unchanged",
        },
      ],
      publication: { mode: "private" },
    })

    const archived = await changeComponentLifecycleForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        operation: "archive",
        componentId: component.componentId,
        expectedComponentVersion: 1,
        expectedMetadataPublicationVersion: 0,
        expectedStatusPublicationVersion: 0,
      },
    )
    assert.equal(archived.lifecycle, "archived")
  })
})
