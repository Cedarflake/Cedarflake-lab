import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { closeStatusPublicationForOwner } from "../../src/lib/commands/status-publication"
import {
  PublicDataIntegrityError,
  readPublicStatusPage,
} from "../../src/lib/data/public-status-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

describe("public status repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns only explicit public snapshots", async () => {
    const now = Date.now()
    const privateResult = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Secret private component",
      ownerSummary: "Secret owner summary",
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "Secret private note",
      initialStatus: null,
    })
    const publicResult = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Secret internal availability",
      ownerSummary: "Secret internal summary",
      ownerSortOrder: 1,
      defaultValidityMs: null,
      privateNote: "Secret component note",
      publicName: "Availability",
      publicSummary: "When I can respond",
      publicSortOrder: 2,
      initialStatus: {
        condition: "limited",
        effectiveAt: now - 1_000,
        validUntil: now + 60_000,
        ownerSummary: "Secret current owner state",
        publicSummary: "Replies may be slower",
        privateNote: "Secret transition note",
      },
    })

    const projectionNow = Date.now() + 1_000
    const page = await readPublicStatusPage(connection, projectionNow)

    assert.deepEqual(
      { overall: page.overall, components: page.components },
      {
        overall: {
          condition: "limited",
          coverage: "complete",
          hasActiveMaintenance: false,
        },
        components: [
          {
            schemaVersion: 1,
            componentPublicId: publicResult.componentPublicId,
            name: "Availability",
            summary: "When I can respond",
            sortOrder: 2,
            status: {
              condition: "limited",
              effectiveAt: now - 1_000,
              validUntil: now + 60_000,
              unknownReason: null,
            },
            statusSummary: "Replies may be slower",
          },
        ],
      },
    )
    const changeResult = await connection.client.execute(
      "SELECT max(recorded_at) AS recorded_at FROM publication_events WHERE action != 'suppress'",
    )
    assert.equal(
      page.lastPublicChangeAt,
      Number(changeResult.rows[0]?.recorded_at),
    )

    const serialized = JSON.stringify(page)
    for (const secret of [
      privateResult.componentId,
      publicResult.componentId,
      "Secret private component",
      "Secret owner summary",
      "Secret private note",
      "Secret internal availability",
      "Secret internal summary",
      "Secret component note",
      "Secret current owner state",
      "Secret transition note",
    ]) {
      assert.equal(serialized.includes(secret), false)
    }
  })

  it("reports expiry as unknown without falling back", async () => {
    const now = Date.now()
    const validUntil = now + 60_000
    await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      publicName: "Availability",
      publicSummary: null,
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })

    const page = await readPublicStatusPage(connection, validUntil)
    assert.deepEqual(page.overall, {
      condition: "unknown",
      coverage: "none",
      hasActiveMaintenance: false,
    })
    assert.equal(page.components[0]?.status.unknownReason, "expired")
    assert.equal(page.lastPublicChangeAt, validUntil)
  })

  it("derives active maintenance from the latest public lifecycle snapshot", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      publicName: "Availability",
      publicSummary: null,
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil: null,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })
    const scheduled = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Owner maintenance",
      ownerSummary: null,
      privateNote: null,
      startsAt: now + 60_000,
      endsAt: now + 120_000,
      timezone: "UTC",
      effectiveAt: now,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion:
            component.componentMetadataPublicationVersion,
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion: 0,
        title: "Planned maintenance",
        summary: null,
        startsAt: now + 60_000,
        endsAt: now + 120_000,
        timezone: "UTC",
      },
    })
    const componentVersion = scheduled.componentVersions[0]?.componentVersion
    assert.equal(typeof componentVersion, "number")
    if (typeof componentVersion !== "number") return

    assert.equal(
      (await readPublicStatusPage(connection, now)).overall
        .hasActiveMaintenance,
      false,
    )

    const started = await appendMaintenanceEventForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "start",
      maintenanceWindowId: scheduled.maintenanceWindowId,
      expectedMaintenanceVersion: scheduled.maintenanceVersion,
      effectiveAt: now + 1,
      ownerSummary: null,
      privateNote: null,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: componentVersion,
          expectedComponentMetadataPublicationVersion:
            component.componentMetadataPublicationVersion,
          outcome: "unchanged",
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion:
          scheduled.maintenancePublicationVersion,
        summary: "Maintenance started",
      },
    })

    assert.equal(
      (await readPublicStatusPage(connection, now + 1)).overall
        .hasActiveMaintenance,
      true,
    )

    await appendMaintenanceEventForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      operation: "complete",
      maintenanceWindowId: scheduled.maintenanceWindowId,
      expectedMaintenanceVersion: started.maintenanceVersion,
      effectiveAt: now + 2,
      ownerSummary: null,
      privateNote: null,
      affectedComponents: [
        {
          componentId: component.componentId,
          expectedComponentVersion: componentVersion,
          expectedComponentMetadataPublicationVersion:
            component.componentMetadataPublicationVersion,
          outcome: "unchanged",
        },
      ],
      publication: {
        mode: "public",
        expectedMaintenancePublicationVersion:
          started.maintenancePublicationVersion,
        summary: "Maintenance completed",
      },
    })

    assert.equal(
      (await readPublicStatusPage(connection, now + 2)).overall
        .hasActiveMaintenance,
      false,
    )
  })

  it("keeps public bytes stable when the owner transition row changes", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Private availability name",
      ownerSummary: "Private availability summary",
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "Private component note",
      publicName: "Availability",
      publicSummary: "Published component summary",
      publicSortOrder: 0,
      initialStatus: {
        condition: "limited",
        effectiveAt: now - 1_000,
        validUntil: now + 60_000,
        ownerSummary: "Private transition summary",
        publicSummary: "Published transition summary",
        privateNote: "Private transition note",
      },
    })
    const transitionResult = await connection.client.execute({
      sql: "SELECT target_source_id FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? AND action = 'publish'",
      args: [component.componentId],
    })
    const transitionId = transitionResult.rows[0]?.target_source_id
    assert.equal(typeof transitionId, "string")
    if (typeof transitionId !== "string") return

    const projectionNow = now + 1_000
    const before = JSON.stringify(
      await readPublicStatusPage(connection, projectionNow),
    )
    await connection.client.execute({
      sql: "UPDATE status_transitions SET condition = 'unavailable', owner_summary = 'MUTATED OWNER SUMMARY', public_summary = 'MUTATED PUBLIC CANDIDATE', private_note = 'MUTATED PRIVATE NOTE', effective_at = ?, valid_until = NULL, recorded_at = ?, owner_ordinal = 999999, public_entry_id = ? WHERE id = ?",
      args: [
        projectionNow + 120_000,
        projectionNow + 120_000,
        crypto.randomUUID(),
        transitionId,
      ],
    })
    const after = JSON.stringify(
      await readPublicStatusPage(connection, projectionNow),
    )

    assert.equal(after, before)
    for (const canary of [
      "MUTATED OWNER SUMMARY",
      "MUTATED PUBLIC CANDIDATE",
      "MUTATED PRIVATE NOTE",
    ]) {
      assert.equal(after.includes(canary), false)
    }
  })

  for (const action of ["withdraw", "redact"] as const) {
    it(`projects ${action} from the immutable publish source`, async () => {
      const now = Date.now()
      const component = await createComponentForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        visibility: "public",
        ownerName: "Availability",
        ownerSummary: null,
        ownerSortOrder: 0,
        defaultValidityMs: null,
        privateNote: null,
        publicName: "Availability",
        publicSummary: null,
        publicSortOrder: 0,
        initialStatus: {
          condition: "degraded",
          effectiveAt: now - 1_000,
          validUntil: now + 60_000,
          ownerSummary: null,
          publicSummary: "Published state",
          privateNote: null,
        },
      })
      const transitionResult = await connection.client.execute({
        sql: "SELECT target_source_id FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? AND action = 'publish'",
        args: [component.componentId],
      })
      const transitionId = transitionResult.rows[0]?.target_source_id
      assert.equal(typeof transitionId, "string")
      if (typeof transitionId !== "string") return

      await closeStatusPublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        componentId: component.componentId,
        expectedComponentVersion: component.componentVersion,
        statusTransitionId: transitionId,
        expectedStatusPublicationVersion:
          component.componentStatusPublicationVersion,
        action,
      })
      const page = await readPublicStatusPage(connection, now)

      assert.deepEqual(page.components[0]?.status, {
        condition: "unknown",
        effectiveAt: now - 1_000,
        validUntil: now + 60_000,
        unknownReason: action === "withdraw" ? "withdrawn" : "redacted",
      })
      assert.equal(page.components[0]?.statusSummary, null)
    })
  }

  it("removes suppressed status timestamps and action traces from the public DTO", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "PRIVATE STATUS OWNER CANARY",
      ownerSummary: "PRIVATE STATUS SUMMARY CANARY",
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: "PRIVATE STATUS NOTE CANARY",
      publicName: "Availability",
      publicSummary: null,
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil: now + 60_000,
        ownerSummary: "PRIVATE TRANSITION SUMMARY CANARY",
        publicSummary: null,
        privateNote: "PRIVATE TRANSITION NOTE CANARY",
      },
    })
    const transitionResult = await connection.client.execute({
      sql: "SELECT target_source_id FROM publication_events WHERE stream_type = 'component_status' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [component.componentId],
    })
    const transitionId = transitionResult.rows[0]?.target_source_id
    assert.equal(typeof transitionId, "string")
    if (typeof transitionId !== "string") return

    const projectionNow = Date.now() + 120_000
    const before = await readPublicStatusPage(connection, projectionNow)
    await closeStatusPublicationForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      statusTransitionId: transitionId,
      expectedStatusPublicationVersion:
        component.componentStatusPublicationVersion,
      action: "suppress",
    })
    const after = await readPublicStatusPage(connection, projectionNow)

    assert.deepEqual(after.components[0]?.status, {
      condition: "unknown",
      effectiveAt: null,
      validUntil: null,
      unknownReason: "not_reported",
    })
    const metadataResult = await connection.client.execute({
      sql: "SELECT recorded_at FROM publication_events WHERE stream_type = 'component_metadata' AND stream_id = ? ORDER BY publication_version DESC LIMIT 1",
      args: [component.componentId],
    })
    assert.equal(
      after.lastPublicChangeAt,
      Number(metadataResult.rows[0]?.recorded_at),
    )
    assert.notEqual(after.lastPublicChangeAt, before.lastPublicChangeAt)
    const serialized = JSON.stringify(after)
    for (const canary of [
      component.componentId,
      transitionId,
      "suppressed",
      "PRIVATE STATUS OWNER CANARY",
      "PRIVATE STATUS SUMMARY CANARY",
      "PRIVATE STATUS NOTE CANARY",
      "PRIVATE TRANSITION SUMMARY CANARY",
      "PRIVATE TRANSITION NOTE CANARY",
    ]) {
      assert.equal(serialized.includes(canary), false)
    }
  })

  it("fails closed when a stored public snapshot is invalid", async () => {
    const now = Date.now()
    await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      publicName: "Availability",
      publicSummary: null,
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil: null,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })
    await connection.client.execute(
      "UPDATE publication_events SET resulting_current_snapshot_json = '{\"unexpected\":true}' WHERE stream_type = 'component_metadata'",
    )

    await assert.rejects(
      readPublicStatusPage(connection, now),
      PublicDataIntegrityError,
    )
  })

  it("fails closed when status snapshot timeline metadata disagrees", async () => {
    const now = Date.now()
    await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      publicName: "Availability",
      publicSummary: null,
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 1_000,
        validUntil: null,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })
    await connection.client.execute(
      "UPDATE publication_events SET timeline_effective_at = timeline_effective_at + 1 WHERE stream_type = 'component_status' AND action = 'publish'",
    )

    await assert.rejects(
      readPublicStatusPage(connection, now),
      PublicDataIntegrityError,
    )
  })
})
