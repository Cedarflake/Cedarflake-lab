import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import {
  CommandConflictError,
  CommandValidationError,
  IdempotencyConflictError,
} from "../../src/lib/commands/errors"
import {
  closeSiteProfilePublicationForOwner,
  publishSiteProfileForOwner,
} from "../../src/lib/commands/site-profile-publication"
import { saveSiteProfileForOwner } from "../../src/lib/commands/site-profile"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

function initialProfileInput(idempotencyKey = crypto.randomUUID()) {
  return {
    idempotencyKey,
    expectedSiteProfileVersion: 0,
    ownerTitle: "Owner-only identity",
    ownerSummary: "Owner-only profile summary",
    publicDraft: {
      title: "Crystal status",
      summary: "A concise public status page",
    },
    timezone: "Asia/Shanghai" as const,
    privateNote: "Owner-only profile note",
  }
}

async function readMutationState(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    SELECT
      (SELECT version FROM site_profile WHERE id = 'site') AS profile_version,
      (SELECT count(*) FROM site_profile_revisions WHERE site_profile_id = 'site') AS revisions,
      (SELECT count(*) FROM publication_events WHERE stream_type = 'site_profile' AND stream_id = 'site') AS publications,
      (SELECT owner_ordinal FROM timeline_clock WHERE id = 1) AS owner_ordinal,
      (SELECT public_ordinal FROM timeline_clock WHERE id = 1) AS public_ordinal,
      (SELECT public_privacy_epoch FROM timeline_clock WHERE id = 1) AS public_privacy_epoch,
      (SELECT count(*) FROM command_receipts) AS receipts
  `)
  return result.rows[0]
}

async function readLatestSourceActions(connection: DatabaseConnection) {
  const result = await connection.client.execute(`
    WITH ranked AS (
      SELECT
        target_source_id,
        action,
        row_number() OVER (
          PARTITION BY target_source_id
          ORDER BY publication_version DESC, id DESC
        ) AS rank
      FROM publication_events
      WHERE stream_type = 'site_profile' AND stream_id = 'site'
    )
    SELECT target_source_id, action
    FROM ranked
    WHERE rank = 1
    ORDER BY target_source_id
  `)
  return result.rows
}

describe("site profile commands", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("initializes the singleton with immutable replay and no public allocation", async () => {
    const input = initialProfileInput()
    const first = await saveSiteProfileForOwner(connection, owner, input)
    const replay = await saveSiteProfileForOwner(connection, owner, input)
    const revision = await connection.client.execute(
      "SELECT site_profile_version, owner_title, owner_summary, public_title, public_summary, timezone, private_note FROM site_profile_revisions WHERE site_profile_id = 'site'",
    )
    const receipt = await connection.client.execute(
      "SELECT response_body_json, response_expires_at FROM command_receipts WHERE action = 'save_site_profile'",
    )

    assert.deepEqual(replay, first)
    assert.equal(first.siteProfileVersion, 1)
    assert.equal(first.revisionVersion, 1)
    assert.deepEqual(revision.rows[0], {
      site_profile_version: 1,
      owner_title: input.ownerTitle,
      owner_summary: input.ownerSummary,
      public_title: input.publicDraft.title,
      public_summary: input.publicDraft.summary,
      timezone: "Asia/Shanghai",
      private_note: input.privateNote,
    })
    assert.deepEqual(await readMutationState(connection), {
      profile_version: 1,
      revisions: 1,
      publications: 0,
      owner_ordinal: 0,
      public_ordinal: 0,
      public_privacy_epoch: 0,
      receipts: 1,
    })
    assert.deepEqual(receipt.rows[0], {
      response_body_json: null,
      response_expires_at: null,
    })

    await assert.rejects(
      saveSiteProfileForOwner(connection, owner, {
        ...input,
        ownerTitle: "A conflicting retry",
      }),
      IdempotencyConflictError,
    )
    await assert.rejects(
      saveSiteProfileForOwner(connection, owner, initialProfileInput()),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "SITE_PROFILE_VERSION_CONFLICT",
    )
    assert.equal((await readMutationState(connection))?.receipts, 1)
  })

  it("publishes only the selected public snapshot and keeps the root stable", async () => {
    const saved = await saveSiteProfileForOwner(
      connection,
      owner,
      initialProfileInput(),
    )
    const input = {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 0,
      revisionId: saved.revisionId,
      expectedRevisionVersion: saved.revisionVersion,
    }
    const first = await publishSiteProfileForOwner(connection, owner, input)
    const replay = await publishSiteProfileForOwner(connection, owner, input)
    const publication = await connection.client.execute(
      "SELECT target_source_id, target_source_revision, target_snapshot_json, resulting_current_snapshot_json, resulting_disposition, timeline_entry_id, timeline_snapshot_json FROM publication_events WHERE stream_type = 'site_profile'",
    )
    const serialized = JSON.stringify(publication.rows[0])

    assert.deepEqual(replay, first)
    assert.deepEqual(first, {
      siteProfileVersion: 1,
      revisionId: saved.revisionId,
      revisionVersion: 1,
      publicationVersion: 1,
      publicPrivacyEpoch: 0,
    })
    assert.equal(publication.rows[0]?.target_source_id, saved.revisionId)
    assert.equal(publication.rows[0]?.target_source_revision, 1)
    assert.equal(publication.rows[0]?.resulting_disposition, "published")
    assert.equal(publication.rows[0]?.timeline_entry_id, null)
    assert.equal(publication.rows[0]?.timeline_snapshot_json, null)
    assert.deepEqual(
      JSON.parse(String(publication.rows[0]?.target_snapshot_json)),
      {
        schemaVersion: 1,
        title: "Crystal status",
        summary: "A concise public status page",
        timezone: "Asia/Shanghai",
      },
    )
    assert.equal(
      publication.rows[0]?.target_snapshot_json,
      publication.rows[0]?.resulting_current_snapshot_json,
    )
    assert.equal(serialized.includes("Owner-only identity"), false)
    assert.equal(serialized.includes("Owner-only profile summary"), false)
    assert.equal(serialized.includes("Owner-only profile note"), false)
    assert.deepEqual(await readMutationState(connection), {
      profile_version: 1,
      revisions: 1,
      publications: 1,
      owner_ordinal: 1,
      public_ordinal: 1,
      public_privacy_epoch: 0,
      receipts: 2,
    })

    await assert.rejects(
      publishSiteProfileForOwner(connection, owner, {
        ...input,
        idempotencyKey: crypto.randomUUID(),
        expectedPublicationVersion: 1,
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_UNCHANGED",
    )
    assert.equal((await readMutationState(connection))?.publications, 1)
  })

  it("keeps public bytes unchanged across private saves until explicit publish", async () => {
    const firstRevision = await saveSiteProfileForOwner(
      connection,
      owner,
      initialProfileInput(),
    )
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 0,
      revisionId: firstRevision.revisionId,
      expectedRevisionVersion: 1,
    })
    const before = await connection.client.execute(
      "SELECT publication_version, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'site_profile' ORDER BY publication_version DESC LIMIT 1",
    )
    const secondRevision = await saveSiteProfileForOwner(connection, owner, {
      ...initialProfileInput(),
      expectedSiteProfileVersion: 1,
      ownerTitle: "New owner-only identity",
      ownerSummary: "New owner-only summary",
      publicDraft: {
        title: "Updated public status",
        summary: "Updated public summary",
      },
      privateNote: "New owner-only note",
    })
    const afterSave = await connection.client.execute(
      "SELECT publication_version, resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'site_profile' ORDER BY publication_version DESC LIMIT 1",
    )

    assert.deepEqual(afterSave.rows[0], before.rows[0])
    assert.deepEqual(await readMutationState(connection), {
      profile_version: 2,
      revisions: 2,
      publications: 1,
      owner_ordinal: 1,
      public_ordinal: 1,
      public_privacy_epoch: 0,
      receipts: 3,
    })

    const published = await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 2,
      expectedPublicationVersion: 1,
      revisionId: secondRevision.revisionId,
      expectedRevisionVersion: 2,
    })
    const latest = await connection.client.execute(
      "SELECT resulting_current_snapshot_json FROM publication_events WHERE stream_type = 'site_profile' ORDER BY publication_version DESC LIMIT 1",
    )

    assert.equal(published.siteProfileVersion, 2)
    assert.equal(published.publicationVersion, 2)
    assert.deepEqual(
      JSON.parse(String(latest.rows[0]?.resulting_current_snapshot_json)),
      {
        schemaVersion: 1,
        title: "Updated public status",
        summary: "Updated public summary",
        timezone: "Asia/Shanghai",
      },
    )
  })

  it("supports withdrawal and republish while terminalizing redacted sources", async () => {
    const saved = await saveSiteProfileForOwner(
      connection,
      owner,
      initialProfileInput(),
    )
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 0,
      revisionId: saved.revisionId,
      expectedRevisionVersion: 1,
    })
    const withdrawInput = {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 1,
      action: "withdraw" as const,
    }
    const withdrawn = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      withdrawInput,
    )
    const replay = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      withdrawInput,
    )

    assert.deepEqual(replay, withdrawn)
    assert.equal(withdrawn.publicationVersion, 2)
    assert.equal(withdrawn.publicPrivacyEpoch, 0)

    const republished = await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 2,
      revisionId: saved.revisionId,
      expectedRevisionVersion: 1,
    })
    assert.equal(republished.publicationVersion, 3)

    const redacted = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 3,
        action: "redact",
      },
    )
    assert.equal(redacted.publicationVersion, 4)
    assert.equal(redacted.publicPrivacyEpoch, 1)

    await assert.rejects(
      publishSiteProfileForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 4,
        revisionId: saved.revisionId,
        expectedRevisionVersion: 1,
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_TERMINAL",
    )

    const suppressed = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 4,
        action: "suppress",
      },
    )
    const events = await connection.client.execute(
      "SELECT action, target_snapshot_json, resulting_disposition FROM publication_events WHERE stream_type = 'site_profile' ORDER BY publication_version",
    )

    assert.equal(suppressed.publicationVersion, 5)
    assert.equal(suppressed.publicPrivacyEpoch, 2)
    assert.deepEqual(
      events.rows.map((row) => String(row.action)),
      ["publish", "withdraw", "publish", "redact", "suppress"],
    )
    assert.equal(events.rows[4]?.target_snapshot_json, null)
    assert.equal(
      events.rows.every(
        (row, index) =>
          index === 0 || index === 2 || row.resulting_disposition === "closed",
      ),
      true,
    )
    assert.deepEqual(await readLatestSourceActions(connection), [
      { target_source_id: saved.revisionId, action: "suppress" },
    ])
    assert.equal((await readMutationState(connection))?.public_privacy_epoch, 2)

    await assert.rejects(
      closeSiteProfilePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 5,
        action: "suppress",
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "PUBLICATION_TERMINAL",
    )
  })

  it("closes every eligible source in one privacy epoch and permits a new revision", async () => {
    const firstRevision = await saveSiteProfileForOwner(
      connection,
      owner,
      initialProfileInput(),
    )
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 0,
      revisionId: firstRevision.revisionId,
      expectedRevisionVersion: 1,
    })
    const secondRevision = await saveSiteProfileForOwner(connection, owner, {
      ...initialProfileInput(),
      expectedSiteProfileVersion: 1,
      publicDraft: {
        title: "Second public revision",
        summary: "Second public summary",
      },
    })
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 2,
      expectedPublicationVersion: 1,
      revisionId: secondRevision.revisionId,
      expectedRevisionVersion: 2,
    })

    const redacted = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 2,
        expectedPublicationVersion: 2,
        action: "redact",
      },
    )
    assert.equal(redacted.publicationVersion, 4)
    assert.equal(redacted.publicPrivacyEpoch, 1)
    assert.equal(
      (await readLatestSourceActions(connection)).every(
        (row) => row.action === "redact",
      ),
      true,
    )
    assert.deepEqual(await readMutationState(connection), {
      profile_version: 2,
      revisions: 2,
      publications: 4,
      owner_ordinal: 4,
      public_ordinal: 4,
      public_privacy_epoch: 1,
      receipts: 5,
    })

    const thirdRevision = await saveSiteProfileForOwner(connection, owner, {
      ...initialProfileInput(),
      expectedSiteProfileVersion: 2,
      publicDraft: {
        title: "Corrected public revision",
        summary: "Corrected public summary",
      },
    })
    const republished = await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 3,
      expectedPublicationVersion: 4,
      revisionId: thirdRevision.revisionId,
      expectedRevisionVersion: 3,
    })
    assert.equal(republished.publicationVersion, 5)

    const suppressed = await closeSiteProfilePublicationForOwner(
      connection,
      owner,
      {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 3,
        expectedPublicationVersion: 5,
        action: "suppress",
      },
    )
    const sources = await readLatestSourceActions(connection)

    assert.equal(suppressed.publicationVersion, 8)
    assert.equal(suppressed.publicPrivacyEpoch, 2)
    assert.equal(sources.length, 3)
    assert.equal(sources.every((row) => row.action === "suppress"), true)
    assert.deepEqual(await readMutationState(connection), {
      profile_version: 3,
      revisions: 3,
      publications: 8,
      owner_ordinal: 8,
      public_ordinal: 8,
      public_privacy_epoch: 2,
      receipts: 8,
    })
  })

  it("rolls back stale guards and fails closed for corrupt public snapshots", async () => {
    const saved = await saveSiteProfileForOwner(
      connection,
      owner,
      initialProfileInput(),
    )
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 1,
      expectedPublicationVersion: 0,
      revisionId: saved.revisionId,
      expectedRevisionVersion: 1,
    })
    const before = await readMutationState(connection)

    await assert.rejects(
      closeSiteProfilePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 2,
        expectedPublicationVersion: 1,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "SITE_PROFILE_VERSION_CONFLICT",
    )
    await assert.rejects(
      closeSiteProfilePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 2,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "SITE_PROFILE_PUBLICATION_VERSION_CONFLICT",
    )
    await assert.rejects(
      publishSiteProfileForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 1,
        revisionId: saved.revisionId,
        expectedRevisionVersion: 2,
      }),
      (error: unknown) =>
        error instanceof CommandConflictError &&
        error.code === "SITE_PROFILE_REVISION_VERSION_CONFLICT",
    )
    assert.deepEqual(await readMutationState(connection), before)

    await connection.client.execute(
      "UPDATE publication_events SET target_snapshot_json = '{\"schemaVersion\":1,\"title\":\"\",\"summary\":null,\"timezone\":\"Asia/Shanghai\"}' WHERE stream_type = 'site_profile' AND publication_version = 1",
    )
    await assert.rejects(
      closeSiteProfilePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: 1,
        expectedPublicationVersion: 1,
        action: "withdraw",
      }),
      (error: unknown) =>
        error instanceof CommandValidationError &&
        error.code === "INVALID_PUBLIC_SNAPSHOT",
    )
    const afterCorruption = await readMutationState(connection)
    assert.equal(afterCorruption?.publications, before?.publications)
    assert.equal(afterCorruption?.owner_ordinal, before?.owner_ordinal)
    assert.equal(afterCorruption?.public_ordinal, before?.public_ordinal)
    assert.equal(afterCorruption?.receipts, before?.receipts)
  })
})
