import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  componentStatusChoiceSchema,
  toStatusTransitionCommand,
} from "../../src/lib/forms/component-status-choice"

const componentId = "4a6ee8ec-1d2b-40c4-b223-2bdcabcf409f"

describe("component status choice form boundary", () => {
  it("converts an explicit private transition and relative validity", () => {
    const effectiveAt = 1_700_000_000_000
    const choice = componentStatusChoiceSchema.parse({
      componentId,
      expectedComponentVersion: 4,
      expectedComponentMetadataPublicationVersion: 0,
      expectedStatusPublicationVersion: 0,
      mode: "transition",
      transition: {
        condition: "limited",
        validityMinutes: "90",
        ownerSummary: "Planned reduced availability",
        privateNote: "Owner context",
        publicationMode: "private",
        publicSummary: "",
      },
    })

    assert.equal(choice.mode, "transition")
    if (choice.mode !== "transition") return

    assert.deepEqual(toStatusTransitionCommand(choice, effectiveAt), {
      condition: "limited",
      validUntil: effectiveAt + 90 * 60_000,
      ownerSummary: "Planned reduced availability",
      privateNote: "Owner context",
      publication: { mode: "private" },
    })
  })

  it("preserves reviewed publication versions for a public transition", () => {
    const choice = componentStatusChoiceSchema.parse({
      componentId,
      expectedComponentVersion: 4,
      expectedComponentMetadataPublicationVersion: 2,
      expectedStatusPublicationVersion: 7,
      mode: "transition",
      transition: {
        condition: "available",
        validityMinutes: "",
        ownerSummary: "",
        privateNote: "",
        publicationMode: "public",
        publicSummary: "Back to normal",
      },
    })

    assert.equal(choice.mode, "transition")
    if (choice.mode !== "transition") return

    assert.deepEqual(toStatusTransitionCommand(choice, 100), {
      condition: "available",
      validUntil: null,
      ownerSummary: null,
      privateNote: null,
      publication: {
        mode: "public",
        publicSummary: "Back to normal",
        expectedComponentMetadataPublicationVersion: 2,
        expectedStatusPublicationVersion: 7,
      },
    })
  })

  it("rejects public transitions without public component metadata", () => {
    assert.throws(() =>
      componentStatusChoiceSchema.parse({
        componentId,
        expectedComponentVersion: 4,
        expectedComponentMetadataPublicationVersion: 0,
        expectedStatusPublicationVersion: 0,
        mode: "transition",
        transition: {
          condition: "available",
          validityMinutes: "",
          ownerSummary: "",
          privateNote: "",
          publicationMode: "public",
          publicSummary: "Back to normal",
        },
      }),
    )
  })
})
