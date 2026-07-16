export interface ContentScriptDefinition {
  all_frames: false
  js: [string]
  matches: ["https://www.youtube.com/*"]
  run_at: "document_idle"
  world: "ISOLATED" | "MAIN"
}

export interface ExtensionManifest {
  manifest_version: 3
  name: string
  version: string
  description: string
  permissions: ["debugger"]
  background: {
    service_worker: "background.js"
  }
  content_scripts: [ContentScriptDefinition, ContentScriptDefinition]
}

export function createExtensionManifest(version: string): ExtensionManifest {
  return {
    manifest_version: 3,
    name: "YouTube Auto Resume",
    version,
    description:
      "Recover paused playback, select a target quality, and activate visible YouTube skip controls.",
    permissions: ["debugger"],
    background: {
      service_worker: "background.js",
    },
    content_scripts: [
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
    ],
  }
}
