import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getComponentArchiveBlockers } from "../../src/lib/forms/component-archive-blockers"
import {
  changeComponentLifecycleFormPayloadSchema,
  createComponentAdminRedirect,
  createStatusAdminRedirect,
  publishComponentFormPayloadSchema,
  saveComponentMetadataFormPayloadSchema,
} from "../../src/lib/forms/component-management"
import { closeComponentPublicationFormPayloadSchema } from "../../src/lib/forms/component-privacy"

const componentId = "10000000-0000-4000-8000-000000000001"
const otherComponentId = "10000000-0000-4000-8000-000000000002"
const idempotencyKey = "20000000-0000-4000-8000-000000000001"

const componentGuards = {
  componentId,
  expectedComponentVersion: 4,
  expectedMetadataPublicationVersion: 2,
}

describe("component management form payloads", () => {
  it("accepts an exact owner metadata draft and rejects extra fields", () => {
    const payload = {
      ...componentGuards,
      idempotencyKey,
      ownerName: "Availability",
      ownerSummary: null,
      ownerSortOrder: 0,
      defaultValidityMs: 3_600_000,
      privateNote: "Owner only",
      publicDraft: {
        name: "Availability",
        summary: "Current availability",
        sortOrder: 0,
      },
    }

    assert.equal(
      saveComponentMetadataFormPayloadSchema.parse(payload).ownerName,
      "Availability",
    )
    assert.equal(
      saveComponentMetadataFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "confirmed",
      }).success,
      false,
    )
  })

  it("requires a literal confirmation and a valid current interval to publish", () => {
    const payload = {
      ...componentGuards,
      idempotencyKey,
      expectedStatusPublicationVersion: 3,
      startingReport: {
        condition: "available",
        effectiveAt: 1_000,
        validUntil: 2_000,
        ownerSummary: null,
        publicSummary: "Available now",
        privateNote: null,
      },
      confirmation: "confirmed",
    }

    assert.equal(publishComponentFormPayloadSchema.safeParse(payload).success, true)
    assert.equal(
      publishComponentFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "",
      }).success,
      false,
    )
    assert.equal(
      publishComponentFormPayloadSchema.safeParse({
        ...payload,
        startingReport: {
          ...payload.startingReport,
          validUntil: payload.startingReport.effectiveAt,
        },
      }).success,
      false,
    )
  })

  it("requires confirmation only for archive and keeps unarchive private", () => {
    const shared = {
      ...componentGuards,
      idempotencyKey,
      expectedStatusPublicationVersion: 3,
    }

    assert.equal(
      changeComponentLifecycleFormPayloadSchema.safeParse({
        ...shared,
        operation: "archive",
        confirmation: "confirmed",
      }).success,
      true,
    )
    assert.equal(
      changeComponentLifecycleFormPayloadSchema.safeParse({
        ...shared,
        operation: "archive",
        confirmation: null,
      }).success,
      false,
    )
    assert.equal(
      changeComponentLifecycleFormPayloadSchema.safeParse({
        ...shared,
        operation: "unarchive",
        confirmation: null,
      }).success,
      true,
    )
    assert.equal(
      changeComponentLifecycleFormPayloadSchema.safeParse({
        ...shared,
        operation: "unarchive",
        confirmation: "confirmed",
      }).success,
      false,
    )
  })

  it("builds deterministic master-detail return paths", () => {
    assert.equal(
      createComponentAdminRedirect(componentId, "component-metadata-saved"),
      `/admin?view=component&item=${componentId}&notice=component-metadata-saved`,
    )
    assert.equal(
      createComponentAdminRedirect(
        componentId,
        "component-redacted",
        "privacy",
      ),
      `/admin?view=component&item=${componentId}&notice=component-redacted&task=privacy`,
    )
    assert.equal(
      createStatusAdminRedirect("status-reported"),
      "/admin?view=status&notice=status-reported",
    )
  })

  it("requires exact impact guards and acknowledgement for component privacy", () => {
    const shared = {
      ...componentGuards,
      idempotencyKey,
      expectedStatusPublicationVersion: 3,
      externalCopiesAcknowledged: "confirmed",
      ownerName: "Availability",
    }
    const incidentGuard = {
      kind: "incident" as const,
      incidentId: "30000000-0000-4000-8000-000000000001",
      expectedIncidentVersion: 2,
      expectedIncidentPublicationVersion: 3,
    }
    const relatedGuard = {
      componentId: otherComponentId,
      expectedComponentVersion: 5,
      expectedComponentMetadataPublicationVersion: 2,
    }

    assert.equal(
      closeComponentPublicationFormPayloadSchema.safeParse({
        ...shared,
        action: "withdraw",
        dependentParents: [],
        relatedComponents: [],
        confirmationName: null,
      }).success,
      true,
    )
    assert.equal(
      closeComponentPublicationFormPayloadSchema.safeParse({
        ...shared,
        action: "withdraw",
        dependentParents: [incidentGuard],
        relatedComponents: [],
        confirmationName: null,
      }).success,
      false,
    )
    assert.equal(
      closeComponentPublicationFormPayloadSchema.safeParse({
        ...shared,
        action: "redact",
        dependentParents: [incidentGuard],
        relatedComponents: [relatedGuard],
        confirmationName: "Availability",
      }).success,
      true,
    )
    assert.equal(
      closeComponentPublicationFormPayloadSchema.safeParse({
        ...shared,
        action: "redact",
        dependentParents: [incidentGuard],
        relatedComponents: [relatedGuard],
        confirmationName: "availability",
      }).success,
      false,
    )
    assert.equal(
      closeComponentPublicationFormPayloadSchema.safeParse({
        ...shared,
        externalCopiesAcknowledged: "",
        action: "suppress",
        dependentParents: [incidentGuard],
        relatedComponents: [relatedGuard],
        confirmationName: "Availability",
      }).success,
      false,
    )
  })
})

describe("component archive blocker preview", () => {
  it("shows only current unresolved incident and active maintenance references", () => {
    const blockers = getComponentArchiveBlockers(
      componentId,
      [
        {
          incidentId: "incident-active",
          latestTitle: "Active incident",
          latestPhase: "monitoring",
          updates: [
            { affectedComponents: [{ componentId: otherComponentId }] },
            { affectedComponents: [{ componentId }] },
          ],
        },
        {
          incidentId: "incident-resolved",
          latestTitle: "Resolved incident",
          latestPhase: "resolved",
          updates: [{ affectedComponents: [{ componentId }] }],
        },
        {
          incidentId: "incident-reference-removed",
          latestTitle: "Reference removed",
          latestPhase: "identified",
          updates: [
            { affectedComponents: [{ componentId }] },
            { affectedComponents: [{ componentId: otherComponentId }] },
          ],
        },
      ],
      [
        {
          maintenanceWindowId: "maintenance-scheduled",
          phase: "scheduled",
          latestEvent: {
            title: "Scheduled rest",
            affectedComponents: [{ componentId }],
          },
        },
        {
          maintenanceWindowId: "maintenance-completed",
          phase: "completed",
          latestEvent: {
            title: "Completed rest",
            affectedComponents: [{ componentId }],
          },
        },
      ],
    )

    assert.deepEqual(blockers, [
      {
        kind: "incident",
        sourceId: "incident-active",
        title: "Active incident",
        phase: "monitoring",
      },
      {
        kind: "maintenance",
        sourceId: "maintenance-scheduled",
        title: "Scheduled rest",
        phase: "scheduled",
      },
    ])
  })
})
