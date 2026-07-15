import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPublicSiteProfileMetadata,
  productSiteProfileFallback,
  resolvePublicSiteProfile,
  siteProfileBrandMark,
} from "../../src/lib/public/site-profile-fallback";
import type { SiteProfilePublicSnapshot } from "../../src/lib/public/site-profile-snapshots";

describe("public site profile fallback", () => {
  it("provides the product identity when no public snapshot is active", () => {
    assert.strictEqual(
      resolvePublicSiteProfile(null),
      productSiteProfileFallback,
    );
    assert.deepEqual(productSiteProfileFallback, {
      schemaVersion: 1,
      title: "Shika",
      summary: "A personal status signal",
      timezone: "Asia/Shanghai",
    });
    assert.equal(siteProfileBrandMark(productSiteProfileFallback), "S");
  });

  it("preserves an explicit snapshot without filling nullable copy", () => {
    const snapshot: SiteProfilePublicSnapshot = {
      schemaVersion: 1,
      title: "Crystal signal",
      summary: null,
      timezone: "Asia/Shanghai",
    };

    assert.strictEqual(resolvePublicSiteProfile(snapshot), snapshot);
    assert.deepEqual(createPublicSiteProfileMetadata(snapshot), {
      title: { absolute: "Crystal signal" },
      description: null,
    });
    assert.deepEqual(
      createPublicSiteProfileMetadata(snapshot, "Public history"),
      {
        title: { absolute: "Public history — Crystal signal" },
        description: null,
      },
    );
    assert.equal(siteProfileBrandMark(snapshot), "C");
  });
});
