import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import {
  closeSiteProfilePublicationForOwner,
  publishSiteProfileForOwner,
} from "../../src/lib/commands/site-profile-publication"
import { saveSiteProfileForOwner } from "../../src/lib/commands/site-profile"
import {
  PublicSiteProfileDataIntegrityError,
  readPublicSiteProfile,
} from "../../src/lib/data/public-site-profile-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function createPublishedProfile(connection: DatabaseConnection) {
  const revision = await saveSiteProfileForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    expectedSiteProfileVersion: 0,
    ownerTitle: "PRIVATE OWNER TITLE CANARY",
    ownerSummary: "PRIVATE OWNER SUMMARY CANARY",
    publicDraft: {
      title: "Shika status",
      summary: "A quiet public status page",
    },
    timezone: "Asia/Shanghai",
    privateNote: "PRIVATE OWNER NOTE CANARY",
  })
  const publication = await publishSiteProfileForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    expectedSiteProfileVersion: revision.siteProfileVersion,
    expectedPublicationVersion: 0,
    revisionId: revision.revisionId,
    expectedRevisionVersion: revision.revisionVersion,
  })

  return { revision, publication }
}

describe("public site profile repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("returns null before the site profile is published", async () => {
    assert.equal(await readPublicSiteProfile(connection), null)

    await saveSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: 0,
      ownerTitle: "Private title",
      ownerSummary: null,
      publicDraft: null,
      timezone: "Asia/Shanghai",
      privateNote: null,
    })

    assert.equal(await readPublicSiteProfile(connection), null)
  })

  it("returns only the immutable published snapshot", async () => {
    const { revision } = await createPublishedProfile(connection)
    const before = JSON.stringify(await readPublicSiteProfile(connection))
    await connection.client.execute({
      sql: "UPDATE site_profile_revisions SET owner_title = ?, owner_summary = ?, public_title = ?, public_summary = ?, private_note = ? WHERE id = ?",
      args: [
        "MUTATED PRIVATE TITLE",
        "MUTATED PRIVATE SUMMARY",
        "MUTATED PUBLIC TITLE",
        "MUTATED PUBLIC SUMMARY",
        "MUTATED PRIVATE NOTE",
        revision.revisionId,
      ],
    })
    const after = JSON.stringify(await readPublicSiteProfile(connection))

    assert.equal(after, before)
    assert.deepEqual(JSON.parse(after) as unknown, {
      schemaVersion: 1,
      title: "Shika status",
      summary: "A quiet public status page",
      timezone: "Asia/Shanghai",
    })
    for (const canary of [
      revision.revisionId,
      "PRIVATE OWNER TITLE CANARY",
      "PRIVATE OWNER SUMMARY CANARY",
      "PRIVATE OWNER NOTE CANARY",
      "MUTATED PRIVATE TITLE",
      "MUTATED PRIVATE SUMMARY",
      "MUTATED PUBLIC TITLE",
      "MUTATED PUBLIC SUMMARY",
      "MUTATED PRIVATE NOTE",
    ]) {
      assert.equal(after.includes(canary), false)
    }
  })

  for (const action of ["withdraw", "redact", "suppress"] as const) {
    it(`returns null after ${action}`, async () => {
      const { revision, publication } = await createPublishedProfile(connection)
      await closeSiteProfilePublicationForOwner(connection, owner, {
        idempotencyKey: crypto.randomUUID(),
        expectedSiteProfileVersion: revision.siteProfileVersion,
        expectedPublicationVersion: publication.publicationVersion,
        action,
      })

      assert.equal(await readPublicSiteProfile(connection), null)
    })
  }

  it("fails closed when the published snapshot is invalid", async () => {
    await createPublishedProfile(connection)
    await connection.client.execute(
      "UPDATE publication_events SET resulting_current_snapshot_json = '{\"unexpected\":true}' WHERE stream_type = 'site_profile'",
    )

    await assert.rejects(
      readPublicSiteProfile(connection),
      PublicSiteProfileDataIntegrityError,
    )
  })
})
