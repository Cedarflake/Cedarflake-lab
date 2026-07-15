import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DomainRuleError } from "../../src/domain/errors"
import { pageOwnerTimeline } from "../../src/domain/owner-timeline"

describe("owner timeline pagination", () => {
  it("keeps the first-page owner ordinal upper bound", () => {
    const first = pageOwnerTimeline({
      entries: [
        { ownerOrdinal: 1, id: "first" },
        { ownerOrdinal: 3, id: "second" },
        { ownerOrdinal: 5, id: "third" },
      ],
      limit: 2,
      latestOwnerOrdinal: 8,
      cursor: null,
    })

    assert.deepEqual(
      first.entries.map((entry) => entry.id),
      ["third", "second"],
    )
    assert.deepEqual(first.nextCursor, {
      version: 1,
      asOfOwnerOrdinal: 8,
      lastOwnerOrdinal: 3,
    })

    const second = pageOwnerTimeline({
      entries: [
        { ownerOrdinal: 1, id: "first" },
        { ownerOrdinal: 3, id: "second" },
        { ownerOrdinal: 5, id: "third" },
        { ownerOrdinal: 9, id: "new-after-page-one" },
      ],
      limit: 2,
      latestOwnerOrdinal: 9,
      cursor: first.nextCursor,
    })

    assert.deepEqual(
      second.entries.map((entry) => entry.id),
      ["first"],
    )
    assert.equal(second.nextCursor, null)
  })

  it("allows gaps consumed by non-source owner audit events", () => {
    const page = pageOwnerTimeline({
      entries: [
        { ownerOrdinal: 2 },
        { ownerOrdinal: 7 },
        { ownerOrdinal: 11 },
      ],
      limit: 10,
      latestOwnerOrdinal: 14,
      cursor: null,
    })

    assert.deepEqual(
      page.entries.map((entry) => entry.ownerOrdinal),
      [11, 7, 2],
    )
  })

  it("fails closed when two owner sources reuse one ordinal", () => {
    assert.throws(
      () =>
        pageOwnerTimeline({
          entries: [{ ownerOrdinal: 4 }, { ownerOrdinal: 4 }],
          limit: 10,
          latestOwnerOrdinal: 4,
          cursor: null,
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "DUPLICATE_OWNER_TIMELINE_ORDINAL",
    )
  })

  it("rejects invalid limits and cursor bounds", () => {
    assert.throws(
      () =>
        pageOwnerTimeline({
          entries: [],
          limit: 0,
          latestOwnerOrdinal: 0,
          cursor: null,
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "INVALID_OWNER_TIMELINE_LIMIT",
    )
    assert.throws(
      () =>
        pageOwnerTimeline({
          entries: [],
          limit: 10,
          latestOwnerOrdinal: 4,
          cursor: {
            version: 1,
            asOfOwnerOrdinal: 5,
            lastOwnerOrdinal: null,
          },
        }),
      (error: unknown) =>
        error instanceof DomainRuleError &&
        error.code === "INVALID_OWNER_TIMELINE_CURSOR",
    )
  })
})
