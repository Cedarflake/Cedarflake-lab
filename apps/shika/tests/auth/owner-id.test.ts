import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createOwnerKey,
  isOwnerGitHubAccount,
  normalizeGitHubOwnerId,
} from "../../src/lib/auth/owner-id"

describe("GitHub owner identity", () => {
  it("keeps numeric IDs as exact decimal strings", () => {
    const id = "900719925474099312345"

    assert.equal(normalizeGitHubOwnerId(id), id)
    assert.equal(createOwnerKey(id), `github:${id}`)
  })

  it("rejects noncanonical IDs instead of normalizing through Number", () => {
    for (const id of ["0", "01", "-1", "+1", "1.0", "owner", " 1"]) {
      assert.throws(() => normalizeGitHubOwnerId(id))
    }
  })

  it("authorizes only the exact GitHub provider tuple", () => {
    assert.equal(isOwnerGitHubAccount("github", "123", "123"), true)
    assert.equal(isOwnerGitHubAccount("gitlab", "123", "123"), false)
    assert.equal(isOwnerGitHubAccount("github", "124", "123"), false)
    assert.equal(isOwnerGitHubAccount("github", "not-numeric", "123"), false)
  })
})
