import assert from "node:assert/strict";
import test from "node:test";

import { createExtensionManifests } from "../scripts/manifest.ts";

test("extension manifests use a minimal MAIN-world content script", () => {
  const manifests = createExtensionManifests("0.1.0");

  for (const manifest of Object.values(manifests)) {
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.content_scripts, [
      {
        all_frames: false,
        js: ["runtime.js"],
        matches: ["https://www.youtube.com/*"],
        run_at: "document_idle",
        world: "MAIN",
      },
    ]);
    assert.equal(Reflect.has(manifest, "permissions"), false);
    assert.equal(Reflect.has(manifest, "background"), false);
  }
});

test("Firefox manifest declares identity and no data collection", () => {
  const { chromium, firefox } = createExtensionManifests("0.1.0");

  assert.equal(chromium.browser_specific_settings, undefined);
  assert.deepEqual(firefox.browser_specific_settings, {
    gecko: {
      id: "youtube-auto-resume@cedarflake-lab",
      strict_min_version: "128.0",
      data_collection_permissions: {
        required: ["none"],
      },
    },
  });
});
