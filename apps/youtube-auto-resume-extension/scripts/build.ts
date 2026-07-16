import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

import { createExtensionManifest } from "./manifest.ts"

interface PackageManifest {
  version?: unknown
}

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = resolve(projectDirectory, "dist")
const packageFile = resolve(projectDirectory, "package.json")
const licenseFile = resolve(projectDirectory, "LICENSE")
const isCheck = process.argv.includes("--check")

function readVersion(value: unknown): string {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(
      "package.json version must be a three-part numeric version",
    )
  }

  return value
}

const packageManifest = JSON.parse(
  await readFile(packageFile, "utf8"),
) as PackageManifest
const version = readVersion(packageManifest.version)
const manifest = createExtensionManifest(version)
const result = await build({
  bundle: true,
  charset: "utf8",
  entryNames: "[name]",
  entryPoints: {
    "auto-skip-bridge": resolve(
      projectDirectory,
      "src/chromium/autoSkipBridge.ts",
    ),
    background: resolve(projectDirectory, "src/chromium/background.ts"),
    runtime: resolve(projectDirectory, "src/entry.ts"),
  },
  format: "iife",
  legalComments: "none",
  outdir: resolve(projectDirectory, ".build"),
  platform: "browser",
  target: ["chrome109"],
  write: false,
})
const outputs = new Map(
  result.outputFiles?.map((output) => [basename(output.path), output.contents]),
)
const requiredOutputs = ["auto-skip-bridge.js", "background.js", "runtime.js"]

for (const outputName of requiredOutputs) {
  if (!outputs.has(outputName)) {
    throw new Error(`esbuild did not produce ${outputName}`)
  }
}

if (isCheck) {
  console.log("Verified Chromium extension build inputs")
  process.exit(0)
}

const chromiumDirectory = resolve(outputDirectory, "chromium")
const license = await readFile(licenseFile)
await rm(outputDirectory, { recursive: true, force: true })
await mkdir(chromiumDirectory, { recursive: true })

for (const outputName of requiredOutputs) {
  const contents = outputs.get(outputName)

  if (!contents) {
    throw new Error(`Missing verified build output ${outputName}`)
  }

  await writeFile(resolve(chromiumDirectory, outputName), contents)
}

await writeFile(
  resolve(chromiumDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
await writeFile(resolve(chromiumDirectory, "LICENSE"), license)

console.log(`Built Chromium extension in ${chromiumDirectory}`)
