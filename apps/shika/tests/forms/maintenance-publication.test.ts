import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createMaintenancePublicationAdminHref,
  publishMaintenanceFormPayloadSchema,
  toPublishMaintenanceCommand,
} from "../../src/lib/forms/maintenance-publication"

const idempotencyKey = "10000000-0000-4000-8000-000000000001"
const maintenanceWindowId = "20000000-0000-4000-8000-000000000001"
const componentId = "30000000-0000-4000-8000-000000000001"

function validPayload() {
  return {
    idempotencyKey,
    maintenanceWindowId,
    expectedMaintenanceVersion: 2,
    expectedMaintenancePublicationVersion: 0,
    effectiveAt: 1_000,
    publicTitle: "Planned rest",
    publicSummary: "Responses may pause",
    publicStartsAt: 2_000,
    publicEndsAt: 3_000,
    publicTimezone: "Asia/Shanghai",
    affectedComponents: [
      {
        componentId,
        expectedComponentVersion: 4,
        expectedComponentMetadataPublicationVersion: 2,
      },
    ],
    confirmation: "confirmed" as const,
  }
}

describe("maintenance publication form payload", () => {
  it("maps an exact reviewed snapshot without forwarding confirmation", () => {
    const payload = validPayload()

    assert.deepEqual(publishMaintenanceFormPayloadSchema.parse(payload), payload)
    assert.deepEqual(toPublishMaintenanceCommand(payload), {
      idempotencyKey,
      maintenanceWindowId,
      expectedMaintenanceVersion: 2,
      expectedMaintenancePublicationVersion: 0,
      effectiveAt: 1_000,
      publicTitle: "Planned rest",
      publicSummary: "Responses may pause",
      publicStartsAt: 2_000,
      publicEndsAt: 3_000,
      publicTimezone: "Asia/Shanghai",
      affectedComponents: [
        {
          componentId,
          expectedComponentVersion: 4,
          expectedComponentMetadataPublicationVersion: 2,
        },
      ],
    })
  })

  it("rejects missing confirmation, invalid schedules, and duplicate guards", () => {
    const payload = validPayload()

    assert.equal(
      publishMaintenanceFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "",
      }).success,
      false,
    )
    assert.equal(
      publishMaintenanceFormPayloadSchema.safeParse({
        ...payload,
        publicEndsAt: payload.publicStartsAt,
      }).success,
      false,
    )
    assert.equal(
      publishMaintenanceFormPayloadSchema.safeParse({
        ...payload,
        affectedComponents: [
          payload.affectedComponents[0],
          payload.affectedComponents[0],
        ],
      }).success,
      false,
    )
  })

  it("keeps recovery and success navigation on the publish task", () => {
    assert.equal(
      createMaintenancePublicationAdminHref(maintenanceWindowId),
      `/admin?view=maintenance&item=${maintenanceWindowId}&task=publish`,
    )
    assert.equal(
      createMaintenancePublicationAdminHref(
        maintenanceWindowId,
        "maintenance-published",
      ),
      `/admin?view=maintenance&item=${maintenanceWindowId}&task=publish&notice=maintenance-published`,
    )
  })
})
