import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assertIncidentPhaseCommand } from "../../src/domain/incidents"
import {
  assertMaintenanceWindow,
  nextMaintenancePhase,
} from "../../src/domain/maintenance"

describe("incident phase machine", () => {
  it("allows reasoned movement among nonterminal phases", () => {
    assert.doesNotThrow(() =>
      assertIncidentPhaseCommand({
        from: "monitoring",
        to: "investigating",
        operation: "phase_update",
        reason: "Symptoms returned",
      }),
    )
  })

  it("requires named resolve and reopen commands", () => {
    assert.throws(() =>
      assertIncidentPhaseCommand({
        from: "identified",
        to: "resolved",
        operation: "phase_update",
        reason: "Recovered",
      }),
    )
    assert.doesNotThrow(() =>
      assertIncidentPhaseCommand({
        from: "resolved",
        to: "investigating",
        operation: "reopen",
        reason: "The issue returned",
      }),
    )
  })

  it("rejects empty phase-change reasons", () => {
    assert.throws(
      () =>
        assertIncidentPhaseCommand({
          from: "investigating",
          to: "identified",
          operation: "phase_update",
          reason: "  ",
        }),
      /A reason is required/,
    )
  })
})

describe("maintenance phase machine", () => {
  it("permits only explicit lifecycle operations", () => {
    assert.equal(
      nextMaintenancePhase({ phase: "scheduled", operation: "start" }),
      "in_progress",
    )
    assert.equal(
      nextMaintenancePhase({ phase: "in_progress", operation: "complete" }),
      "completed",
    )
    assert.throws(() =>
      nextMaintenancePhase({ phase: "completed", operation: "cancel" }),
    )
  })

  it("does not use clock time to change phase", () => {
    assert.equal(
      nextMaintenancePhase({ phase: "scheduled", operation: "reschedule" }),
      "scheduled",
    )
  })

  it("requires a positive maintenance window", () => {
    assert.throws(() => assertMaintenanceWindow(200, 100))
    assert.doesNotThrow(() => assertMaintenanceWindow(100, 200))
  })
})
