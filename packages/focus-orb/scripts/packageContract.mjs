import { stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"

const allowedPackageMetadata = new Set(["LICENSE", "README.md", "package.json"])
const primaryEntryFields = ["main", "module", "types"]
const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function addExportTargets(value, label, targets, errors) {
  if (typeof value === "string") {
    targets.push({ label, target: value })
    return
  }

  if (!isRecord(value) || Object.keys(value).length === 0) {
    errors.push(`${label} must resolve to a non-empty export target`)
    return
  }

  for (const [condition, target] of Object.entries(value)) {
    addExportTargets(target, `${label}.${condition}`, targets, errors)
  }
}

function normalizePackPath(value, label, errors) {
  if (typeof value !== "string" || !value || value.includes("\\")) {
    errors.push(`${label} must be a normalized package-relative path`)
    return null
  }

  const segments = value.split("/")

  if (
    isAbsolute(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    errors.push(`${label} must stay inside the package`)
    return null
  }

  return value
}

function collectPublicTargets(manifest, errors) {
  const targets = []

  for (const field of primaryEntryFields) {
    const target = manifest[field]

    if (typeof target !== "string" || !target) {
      errors.push(`package.json ${field} must be a non-empty string`)
      continue
    }

    targets.push({ label: `package.json ${field}`, target })
  }

  if (
    !isRecord(manifest.exports) ||
    Object.keys(manifest.exports).length === 0
  ) {
    errors.push("package.json exports must be a non-empty object")
  } else {
    addExportTargets(manifest.exports, "package.json exports", targets, errors)
  }

  return targets
}

function validateManifestMetadata(manifest, expectedPackageIdentity, errors) {
  for (const field of ["name", "license", "type", "homepage"]) {
    if (manifest[field] !== expectedPackageIdentity[field]) {
      errors.push(
        `package.json ${field} must be ${JSON.stringify(expectedPackageIdentity[field])}`,
      )
    }
  }

  if (
    typeof manifest.version !== "string" ||
    !semVerPattern.test(manifest.version)
  ) {
    errors.push("package.json version must be valid SemVer")
  }

  if (
    typeof manifest.description !== "string" ||
    !manifest.description.trim()
  ) {
    errors.push("package.json description must be a non-empty string")
  }

  if (manifest.private === true) {
    errors.push(
      "package.json private must not be true for a publishable package",
    )
  }

  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1 ||
    manifest.files[0] !== "dist"
  ) {
    errors.push('package.json files must contain only "dist"')
  }

  if (
    !isRecord(manifest.publishConfig) ||
    manifest.publishConfig.access !== "public"
  ) {
    errors.push('package.json publishConfig.access must be "public"')
  }

  if (
    !isRecord(manifest.publishConfig) ||
    manifest.publishConfig.registry !== "https://registry.npmjs.org/"
  ) {
    errors.push(
      'package.json publishConfig.registry must be "https://registry.npmjs.org/"',
    )
  }

  if (
    !isRecord(manifest.repository) ||
    manifest.repository.type !== expectedPackageIdentity.repository.type ||
    manifest.repository.url !== expectedPackageIdentity.repository.url ||
    manifest.repository.directory !==
      expectedPackageIdentity.repository.directory
  ) {
    errors.push(
      "package.json repository must match the Focus Orb source identity",
    )
  }

  if (
    !isRecord(manifest.bugs) ||
    manifest.bugs.url !== expectedPackageIdentity.bugsUrl
  ) {
    errors.push(
      `package.json bugs.url must be ${JSON.stringify(expectedPackageIdentity.bugsUrl)}`,
    )
  }

  if (
    !isRecord(manifest.peerDependencies) ||
    manifest.peerDependencies.react !== expectedPackageIdentity.reactPeerRange
  ) {
    errors.push(
      `package.json peerDependencies.react must be ${JSON.stringify(expectedPackageIdentity.reactPeerRange)}`,
    )
  }
}

async function validateTargetFile(projectDirectory, target, label, errors) {
  if (!target.startsWith("./dist/")) {
    errors.push(`${label} must point inside ./dist/: ${target}`)
    return null
  }

  const targetPath = resolve(projectDirectory, target)
  const pathFromProject = relative(projectDirectory, targetPath)

  if (
    pathFromProject === ".." ||
    pathFromProject.startsWith(`..${sep}`) ||
    isAbsolute(pathFromProject)
  ) {
    errors.push(`${label} escapes the package directory: ${target}`)
    return null
  }

  try {
    const targetStats = await stat(targetPath)

    if (!targetStats.isFile()) {
      errors.push(`${label} is not a file: ${target}`)
      return null
    }
  } catch {
    errors.push(`${label} does not exist after build: ${target}`)
    return null
  }

  return target.slice(2)
}

function throwContractErrors(errors) {
  if (errors.length > 0) {
    throw new Error(
      `Focus Orb package contract failed:\n- ${errors.join("\n- ")}`,
    )
  }
}

export async function validatePackageContract({
  expectedPackageIdentity,
  expectedPackedFiles,
  manifest,
  maxPackageFileBytes,
  pack,
  projectDirectory,
}) {
  const errors = []

  if (!isRecord(manifest)) {
    throw new TypeError("package.json must contain an object")
  }

  if (!isRecord(pack)) {
    throw new TypeError("pnpm pack output must contain an object")
  }

  if (!isRecord(expectedPackageIdentity)) {
    throw new TypeError(
      "expectedPackageIdentity must contain the package identity",
    )
  }

  if (!Array.isArray(expectedPackedFiles) || expectedPackedFiles.length === 0) {
    throw new TypeError(
      "expectedPackedFiles must contain the package file contract",
    )
  }

  if (!Number.isSafeInteger(maxPackageFileBytes) || maxPackageFileBytes <= 0) {
    throw new TypeError("maxPackageFileBytes must be a positive safe integer")
  }

  validateManifestMetadata(manifest, expectedPackageIdentity, errors)

  const publicTargets = collectPublicTargets(manifest, errors)
  const builtTargets = new Set()

  for (const { label, target } of publicTargets) {
    const builtTarget = await validateTargetFile(
      projectDirectory,
      target,
      label,
      errors,
    )

    if (builtTarget) {
      builtTargets.add(builtTarget)
    }
  }

  if (pack.name !== manifest.name) {
    errors.push(`Packed name ${String(pack.name)} does not match package.json`)
  }

  if (pack.version !== manifest.version) {
    errors.push(
      `Packed version ${String(pack.version)} does not match package.json`,
    )
  }

  const packedPaths = new Set()
  let packageFileSize = 0

  if (!Array.isArray(pack.files)) {
    errors.push("pnpm pack output must include a files array")
  } else {
    for (const [index, entry] of pack.files.entries()) {
      const packedPath = isRecord(entry)
        ? normalizePackPath(entry.path, `Packed file ${index + 1}`, errors)
        : null

      if (!isRecord(entry)) {
        errors.push(`Packed file ${index + 1} must contain an object`)
      } else if (packedPath) {
        if (packedPaths.has(packedPath)) {
          errors.push(`Packed file is duplicated: ${packedPath}`)
        }

        packedPaths.add(packedPath)

        if (
          !packedPath.startsWith("dist/") &&
          !allowedPackageMetadata.has(packedPath)
        ) {
          errors.push(`Unexpected file in package: ${packedPath}`)
        }

        try {
          const packedFileStats = await stat(
            resolve(projectDirectory, packedPath),
          )

          if (!packedFileStats.isFile()) {
            errors.push(`Packed path is not a file: ${packedPath}`)
          } else {
            packageFileSize += packedFileStats.size
          }
        } catch {
          errors.push(
            `Packed file does not exist in the package directory: ${packedPath}`,
          )
        }
      }
    }
  }

  const expectedPackedPaths = new Set(expectedPackedFiles)

  for (const expectedPath of expectedPackedPaths) {
    if (!packedPaths.has(expectedPath)) {
      errors.push(`Expected file is missing from the package: ${expectedPath}`)
    }
  }

  for (const packedPath of packedPaths) {
    if (!expectedPackedPaths.has(packedPath)) {
      errors.push(
        `Packed file is not declared in the package contract: ${packedPath}`,
      )
    }
  }

  for (const metadataFile of allowedPackageMetadata) {
    if (!packedPaths.has(metadataFile)) {
      errors.push(`Package is missing required metadata: ${metadataFile}`)
    }
  }

  for (const builtTarget of builtTargets) {
    if (!packedPaths.has(builtTarget)) {
      errors.push(`Public target is missing from the package: ${builtTarget}`)
    }
  }

  if (packageFileSize > maxPackageFileBytes) {
    errors.push(
      `Selected package files total ${packageFileSize} bytes exceeds the ${maxPackageFileBytes} byte package-file budget`,
    )
  }

  throwContractErrors(errors)

  return {
    fileCount: packedPaths.size,
    name: manifest.name,
    publicTargetCount: builtTargets.size,
    packageFileSize,
    version: manifest.version,
  }
}
