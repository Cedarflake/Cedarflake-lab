import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  FormDataFieldError,
  readSingleJsonField,
  readSingleTextField,
} from "../../src/lib/forms/form-data"

describe("form data fields", () => {
  it("reads one text value and treats a missing optional field as empty", () => {
    const formData = new FormData()
    formData.set("name", "Availability")

    assert.equal(readSingleTextField(formData, "name"), "Availability")
    assert.equal(readSingleTextField(formData, "summary"), "")
  })

  it("rejects duplicate values", () => {
    const formData = new FormData()
    formData.append("componentId", "first")
    formData.append("componentId", "second")

    assert.throws(
      () => readSingleTextField(formData, "componentId"),
      FormDataFieldError,
    )
  })

  it("rejects file values", () => {
    const formData = new FormData()
    formData.set("name", new File(["private"], "payload.txt"))

    assert.throws(
      () => readSingleTextField(formData, "name"),
      FormDataFieldError,
    )
  })

  it("parses one JSON value and rejects malformed JSON", () => {
    const formData = new FormData()
    formData.set("payload", '{"version":1}')

    assert.deepEqual(readSingleJsonField(formData, "payload"), { version: 1 })

    formData.set("payload", "not-json")
    assert.throws(
      () => readSingleJsonField(formData, "payload"),
      FormDataFieldError,
    )
  })
})
