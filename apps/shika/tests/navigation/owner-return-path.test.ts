import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeOwnerReturnPath } from "../../src/lib/navigation/owner-return-path"

describe("owner return paths", () => {
  it("accepts only the local admin route", () => {
    assert.equal(normalizeOwnerReturnPath("/admin"), "/admin")
  })

  it("rejects external and ambiguous redirects", () => {
    for (const value of [
      "https://example.com/admin",
      "//example.com/admin",
      "/admin/other",
      "/admin?notice=ready",
      "/admin\\example.com",
      "/login",
      ["/admin"],
      undefined,
    ]) {
      assert.equal(normalizeOwnerReturnPath(value), "/admin")
    }
  })
})
