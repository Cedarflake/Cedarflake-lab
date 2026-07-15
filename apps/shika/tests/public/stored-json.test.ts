import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { z } from "zod"

import { parseStoredJson } from "../../src/lib/public/stored-json"

class StoredFixtureError extends Error {}

const createError = () => new StoredFixtureError()

describe("stored JSON", () => {
  it("returns strictly validated data", () => {
    const schema = z.object({ version: z.literal(1) }).strict()

    assert.deepEqual(
      parseStoredJson(schema, '{"version":1}', createError),
      { version: 1 },
    )
  })

  it("fails closed for malformed, invalid, and non-string values", () => {
    const schema = z.object({ version: z.literal(1) }).strict()

    for (const value of [
      "{",
      '{"version":2}',
      '{"version":1,"private":"canary"}',
      { version: 1 },
      null,
    ]) {
      assert.throws(
        () => parseStoredJson(schema, value, createError),
        StoredFixtureError,
      )
    }
  })
})
