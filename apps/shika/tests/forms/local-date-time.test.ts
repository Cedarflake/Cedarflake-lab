import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveUtcDateTimeSubmission } from "../../src/lib/forms/local-date-time"

describe("UTC datetime-local submission", () => {
  it("preserves an epoch value captured by JavaScript", () => {
    assert.equal(
      resolveUtcDateTimeSubmission("1772236800000", "invalid", "Asia/Shanghai"),
      "1772236800000",
    )
  })

  it("accepts a valid UTC leap-day fallback", () => {
    assert.equal(
      resolveUtcDateTimeSubmission("", "2028-02-29T10:15", "UTC"),
      String(Date.UTC(2028, 1, 29, 10, 15)),
    )
  })

  it("rejects normalized dates and invalid hours", () => {
    assert.equal(
      resolveUtcDateTimeSubmission("", "2026-02-30T10:00", "UTC"),
      "",
    )
    assert.equal(
      resolveUtcDateTimeSubmission("", "2026-01-01T24:00", "UTC"),
      "",
    )
  })

  it("rejects a local fallback when the submitted timezone is not UTC", () => {
    assert.equal(
      resolveUtcDateTimeSubmission("", "2026-01-01T10:00", "Asia/Shanghai"),
      "",
    )
  })
})
