import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  advancePublicTimelineClock,
  pagePublicTimeline,
  type PublicTimelineEntry,
} from "../../src/domain/timeline"

const entries: PublicTimelineEntry[] = [
  {
    publicEntryId: "entry-1",
    publicOrdinal: 1,
    effectiveAt: 100,
    recordedAt: 100,
    summary: "First",
  },
  {
    publicEntryId: "entry-2",
    publicOrdinal: 2,
    effectiveAt: 200,
    recordedAt: 200,
    summary: "Second",
  },
  {
    publicEntryId: "entry-3",
    publicOrdinal: 3,
    effectiveAt: 150,
    recordedAt: 300,
    summary: "Backdated",
  },
]

describe("public timeline pagination", () => {
  it("keeps one snapshot upper bound across pages", () => {
    const first = pagePublicTimeline({
      entries,
      limit: 2,
      latestPublicOrdinal: 3,
      currentPrivacyEpoch: 1,
      cursor: null,
    })

    assert.equal(first.kind, "page")
    if (first.kind !== "page") return

    assert.deepEqual(first.entries.map((entry) => entry.publicEntryId), [
      "entry-2",
      "entry-3",
    ])

    const second = pagePublicTimeline({
      entries: [
        ...entries,
        {
          publicEntryId: "entry-4",
          publicOrdinal: 4,
          effectiveAt: 400,
          recordedAt: 400,
          summary: "New after page one",
        },
      ],
      limit: 2,
      latestPublicOrdinal: 4,
      currentPrivacyEpoch: 1,
      cursor: first.nextCursor,
    })

    assert.equal(second.kind, "page")
    if (second.kind !== "page") return

    assert.deepEqual(
      second.entries.map((entry) => entry.publicEntryId),
      ["entry-1"],
    )
    assert.equal(second.nextCursor, null)
  })

  it("returns no data when a privacy epoch is stale", () => {
    assert.deepEqual(
      pagePublicTimeline({
        entries,
        limit: 10,
        latestPublicOrdinal: 3,
        currentPrivacyEpoch: 2,
        cursor: {
          version: 1,
          asOfPublicOrdinal: 3,
          privacyEpoch: 1,
          last: null,
        },
      }),
      { kind: "reset", entries: [], nextCursor: null },
    )
  })

  it("does not expose gaps caused by private-only activity", () => {
    const page = pagePublicTimeline({
      entries,
      limit: 10,
      latestPublicOrdinal: 3,
      currentPrivacyEpoch: 1,
      cursor: null,
    })

    assert.equal(page.kind, "page")
    if (page.kind !== "page") return

    assert.deepEqual(
      page.entries.map((entry) => entry.publicOrdinal),
      [2, 3, 1],
    )
  })

  it("advances public ordinals without exposing private activity", () => {
    const initial = { publicOrdinal: 4, privacyEpoch: 2 }

    assert.deepEqual(advancePublicTimelineClock(initial, "private"), initial)
    assert.deepEqual(advancePublicTimelineClock(initial, "publish"), {
      publicOrdinal: 5,
      privacyEpoch: 2,
    })
    assert.deepEqual(advancePublicTimelineClock(initial, "withdraw"), {
      publicOrdinal: 5,
      privacyEpoch: 2,
    })
  })

  it("invalidates every stale cursor after privacy closure", () => {
    assert.deepEqual(advancePublicTimelineClock(
      { publicOrdinal: 4, privacyEpoch: 2 },
      "redact",
    ), {
      publicOrdinal: 5,
      privacyEpoch: 3,
    })
    assert.deepEqual(advancePublicTimelineClock(
      { publicOrdinal: 4, privacyEpoch: 2 },
      "suppress",
    ), {
      publicOrdinal: 5,
      privacyEpoch: 3,
    })
  })

  it("fails closed on impossible cursor bounds", () => {
    assert.throws(() =>
      pagePublicTimeline({
        entries,
        limit: 10,
        latestPublicOrdinal: 3,
        currentPrivacyEpoch: 1,
        cursor: {
          version: 1,
          asOfPublicOrdinal: 4,
          privacyEpoch: 1,
          last: null,
        },
      }),
    )
  })
})
