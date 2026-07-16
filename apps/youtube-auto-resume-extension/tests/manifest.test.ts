import assert from "node:assert/strict"
import test from "node:test"

import { createExtensionManifest } from "../scripts/manifest.ts"

test("Chromium manifest separates page runtime from trusted input bridge", () => {
  const manifest = createExtensionManifest("0.1.0")

  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.version, "0.1.0")
  assert.deepEqual(manifest.permissions, ["debugger"])
  assert.deepEqual(manifest.background, {
    service_worker: "background.js",
  })
  assert.deepEqual(manifest.content_scripts, [
    {
      all_frames: false,
      js: ["runtime.js"],
      matches: ["https://www.youtube.com/*"],
      run_at: "document_idle",
      world: "MAIN",
    },
    {
      all_frames: false,
      js: ["auto-skip-bridge.js"],
      matches: ["https://www.youtube.com/*"],
      run_at: "document_idle",
      world: "ISOLATED",
    },
  ])
  assert.equal(Reflect.has(manifest, "browser_specific_settings"), false)
})
