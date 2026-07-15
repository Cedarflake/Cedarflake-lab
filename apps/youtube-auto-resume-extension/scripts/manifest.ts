export interface ContentScriptDefinition {
  all_frames: false;
  js: ["runtime.js"];
  matches: ["https://www.youtube.com/*"];
  run_at: "document_idle";
  world: "MAIN";
}

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  content_scripts: [ContentScriptDefinition];
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
      data_collection_permissions: {
        required: ["none"];
      };
    };
  };
}

function createBaseManifest(version: string): ExtensionManifest {
  return {
    manifest_version: 3,
    name: "YouTube Auto Resume",
    version,
    description:
      "Recover paused YouTube playback, select a target quality, and click visible YouTube skip controls.",
    content_scripts: [
      {
        all_frames: false,
        js: ["runtime.js"],
        matches: ["https://www.youtube.com/*"],
        run_at: "document_idle",
        world: "MAIN",
      },
    ],
  };
}

export function createExtensionManifests(version: string): {
  chromium: ExtensionManifest;
  firefox: ExtensionManifest;
} {
  return {
    chromium: createBaseManifest(version),
    firefox: {
      ...createBaseManifest(version),
      browser_specific_settings: {
        gecko: {
          id: "youtube-auto-resume@cedarflake-lab",
          strict_min_version: "128.0",
          data_collection_permissions: {
            required: ["none"],
          },
        },
      },
    },
  };
}
