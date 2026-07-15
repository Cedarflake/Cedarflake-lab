import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createAdminActionFailureState,
  initialAdminActionState,
} from "../../src/lib/forms/admin-action-state"

describe("admin action state", () => {
  it("starts idle without feedback", () => {
    assert.deepEqual(initialAdminActionState, {
      kind: "idle",
      message: "",
    })
  })

  it("builds distinct recoverable failure states", () => {
    assert.deepEqual(createAdminActionFailureState("reauth_required"), {
      kind: "reauth_required",
      message: "Your owner session is no longer valid.",
    })
    assert.deepEqual(createAdminActionFailureState("conflict"), {
      kind: "conflict",
      message: "The data changed while this form was open.",
    })
    assert.deepEqual(createAdminActionFailureState("error"), {
      kind: "error",
      message: "Review the submitted values and try again.",
    })
  })
})
