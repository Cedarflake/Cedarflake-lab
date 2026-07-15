import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createComponentForOwner } from "../../src/lib/commands/components"
import {
  appendMaintenanceEventForOwner,
  scheduleMaintenanceForOwner,
} from "../../src/lib/commands/maintenance"
import { reportStatusForOwner } from "../../src/lib/commands/status"
import { createOwnerDashboardLoader } from "../../src/lib/data/owner-dashboard-loader"
import {
  OwnerDataIntegrityError,
  readOwnerDashboard,
} from "../../src/lib/data/owner-dashboard-repository"
import { readPublicStatusPage } from "../../src/lib/data/public-status-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

describe("owner dashboard repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns complete owner records without changing the public projection", async () => {
    const now = Date.now()
    const publicComponent = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "public",
      ownerName: "Internal availability",
      ownerSummary: "Owner-only component summary",
      ownerSortOrder: 2,
      defaultValidityMs: 86_400_000,
      privateNote: "Owner-only component note",
      publicName: "Availability",
      publicSummary: "When I can respond",
      publicSortOrder: 0,
      initialStatus: {
        condition: "available",
        effectiveAt: now - 2_000,
        validUntil: now + 60_000,
        ownerSummary: "Owner was available",
        publicSummary: "Available",
        privateNote: "Owner-only initial note",
      },
    })
    await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Private energy",
      ownerSummary: "Private component summary",
      ownerSortOrder: 1,
      defaultValidityMs: null,
      privateNote: "Private component note",
      initialStatus: {
        condition: "limited",
        effectiveAt: now - 1_500,
        validUntil: null,
        ownerSummary: "Private owner status",
        publicSummary: null,
        privateNote: "Private status note",
      },
    })
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: publicComponent.componentId,
      expectedComponentVersion: publicComponent.componentVersion,
      condition: "degraded",
      effectiveAt: now - 1_000,
      validUntil: now + 30_000,
      ownerSummary: "Owner-only degraded state",
      privateNote: "Owner-only degraded note",
      publication: { mode: "private" },
    })

    const [dashboard, publicPage] = await Promise.all([
      readOwnerDashboard(connection, now),
      readPublicStatusPage(connection, now),
    ])

    assert.deepEqual(
      dashboard.components.map((component) => component.metadata.ownerName),
      ["Private energy", "Internal availability"],
    )
    assert.deepEqual(dashboard.overall, {
      condition: "degraded",
      coverage: "complete",
      hasActiveMaintenance: false,
    })

    const ownerComponent = dashboard.components[1]
    assert.equal(ownerComponent?.status.condition, "degraded")
    assert.equal(
      ownerComponent?.selectedStatus?.ownerSummary,
      "Owner-only degraded state",
    )
    assert.equal(ownerComponent?.selectedStatus?.publicDisposition, "private")
    assert.equal(ownerComponent?.publication.componentMetadata.version, 1)
    assert.equal(ownerComponent?.publication.componentStatus.version, 1)
    assert.equal(
      ownerComponent?.publication.componentMetadata.currentSource?.snapshot.name,
      "Availability",
    )
    assert.equal(
      ownerComponent?.publication.componentStatus.currentSource?.snapshot
        .condition,
      "available",
    )
    assert.equal(ownerComponent?.statusHistory.length, 2)
    assert.equal(
      dashboard.components[0]?.publication.componentMetadata.currentSource,
      null,
    )
    assert.equal(
      dashboard.components[0]?.publication.componentStatus.currentSource,
      null,
    )
    assert.equal(publicPage.components[0]?.status.condition, "available")
    assert.equal(
      JSON.stringify(publicPage).includes("Owner-only degraded state"),
      false,
    )
  })

  it("keeps metadata and status publication versions distinct", async () => {
    const now = Date.now()
    const created = await createComponentForOwner(connection, owner, {
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
        effectiveAt: now - 2_000,
        validUntil: null,
        ownerSummary: null,
        publicSummary: null,
        privateNote: null,
      },
    })
    await reportStatusForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      componentId: created.componentId,
      expectedComponentVersion: created.componentVersion,
      condition: "limited",
      effectiveAt: now - 1_000,
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "Replies may be slower",
        expectedComponentMetadataPublicationVersion: 1,
        expectedStatusPublicationVersion: 1,
      },
    })

    const component = (await readOwnerDashboard(connection, now)).components[0]
    assert.equal(component?.publication.componentMetadata.version, 1)
    assert.equal(component?.publication.componentStatus.version, 2)
    assert.equal(
      component?.publication.componentStatus.currentSource?.snapshot.condition,
      "limited",
    )
    assert.equal(
      component?.publication.componentStatus.currentSource?.snapshot.summary,
      "Replies may be slower",
    )
    assert.equal(component?.selectedStatus?.publicationVersion, 2)
    assert.equal(component?.selectedStatus?.publicDisposition, "published")
  })

  it("marks maintenance active only after an explicit start", async () => {
    const now = Date.now()
    const component = await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      initialStatus: null,
    })
    const scheduled = await scheduleMaintenanceForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      title: "Planned break",
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
        },
      ],
      publication: { mode: "private" },
    })

    assert.equal(
      (await readOwnerDashboard(connection, now)).overall.hasActiveMaintenance,
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
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "unchanged",
        },
      ],
      publication: { mode: "private" },
    })

    assert.equal(
      (await readOwnerDashboard(connection, now + 1)).overall
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
          expectedComponentVersion: component.componentVersion,
          expectedComponentMetadataPublicationVersion: null,
          outcome: "unchanged",
        },
      ],
      publication: { mode: "private" },
    })

    assert.equal(
      (await readOwnerDashboard(connection, now + 2)).overall
        .hasActiveMaintenance,
      false,
    )
  })

  it("fails closed when authoritative owner data is invalid", async () => {
    await createComponentForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      visibility: "private",
      ownerName: "Private component",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: null,
      privateNote: null,
      initialStatus: null,
    })
    await connection.client.execute(
      "UPDATE component_revisions SET owner_name = ''",
    )

    await assert.rejects(
      readOwnerDashboard(connection, Date.now()),
      OwnerDataIntegrityError,
    )
  })

  it("fails closed when a published current snapshot is invalid", async () => {
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
    await connection.client.execute({
      sql: "UPDATE publication_events SET resulting_current_snapshot_json = ? WHERE stream_type = 'component_metadata'",
      args: [JSON.stringify({ schemaVersion: 1 })],
    })

    await assert.rejects(
      readOwnerDashboard(connection, now),
      OwnerDataIntegrityError,
    )
  })

  it("never selects authentication or OAuth secrets", async () => {
    const now = Date.now()
    const canaries = {
      email: "private-email-canary@example.com",
      session: "private-session-token-canary",
      access: "private-access-token-canary",
      refresh: "private-refresh-token-canary",
      identity: "private-id-token-canary",
      verification: "private-verification-canary",
    }
    await connection.client.batch(
      [
        {
          sql: "INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES ('auth-canary-user', 'Private Auth Name', ?, 1, ?, ?)",
          args: [canaries.email, now, now],
        },
        {
          sql: "INSERT INTO auth_account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, created_at, updated_at) VALUES ('auth-canary-account', '1', 'github', 'auth-canary-user', ?, ?, ?, ?, ?)",
          args: [canaries.access, canaries.refresh, canaries.identity, now, now],
        },
        {
          sql: "INSERT INTO auth_session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('auth-canary-session', ?, ?, ?, ?, 'auth-canary-user')",
          args: [now + 60_000, canaries.session, now, now],
        },
        {
          sql: "INSERT INTO auth_verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('auth-canary-verification', 'canary', ?, ?, ?, ?)",
          args: [canaries.verification, now + 60_000, now, now],
        },
      ],
      "write",
    )

    const serialized = JSON.stringify(await readOwnerDashboard(connection, now))

    for (const canary of Object.values(canaries)) {
      assert.equal(serialized.includes(canary), false)
    }
  })
})

describe("owner dashboard loader", () => {
  it("authorizes before any owner query", async () => {
    let wasRead = false
    const load = createOwnerDashboardLoader({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      readDashboard: async () => {
        wasRead = true
        return {
          overall: {
            condition: "unknown",
            coverage: "none",
            hasActiveMaintenance: false,
          },
          asOf: 0,
          components: [],
        }
      },
    })

    await assert.rejects(load(), /unauthorized/)
    assert.equal(wasRead, false)
  })
})
