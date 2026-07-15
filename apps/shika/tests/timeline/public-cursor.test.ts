import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createPublicCursorCodec,
  PublicCursorConfigurationError,
  PublicCursorError,
} from "../../src/lib/timeline/public-cursor"

const primaryKey = "primary-public-cursor-test-key-0001"
const secondaryKey = "secondary-public-cursor-test-key-02"

describe("public timeline cursor", () => {
  it("round-trips the complete stable order key", () => {
    const codec = createPublicCursorCodec(primaryKey)
    const cursor = {
      version: 1 as const,
      asOfPublicOrdinal: 42,
      privacyEpoch: 3,
      last: {
        effectiveAt: 1_000,
        recordedAt: 2_000,
        publicOrdinal: 40,
        publicEntryId: "entry-40",
      },
    }

    assert.deepEqual(codec.decode(codec.encode(cursor)), cursor)
  })

  it("rejects payload tampering and a different key", () => {
    const codec = createPublicCursorCodec(primaryKey)
    const otherCodec = createPublicCursorCodec(secondaryKey)
    const encoded = codec.encode({
      version: 1,
      asOfPublicOrdinal: 8,
      privacyEpoch: 2,
      last: null,
    })
    const [payload, signature] = encoded.split(".")
    assert.ok(payload)
    assert.ok(signature)
    const first = payload[0]
    assert.ok(first)
    const tamperedPayload = `${first === "A" ? "B" : "A"}${payload.slice(1)}`

    assert.throws(
      () => codec.decode(`${tamperedPayload}.${signature}`),
      PublicCursorError,
    )
    assert.throws(() => otherCodec.decode(encoded), PublicCursorError)
  })

  it("rejects malformed cursors and impossible bounds", () => {
    const codec = createPublicCursorCodec(primaryKey)

    assert.throws(() => codec.decode(""), PublicCursorError)
    assert.throws(() => codec.decode("not-a-cursor"), PublicCursorError)
    assert.throws(
      () =>
        codec.encode({
          version: 1,
          asOfPublicOrdinal: 2,
          privacyEpoch: 0,
          last: {
            effectiveAt: 1,
            recordedAt: 1,
            publicOrdinal: 3,
            publicEntryId: "entry-3",
          },
        }),
      PublicCursorError,
    )
  })

  it("requires at least 256 bits of key material", () => {
    assert.throws(
      () => createPublicCursorCodec("too-short"),
      PublicCursorConfigurationError,
    )
  })
})
