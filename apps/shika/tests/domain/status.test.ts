import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertValidStatusInterval,
  deriveOverallStatus,
  projectOwnerStatus,
  projectPublicStatus,
  type PublicStatusTransitionCandidate,
  type StatusTransitionCandidate,
} from "../../src/domain/status"

const baseTransition: StatusTransitionCandidate = {
  id: "transition-1",
  condition: "available",
  effectiveAt: 100,
  recordedAt: 100,
  audienceOrdinal: 1,
  validUntil: null,
}

const publicTransition: PublicStatusTransitionCandidate = {
  ...baseTransition,
  publicDisposition: "published",
}

describe("status projection", () => {
  it("does not fall back after the selected public transition expires", () => {
    const projection = projectPublicStatus(
      [
        publicTransition,
        {
          ...publicTransition,
          id: "transition-2",
          condition: "degraded",
          effectiveAt: 200,
          recordedAt: 200,
          audienceOrdinal: 2,
          validUntil: 250,
        },
      ],
      300,
    )

    assert.deepEqual(projection, {
      condition: "unknown",
      effectiveAt: 200,
      validUntil: 250,
      selectedTransitionId: "transition-2",
      unknownReason: "expired",
    })
  })

  it("does not fall back after the selected transition is withdrawn", () => {
    const projection = projectPublicStatus(
      [
        publicTransition,
        {
          ...publicTransition,
          id: "transition-2",
          condition: "unavailable",
          effectiveAt: 200,
          recordedAt: 200,
          audienceOrdinal: 2,
          publicDisposition: "withdrawn",
        },
      ],
      300,
    )

    assert.deepEqual(projection, {
      condition: "unknown",
      effectiveAt: 200,
      validUntil: null,
      selectedTransitionId: "transition-2",
      unknownReason: "withdrawn",
    })
  })

  it("keeps a newer private report out of the visitor projection", () => {
    const ownerTransitions = [
      publicTransition,
      {
        ...baseTransition,
        id: "transition-2",
        condition: "unavailable" as const,
        effectiveAt: 200,
        recordedAt: 200,
        audienceOrdinal: 2,
      },
    ]

    assert.equal(
      projectPublicStatus([publicTransition], 300).condition,
      "available",
    )
    assert.equal(
      projectOwnerStatus(ownerTransitions, 300).condition,
      "unavailable",
    )
  })

  it("uses every stable ordering field", () => {
    const projection = projectOwnerStatus(
      [
        { ...baseTransition, id: "a", condition: "limited" },
        { ...baseTransition, id: "b", condition: "degraded" },
      ],
      300,
    )

    assert.deepEqual(projection, {
      condition: "degraded",
      effectiveAt: 100,
      validUntil: null,
      selectedTransitionId: "b",
      unknownReason: null,
    })
  })

  it("rejects empty and reversed validity intervals", () => {
    assert.throws(
      () => assertValidStatusInterval(100, 100),
      /validUntil must be later than effectiveAt/,
    )
    assert.throws(() => assertValidStatusInterval(100, 99))
    assert.doesNotThrow(() => assertValidStatusInterval(100, 101))
  })
})

describe("overall status", () => {
  it("reports worst fresh condition and partial coverage", () => {
    const fresh = projectOwnerStatus(
      [{ ...baseTransition, condition: "degraded" }],
      200,
    )
    const unknown = projectOwnerStatus([], 200)

    assert.deepEqual(deriveOverallStatus([fresh, unknown], true), {
      condition: "degraded",
      coverage: "partial",
      hasActiveMaintenance: true,
    })
  })

  it("never reports available when every component is unknown", () => {
    const unknown = projectPublicStatus([], 200)

    assert.deepEqual(deriveOverallStatus([unknown], false), {
      condition: "unknown",
      coverage: "none",
      hasActiveMaintenance: false,
    })
  })
})
