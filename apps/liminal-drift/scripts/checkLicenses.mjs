import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const blockedLicensePatterns = [
  /\bAGPL\b/i,
  /\bBUSL\b/i,
  /\bCommons Clause\b/i,
  /\bCC-BY-NC\b/i,
  /\bGPL\b/i,
  /\bLGPL\b/i,
  /\bSSPL\b/i,
  /^UNLICENSED$/i,
]

const result = spawnSync("pnpm", ["licenses", "list", "--json"], {
  cwd: projectRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
})

if (result.status !== 0) {
  throw new Error(`pnpm licenses failed: ${result.stderr || result.stdout}`)
}

/** @type {Record<string, Array<{name: string, versions: string[]}>>} */
const licenses = JSON.parse(result.stdout)
const blockedLicenses = Object.entries(licenses).filter(([license]) =>
  blockedLicensePatterns.some((pattern) => pattern.test(license)),
)

if (blockedLicenses.length > 0) {
  throw new Error(
    `Blocked licenses found: ${blockedLicenses
      .map(([license, packages]) => `${license} (${packages.map((item) => item.name).join(", ")})`)
      .join("; ")}`,
  )
}

console.log("license policy ok", {
  licenses: Object.keys(licenses).sort(),
  packages: Object.values(licenses).reduce((total, packages) => total + packages.length, 0),
})
