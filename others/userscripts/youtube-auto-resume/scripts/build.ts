import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

import { assertReleaseVersion, assertValidSemVer } from "./version.ts"

interface PackageManifest {
  version?: unknown
}

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = resolve(projectDirectory, "dist")
const outputFile = resolve(outputDirectory, "youtube-auto-resume.user.js")
const packageFile = resolve(projectDirectory, "package.json")
const isCheck = process.argv.includes("--check")
const isVersionCheck = process.argv.includes("--check-version")
const userscriptRepositoryPath =
  "others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js"

function readOption(name: string): string | null {
  const inlinePrefix = `${name}=`
  const inlineOption = process.argv.find((argument) =>
    argument.startsWith(inlinePrefix),
  )

  if (inlineOption) {
    return inlineOption.slice(inlinePrefix.length)
  }

  const optionIndex = process.argv.indexOf(name)
  const value = process.argv[optionIndex + 1]

  return optionIndex >= 0 && value ? value : null
}

function readBaseUserscript(baseRef: string): Buffer | null {
  execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], {
    cwd: projectDirectory,
    stdio: "pipe",
  })

  try {
    execFileSync(
      "git",
      ["cat-file", "-e", `${baseRef}:${userscriptRepositoryPath}`],
      { cwd: projectDirectory, stdio: "pipe" },
    )
  } catch {
    return null
  }

  return execFileSync(
    "git",
    ["show", `${baseRef}:${userscriptRepositoryPath}`],
    {
      cwd: projectDirectory,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
}

function readUserscriptVersion(userscript: Buffer): string {
  const match = userscript
    .toString("utf8")
    .match(/^\/\/ @version\s+([^\s]+)\s*$/m)

  if (!match?.[1]) {
    throw new Error("Base userscript does not contain a valid @version line")
  }

  return assertValidSemVer(match[1], "Base userscript @version")
}

const packageManifest: PackageManifest = JSON.parse(
  await readFile(packageFile, "utf8"),
) as PackageManifest

const packageVersion = assertValidSemVer(
  packageManifest.version,
  "package.json version",
)

const metadata = [
  "// ==UserScript==",
  "// @name         YouTube Auto Resume",
  "// @namespace    https://github.com/Cedarflake/Cedarflake-Lab",
  `// @version      ${packageVersion}`,
  "// @description  Resume paused YouTube videos, click YouTube-provided ad controls, and manage playback from a resilient panel.",
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

if (isVersionCheck) {
  const baseRef = readOption("--base-ref")

  if (!baseRef) {
    throw new Error("Version check requires --base-ref=<git-ref>")
  }

  const baseUserscript = readBaseUserscript(baseRef)

  if (!baseUserscript) {
    console.log("Skipped version comparison because the base has no userscript")
  } else {
    const nextUserscript = Buffer.from(output.contents)
    const baseVersion = readUserscriptVersion(baseUserscript)

    assertReleaseVersion({
      baseVersion,
      currentVersion: packageVersion,
      hasGeneratedOutputChanged: !baseUserscript.equals(nextUserscript),
    })

    console.log(
      `Verified userscript version ${packageVersion} against ${baseRef}`,
    )
  }
} else if (isCheck) {
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
