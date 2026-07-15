import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  closeSiteProfilePublicationFormPayloadSchema,
  createSiteProfileAdminHref,
  publishSiteProfileFormPayloadSchema,
  saveSiteProfileFormPayloadSchema,
  selectSiteProfilePrivacyAction,
  toCloseSiteProfilePublicationCommand,
  toPublishSiteProfileCommand,
} from "../../src/lib/forms/site-profile"

const idempotencyKey = "10000000-0000-4000-8000-000000000001"
const revisionId = "20000000-0000-4000-8000-000000000001"

describe("site profile form payloads", () => {
  it("accepts a strict owner and public draft with the fixed timezone", () => {
    const payload = {
      idempotencyKey,
      expectedSiteProfileVersion: 0,
      ownerTitle: "Owner title",
      ownerSummary: "Owner summary",
      publicDraft: {
        title: "Public title",
        summary: "Public summary",
      },
      timezone: "Asia/Shanghai",
      privateNote: "Owner only",
    }

    assert.deepEqual(saveSiteProfileFormPayloadSchema.parse(payload), payload)
    assert.equal(
      saveSiteProfileFormPayloadSchema.safeParse({
        ...payload,
        timezone: "UTC",
      }).success,
      false,
    )
    assert.equal(
      saveSiteProfileFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "confirmed",
      }).success,
      false,
    )
  })

  it("requires publication confirmation and maps only command fields", () => {
    const payload = {
      idempotencyKey,
      expectedSiteProfileVersion: 3,
      expectedPublicationVersion: 1,
      revisionId,
      expectedRevisionVersion: 3,
      confirmation: "confirmed",
    }

    assert.equal(publishSiteProfileFormPayloadSchema.safeParse(payload).success, true)
    assert.equal(
      publishSiteProfileFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "",
      }).success,
      false,
    )
    assert.deepEqual(toPublishSiteProfileCommand(payload), {
      idempotencyKey,
      expectedSiteProfileVersion: 3,
      expectedPublicationVersion: 1,
      revisionId,
      expectedRevisionVersion: 3,
    })
  })

  it("requires privacy confirmation and clears it when the action changes", () => {
    const payload = {
      idempotencyKey,
      expectedSiteProfileVersion: 3,
      expectedPublicationVersion: 2,
      action: "redact",
      confirmation: "confirmed",
    }

    assert.equal(
      closeSiteProfilePublicationFormPayloadSchema.safeParse(payload).success,
      true,
    )
    assert.equal(
      closeSiteProfilePublicationFormPayloadSchema.safeParse({
        ...payload,
        confirmation: "",
      }).success,
      false,
    )
    assert.deepEqual(toCloseSiteProfilePublicationCommand(payload), {
      idempotencyKey,
      expectedSiteProfileVersion: 3,
      expectedPublicationVersion: 2,
      action: "redact",
    })
    assert.deepEqual(selectSiteProfilePrivacyAction("suppress"), {
      action: "suppress",
      isConfirmed: false,
    })
  })

  it("keeps each settings task in its success and recovery URL", () => {
    assert.equal(
      createSiteProfileAdminHref("edit"),
      "/admin?view=settings&task=edit",
    )
    assert.equal(
      createSiteProfileAdminHref("publish", "site-profile-published"),
      "/admin?view=settings&notice=site-profile-published&task=publish",
    )
    assert.equal(
      createSiteProfileAdminHref("privacy", "site-profile-redacted"),
      "/admin?view=settings&notice=site-profile-redacted&task=privacy",
    )
  })
})
