import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readIncidentMetadataForm } from "../../src/lib/forms/incident-metadata-form"

describe("incident metadata form adapter", () => {
  it("preserves every concurrency guard submitted by the form", () => {
    const formData = new FormData()
    formData.set("idempotencyKey", "00000000-0000-4000-8000-000000000001")
    formData.set("incidentId", "00000000-0000-4000-8000-000000000002")
    formData.set("expectedIncidentVersion", "7")
    formData.set("expectedPublicationVersion", "11")
    formData.set("effectiveAt", "123456")
    formData.set("title", "Owner title")
    formData.set("severity", "major")
    formData.set("ownerSummary", "Owner summary")
    formData.set("privateNote", "Private note")
    formData.set(
      "currentAffectedComponents",
      JSON.stringify([{ componentId: "current-component" }]),
    )
    formData.set(
      "affectedComponents",
      JSON.stringify([{ componentId: "next-component" }]),
    )
    formData.set("publicationMode", "public")
    formData.set("publicTitle", "Public title")
    formData.set("publicSeverity", "minor")
    formData.set("publicSummary", "Public summary")

    const result = readIncidentMetadataForm(formData)

    assert.equal(result.expectedIncidentVersion, "7")
    assert.equal(result.expectedPublicationVersion, "11")
    assert.deepEqual(result.currentAffectedComponents, [
      { componentId: "current-component" },
    ])
    assert.deepEqual(result.affectedComponents, [
      { componentId: "next-component" },
    ])
  })
})
