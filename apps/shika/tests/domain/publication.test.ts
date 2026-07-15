import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyPublicationCommand } from "../../src/domain/publication"

describe("publication state machine", () => {
  it("uses compare-and-swap publication versions", () => {
    assert.throws(
      () =>
        applyPublicationCommand(
          {
            publicationVersion: 3,
            disposition: "published",
            wasEverPublished: true,
          },
          { action: "withdraw", expectedPublicationVersion: 2 },
        ),
      /changed after it was reviewed/,
    )
  })

  it("supports an explicit publish and withdrawal cycle", () => {
    const published = applyPublicationCommand(
      {
        publicationVersion: 0,
        disposition: "unpublished",
        wasEverPublished: false,
      },
      { action: "publish", expectedPublicationVersion: 0 },
    )
    const withdrawn = applyPublicationCommand(published, {
      action: "withdraw",
      expectedPublicationVersion: 1,
    })

    assert.deepEqual(withdrawn, {
      publicationVersion: 2,
      disposition: "withdrawn",
      wasEverPublished: true,
    })
  })

  it("makes redaction and suppression terminal", () => {
    const redacted = applyPublicationCommand(
      {
        publicationVersion: 4,
        disposition: "withdrawn",
        wasEverPublished: true,
      },
      { action: "redact", expectedPublicationVersion: 4 },
    )

    assert.throws(
      () =>
        applyPublicationCommand(redacted, {
          action: "publish",
          expectedPublicationVersion: 5,
        }),
      /cannot be published again/,
    )

    assert.deepEqual(
      applyPublicationCommand(redacted, {
        action: "suppress",
        expectedPublicationVersion: 5,
      }),
      {
        publicationVersion: 6,
        disposition: "suppressed",
        wasEverPublished: true,
      },
    )
  })

  it("does not invent a public record for private-only content", () => {
    assert.throws(
      () =>
        applyPublicationCommand(
          {
            publicationVersion: 0,
            disposition: "unpublished",
            wasEverPublished: false,
          },
          { action: "suppress", expectedPublicationVersion: 0 },
        ),
      /no public snapshot/,
    )
  })
})
