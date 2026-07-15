import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { publishSiteProfileForOwner } from "../../src/lib/commands/site-profile-publication"
import { saveSiteProfileForOwner } from "../../src/lib/commands/site-profile"
import { createOwnerSiteProfileLoader } from "../../src/lib/data/owner-site-profile-loader"
import {
  OwnerSiteProfileDataIntegrityError,
  readOwnerSiteProfile,
} from "../../src/lib/data/owner-site-profile-repository"
import type { DatabaseConnection } from "../../src/lib/db/create-database"
import { createMigratedTestDatabase } from "../db/helpers"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

async function savePublicDraft(connection: DatabaseConnection) {
  return saveSiteProfileForOwner(connection, owner, {
    idempotencyKey: crypto.randomUUID(),
    expectedSiteProfileVersion: 0,
    ownerTitle: "Private owner title",
    ownerSummary: "Private owner summary",
    publicDraft: {
      title: "Shika status",
      summary: "A quiet public status page",
    },
    timezone: "Asia/Shanghai",
    privateNote: "Private owner note",
  })
}

describe("owner site profile repository", () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    connection = await createMigratedTestDatabase()
  })

  afterEach(() => connection.client.close())

  it("treats an uninitialized site profile as valid empty state", async () => {
    assert.equal(await readOwnerSiteProfile(connection), null)
  })

  it("returns the current owner revision and published snapshot separately", async () => {
    const firstRevision = await savePublicDraft(connection)
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: firstRevision.siteProfileVersion,
      expectedPublicationVersion: 0,
      revisionId: firstRevision.revisionId,
      expectedRevisionVersion: firstRevision.revisionVersion,
    })
    await saveSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: firstRevision.siteProfileVersion,
      ownerTitle: "New private owner title",
      ownerSummary: "New private owner summary",
      publicDraft: {
        title: "Unpublished public title",
        summary: "Unpublished public summary",
      },
      timezone: "Asia/Shanghai",
      privateNote: "New private owner note",
    })

    const profile = await readOwnerSiteProfile(connection)

    assert.equal(profile?.version, 2)
    assert.equal(profile?.revision.ownerTitle, "New private owner title")
    assert.equal(profile?.revision.privateNote, "New private owner note")
    assert.deepEqual(profile?.revision.publicDraft, {
      title: "Unpublished public title",
      summary: "Unpublished public summary",
    })
    assert.deepEqual(profile?.publication.currentSource, {
      sourceId: firstRevision.revisionId,
      sourceRevision: firstRevision.revisionVersion,
      snapshot: {
        schemaVersion: 1,
        title: "Shika status",
        summary: "A quiet public status page",
        timezone: "Asia/Shanghai",
      },
    })
  })

  it("fails closed when the current owner revision is incomplete", async () => {
    await connection.client.execute(
      "INSERT INTO site_profile (id, version, created_at, updated_at) VALUES ('site', 1, 1, 1)",
    )

    await assert.rejects(
      readOwnerSiteProfile(connection),
      OwnerSiteProfileDataIntegrityError,
    )
  })

  it("fails closed when the published snapshot is invalid", async () => {
    const revision = await savePublicDraft(connection)
    await publishSiteProfileForOwner(connection, owner, {
      idempotencyKey: crypto.randomUUID(),
      expectedSiteProfileVersion: revision.siteProfileVersion,
      expectedPublicationVersion: 0,
      revisionId: revision.revisionId,
      expectedRevisionVersion: revision.revisionVersion,
    })
    await connection.client.execute(
      "UPDATE publication_events SET resulting_current_snapshot_json = '{\"unexpected\":true}' WHERE stream_type = 'site_profile'",
    )

    await assert.rejects(
      readOwnerSiteProfile(connection),
      OwnerSiteProfileDataIntegrityError,
    )
  })
})

describe("owner site profile loader", () => {
  it("authorizes before reading owner data", async () => {
    const events: string[] = []
    const load = createOwnerSiteProfileLoader({
      authorize: async () => {
        events.push("authorize")
      },
      readProfile: async () => {
        events.push("read")
        return null
      },
    })

    await load()

    assert.deepEqual(events, ["authorize", "read"])
  })

  it("does not read owner data when authorization fails", async () => {
    let wasRead = false
    const load = createOwnerSiteProfileLoader({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      readProfile: async () => {
        wasRead = true
        return null
      },
    })

    await assert.rejects(load(), /unauthorized/)
    assert.equal(wasRead, false)
  })
})
