import assert from "node:assert/strict"
import test from "node:test"

import {
  isTrustedSkipRequest,
  isTrustedSkipResponse,
  TRUSTED_SKIP_MESSAGE_TYPE,
} from "../src/chromium/messages.ts"

test("trusted skip requests require finite non-negative coordinates", () => {
  assert.equal(
    isTrustedSkipRequest({
      type: TRUSTED_SKIP_MESSAGE_TYPE,
      x: 120.5,
      y: 80,
    }),
    true,
  )
  assert.equal(
    isTrustedSkipRequest({
      type: TRUSTED_SKIP_MESSAGE_TYPE,
      x: -1,
      y: 80,
    }),
    false,
  )
  assert.equal(
    isTrustedSkipRequest({
      type: TRUSTED_SKIP_MESSAGE_TYPE,
      x: Number.NaN,
      y: 80,
    }),
    false,
  )
  assert.equal(
    isTrustedSkipRequest({ type: "unexpected", x: 120, y: 80 }),
    false,
  )
})

test("trusted skip responses require an explicit outcome", () => {
  assert.equal(isTrustedSkipResponse({ ok: true }), true)
  assert.equal(isTrustedSkipResponse({ ok: false, error: "blocked" }), true)
  assert.equal(isTrustedSkipResponse({ error: "blocked" }), false)
})
