import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createOwnerComponentPrivacyLoader } from "../../src/lib/data/owner-component-privacy-loader"

describe("owner component privacy loader", () => {
  it("authorizes before reading owner-only dependency details", async () => {
    let wasRead = false
    const load = createOwnerComponentPrivacyLoader({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      readReview: async () => {
        wasRead = true
        return null
      },
    })

    await assert.rejects(load("component-id"), /unauthorized/)
    assert.equal(wasRead, false)
  })
})
