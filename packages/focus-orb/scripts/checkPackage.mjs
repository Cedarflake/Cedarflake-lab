import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { validatePackageContract } from "./packageContract.mjs"

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const expectedPackageIdentity = {
  bugsUrl: "https://github.com/Cedarflake/Cedarflake-Lab/issues",
  homepage:
    "https://github.com/Cedarflake/Cedarflake-Lab/tree/main/packages/focus-orb#readme",
  license: "BSD-3-Clause",
  name: "@cedarflake/focus-orb",
  reactPeerRange: "^18.2.0 || ^19.0.0",
  repository: {
    directory: "packages/focus-orb",
    type: "git",
    url: "git+https://github.com/Cedarflake/Cedarflake-Lab.git",
  },
  type: "module",
}
const expectedPackedFiles = [
  "dist/assets/noise-watercolor-m3j88gni.webp",
  "dist/assets/noise-watercolor-m3j88gni.webp.d.ts",
  "dist/components/focus-orb/FocusOrb.d.ts",
  "dist/config/defaults.d.ts",
  "dist/hooks/useFocusOrbRenderer.d.ts",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/renderer/shader.d.ts",
  "dist/renderer/webgl.d.ts",
  "dist/style.css",
  "dist/types/focusOrb.d.ts",
  "dist/utils/focusOrb.d.ts",
  "LICENSE",
  "README.md",
  "package.json",
]
const maxPackageFileBytes = 300 * 1024
const manifest = JSON.parse(
  await readFile(resolve(projectDirectory, "package.json"), "utf8"),
)
const packArguments = [
  "--config.ignore-scripts=true",
  "pack",
  "--dry-run",
  "--json",
]
const pnpmCli = process.env.npm_execpath

if (!pnpmCli) {
  throw new Error(
    "pnpm lifecycle executable is unavailable; run pnpm pack:check",
  )
}

const packResult = spawnSync(process.execPath, [pnpmCli, ...packArguments], {
  cwd: projectDirectory,
  encoding: "utf8",
})

if (packResult.error) {
  throw packResult.error
}

if (packResult.status !== 0) {
  throw new Error(
    `pnpm pack --dry-run failed:\n${packResult.stderr || packResult.stdout}`,
  )
}

const pack = JSON.parse(packResult.stdout)
const report = await validatePackageContract({
  expectedPackageIdentity,
  expectedPackedFiles,
  manifest,
  maxPackageFileBytes,
  pack,
  projectDirectory,
})

console.log(
  `Validated ${report.name}@${report.version} with ${report.publicTargetCount} public targets across ${report.fileCount} packed files (${report.packageFileSize} package-file bytes).`,
)
