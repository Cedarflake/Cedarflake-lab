import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

interface PackageManifest {
  version?: unknown
}

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = resolve(projectDirectory, "dist")
const outputFile = resolve(outputDirectory, "youtube-auto-resume.user.js")
const packageFile = resolve(projectDirectory, "package.json")
const isCheck = process.argv.includes("--check")

const packageManifest: PackageManifest = JSON.parse(
  await readFile(packageFile, "utf8"),
) as PackageManifest

if (typeof packageManifest.version !== "string") {
  throw new TypeError("package.json must contain a string version")
}

const metadata = [
  "// ==UserScript==",
  "// @name         YouTube Auto Resume",
  "// @namespace    https://github.com/Cedarflake/Cedarflake-Lab",
  `// @version      ${packageManifest.version}`,
  "// @description  Resume paused YouTube videos, skip skippable ads, and manage playback from a resilient panel.",
  "// @author       Cedarflake Lab",
  "// @license      MIT",
  "// @homepageURL  https://github.com/Cedarflake/Cedarflake-Lab/tree/main/others/userscripts/youtube-auto-resume",
  "// @supportURL   https://github.com/Cedarflake/Cedarflake-Lab/issues",
  "// @downloadURL  https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js",
  "// @updateURL    https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js",
  "// @match        https://www.youtube.com/*",
  "// @run-at       document-idle",
  "// @grant        GM_registerMenuCommand",
  "// @noframes",
  "// ==/UserScript==",
].join("\n")

const result = await build({
  banner: {
    js: metadata,
  },
  bundle: true,
  charset: "utf8",
  entryPoints: [resolve(projectDirectory, "src/entry.ts")],
  format: "iife",
  legalComments: "none",
  outfile: outputFile,
  platform: "browser",
  target: ["chrome109", "firefox115"],
  write: false,
})

const output = result.outputFiles?.[0]

if (!output) {
  throw new Error("esbuild did not produce a userscript")
}

if (isCheck) {
  const currentOutput = await readFile(outputFile).catch(() => null)

  if (!currentOutput || !currentOutput.equals(Buffer.from(output.contents))) {
    throw new Error("Built userscript is stale. Run pnpm build and commit dist.")
  }

  console.log(`Verified ${outputFile}`)
} else {
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(outputFile, output.contents)
  console.log(`Built ${outputFile}`)
}
