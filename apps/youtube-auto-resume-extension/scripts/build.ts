import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { createExtensionManifests } from "./manifest.ts";

interface PackageManifest {
  version?: unknown;
}

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectDirectory, "dist");
const packageFile = resolve(projectDirectory, "package.json");
const licenseFile = resolve(projectDirectory, "LICENSE");
const isCheck = process.argv.includes("--check");

function readVersion(value: unknown): string {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(
      "package.json version must be a three-part numeric version",
    );
  }

  return value;
}

const packageManifest = JSON.parse(
  await readFile(packageFile, "utf8"),
) as PackageManifest;
const version = readVersion(packageManifest.version);
const manifests = createExtensionManifests(version);
const result = await build({
  bundle: true,
  charset: "utf8",
  entryPoints: [resolve(projectDirectory, "src/entry.ts")],
  format: "iife",
  legalComments: "none",
  platform: "browser",
  target: ["chrome109", "firefox128"],
  write: false,
});
const runtime = result.outputFiles?.[0];

if (!runtime) {
  throw new Error("esbuild did not produce the extension runtime");
}

if (isCheck) {
  console.log("Verified Chromium and Firefox extension build inputs");
  process.exit(0);
}

const license = await readFile(licenseFile);
await rm(outputDirectory, { recursive: true, force: true });

for (const [target, manifest] of Object.entries(manifests)) {
  const targetDirectory = resolve(outputDirectory, target);
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(targetDirectory, "runtime.js"), runtime.contents),
    writeFile(
      resolve(targetDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    writeFile(resolve(targetDirectory, "LICENSE"), license),
  ]);
}

console.log(`Built extension packages in ${outputDirectory}`);
