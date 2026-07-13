import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { inflateSync } from "node:zlib"

import { projectCatalog } from "../src/config/projects"
import { workbenchCategories } from "../src/config/projects/workbench"
import { siteConfig } from "../src/config/site"
import { validateProjectCatalog } from "../src/lib/projectCatalog"
import type { ProjectCover, ProjectEntry } from "../src/types/project"
import { appRoot, repositoryRoot, validationContext } from "./repositoryContext"

interface DeploymentCopy {
  canonicalRelativePath: string
  deployedPath: string
  label: string
  mustBeSquare?: boolean
}

const publicRoot = resolve(appRoot, "public")
const projectPathRoot = repositoryRoot ?? appRoot
const errors: string[] = []
const projects: readonly ProjectEntry[] = projectCatalog
const workbenchCategoryKeys = new Set<string>()
const workbenchCategoryTitles = new Set<string>()
const referencedCoverSources = new Set<string>()
const coverProjectBySource = new Map<string, string>()
const catalogProjectPaths = new Set(projects.map((project) => project.path))
const catalogCoverageExclusions = new Set(["apps/landing"])

function resolveWithin(root: string, relativePath: string, label: string) {
  const targetPath = resolve(root, relativePath)
  const pathFromRoot = relative(root, targetPath)

  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    errors.push(`${label} escapes its allowed root: ${relativePath}`)
    return null
  }

  return targetPath
}

function isFile(filePath: string) {
  return existsSync(filePath) && statSync(filePath).isFile()
}

function isDirectory(directoryPath: string) {
  return existsSync(directoryPath) && statSync(directoryPath).isDirectory()
}

function fileHash(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function listFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directoryPath, entry.name)

    if (entry.isDirectory()) {
      return listFiles(entryPath)
    }

    return entry.isFile() ? [entryPath] : []
  })
}

function listDirectories(directoryPath: string) {
  if (!isDirectory(directoryPath)) {
    errors.push(`Project collection directory is missing: ${directoryPath}`)
    return []
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(directoryPath, entry.name))
}

function toRepositoryPath(directoryPath: string) {
  return relative(projectPathRoot, directoryPath).split(sep).join("/")
}

function discoverProjectPaths() {
  const discoveredPaths: string[] = []

  if (!repositoryRoot) {
    return discoveredPaths
  }

  for (const collection of ["apps", "packages"]) {
    discoveredPaths.push(
      ...listDirectories(resolve(repositoryRoot, collection)).map(toRepositoryPath),
    )
  }

  for (const collection of ["workbench", "others"]) {
    for (const categoryPath of listDirectories(resolve(repositoryRoot, collection))) {
      discoveredPaths.push(...listDirectories(categoryPath).map(toRepositoryPath))
    }
  }

  return discoveredPaths
}

function readPngDimensions(filePath: string) {
  const header = readFileSync(filePath).subarray(0, 24)
  const pngSignature = "89504e470d0a1a0a"

  if (header.length < 24 || header.subarray(0, 8).toString("hex") !== pngSignature) {
    return null
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  }
}

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function getPngFilterPredictor(filterType: number, left: number, above: number, upperLeft: number) {
  switch (filterType) {
    case 0:
      return 0
    case 1:
      return left
    case 2:
      return above
    case 3:
      return Math.floor((left + above) / 2)
    case 4:
      return paethPredictor(left, above, upperLeft)
    default:
      return null
  }
}

function hasTransparentRgbaPixel(filePath: string) {
  try {
    const source = readFileSync(filePath)
    const pngSignature = "89504e470d0a1a0a"

    if (
      source.length < 33 ||
      source.subarray(0, 8).toString("hex") !== pngSignature ||
      source.toString("ascii", 12, 16) !== "IHDR"
    ) {
      return false
    }

    const width = source.readUInt32BE(16)
    const height = source.readUInt32BE(20)
    const bitDepth = source.readUInt8(24)
    const colorType = source.readUInt8(25)
    const interlaceMethod = source.readUInt8(28)

    if (width === 0 || height === 0 || bitDepth !== 8 || colorType !== 6 || interlaceMethod !== 0) {
      return false
    }

    const imageDataChunks: Buffer[] = []
    let chunkOffset = 8

    while (chunkOffset + 12 <= source.length) {
      const chunkLength = source.readUInt32BE(chunkOffset)
      const chunkType = source.toString("ascii", chunkOffset + 4, chunkOffset + 8)
      const dataStart = chunkOffset + 8
      const dataEnd = dataStart + chunkLength

      if (dataEnd + 4 > source.length) {
        return false
      }

      if (chunkType === "IDAT") {
        imageDataChunks.push(source.subarray(dataStart, dataEnd))
      }

      chunkOffset = dataEnd + 4

      if (chunkType === "IEND") {
        break
      }
    }

    if (imageDataChunks.length === 0) {
      return false
    }

    const bytesPerPixel = 4
    const rowLength = width * bytesPerPixel
    const inflated = inflateSync(Buffer.concat(imageDataChunks))
    const expectedLength = (rowLength + 1) * height

    if (inflated.length !== expectedLength) {
      return false
    }

    let previousRow = Buffer.alloc(rowLength)
    let currentRow = Buffer.alloc(rowLength)
    let sourceOffset = 0

    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
      const filterType = inflated.readUInt8(sourceOffset)
      sourceOffset += 1

      for (let byteIndex = 0; byteIndex < rowLength; byteIndex += 1) {
        const encodedValue = inflated.readUInt8(sourceOffset)
        const left =
          byteIndex >= bytesPerPixel ? currentRow.readUInt8(byteIndex - bytesPerPixel) : 0
        const above = previousRow.readUInt8(byteIndex)
        const upperLeft =
          byteIndex >= bytesPerPixel ? previousRow.readUInt8(byteIndex - bytesPerPixel) : 0
        const predictor = getPngFilterPredictor(filterType, left, above, upperLeft)

        if (predictor === null) {
          return false
        }

        currentRow.writeUInt8((encodedValue + predictor) & 0xff, byteIndex)
        sourceOffset += 1
      }

      for (let alphaIndex = 3; alphaIndex < rowLength; alphaIndex += bytesPerPixel) {
        if (currentRow.readUInt8(alphaIndex) < 255) {
          return true
        }
      }

      const completedRow = previousRow
      previousRow = currentRow
      currentRow = completedRow
    }

    return false
  } catch {
    return false
  }
}

function validateCover(projectPath: string, cover: ProjectCover) {
  if (!cover.src.startsWith("/covers/")) {
    errors.push(`Project ${projectPath} cover must use the public covers directory: ${cover.src}`)
    return
  }

  const existingProjectPath = coverProjectBySource.get(cover.src)

  if (existingProjectPath) {
    errors.push(
      `Projects ${existingProjectPath} and ${projectPath} reuse the same cover: ${cover.src}`,
    )
  } else {
    coverProjectBySource.set(cover.src, projectPath)
  }

  referencedCoverSources.add(cover.src)

  const coverPath = resolveWithin(publicRoot, cover.src.slice(1), `Project ${projectPath} cover`)

  if (!coverPath) {
    return
  }

  if (!isFile(coverPath)) {
    errors.push(`Project ${projectPath} cover is missing: ${cover.src}`)
    return
  }

  if (extname(coverPath).toLowerCase() !== ".png") {
    errors.push(`Project ${projectPath} cover must be a PNG: ${cover.src}`)
    return
  }

  const dimensions = readPngDimensions(coverPath)

  if (!dimensions) {
    errors.push(`Project ${projectPath} cover is not a valid PNG: ${cover.src}`)
    return
  }

  if (dimensions.width !== cover.width || dimensions.height !== cover.height) {
    errors.push(
      `Project ${projectPath} cover dimensions are ${dimensions.width}x${dimensions.height}, expected ${cover.width}x${cover.height}`,
    )
  }
}

function validateWorkbenchExternalActionGuard() {
  const invalidWorkbenchProject = {
    title: "Invalid Workbench Action Fixture",
    path: "workbench/fixtures/invalid-external-action",
    updatedAt: "2026-07-13T00:00:00Z",
    summary: "Exercises the runtime guard for source-only workbench entries.",
    kind: "workbench",
    presentation: "workbench",
    section: "workbench",
    category: "fixtures",
    externalAction: {
      kind: "live",
      url: "https://example.com/",
    },
  } as const

  try {
    validateProjectCatalog([invalidWorkbenchProject as unknown as ProjectEntry])
    errors.push("Workbench externalAction guard accepted an invalid fixture")
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("Workbench project cannot define externalAction:")
    ) {
      errors.push("Workbench externalAction guard returned an unexpected validation error")
    }
  }
}

validateProjectCatalog(projects)
validateWorkbenchExternalActionGuard()

const discoveredProjectPaths = discoverProjectPaths()

for (const projectPath of discoveredProjectPaths) {
  if (!catalogProjectPaths.has(projectPath) && !catalogCoverageExclusions.has(projectPath)) {
    errors.push(`Unlisted project directory: ${projectPath}`)
  }
}

for (const category of workbenchCategories) {
  const normalizedTitle = category.title.trim().toLowerCase()

  if ([category.key, category.title].some((value) => !value.trim())) {
    errors.push(`Workbench category has missing text: ${category.key || "unknown category"}`)
  }

  if (workbenchCategoryKeys.has(category.key)) {
    errors.push(`Duplicate workbench category key: ${category.key}`)
  }

  if (workbenchCategoryTitles.has(normalizedTitle)) {
    errors.push(`Duplicate workbench category title: ${category.title}`)
  }

  workbenchCategoryKeys.add(category.key)
  workbenchCategoryTitles.add(normalizedTitle)
}

for (const project of projects) {
  const resolvedProjectPath = resolveWithin(
    projectPathRoot,
    project.path,
    `Project ${project.path} path`,
  )

  if (repositoryRoot && resolvedProjectPath && !isDirectory(resolvedProjectPath)) {
    errors.push(`Project path is missing: ${project.path}`)
  }

  if (project.showcase) {
    validateCover(project.path, project.showcase.cover)
  }

  if (project.presentation === "workbench" && !workbenchCategoryKeys.has(project.category)) {
    errors.push(`Project ${project.path} uses an unknown workbench category: ${project.category}`)
  }
}

const coverDirectory = resolve(publicRoot, "covers")

if (!isDirectory(coverDirectory)) {
  errors.push(`Public cover directory is missing: ${coverDirectory}`)
} else {
  for (const coverPath of listFiles(coverDirectory)) {
    const coverSource = `/${relative(publicRoot, coverPath).split(sep).join("/")}`

    if (!referencedCoverSources.has(coverSource)) {
      errors.push(`Unreferenced cover asset: ${coverSource}`)
    }
  }
}

const heroBrand = siteConfig.hero.brand
const brandPath = heroBrand.src.startsWith("/")
  ? resolveWithin(publicRoot, heroBrand.src.slice(1), "Hero brand image")
  : null

if (!brandPath) {
  errors.push(`Hero brand image must use a public-root path: ${heroBrand.src}`)
} else if (!isFile(brandPath)) {
  errors.push(`Hero brand image is missing: ${heroBrand.src}`)
} else {
  const dimensions = readPngDimensions(brandPath)

  if (!dimensions) {
    errors.push(`Hero brand image is not a valid PNG: ${heroBrand.src}`)
  } else if (
    !Number.isInteger(heroBrand.width) ||
    !Number.isInteger(heroBrand.height) ||
    heroBrand.width <= 0 ||
    heroBrand.height <= 0 ||
    dimensions.width !== heroBrand.width ||
    dimensions.height !== heroBrand.height
  ) {
    errors.push(
      `Hero brand image dimensions are ${dimensions.width}x${dimensions.height}, expected ${heroBrand.width}x${heroBrand.height}`,
    )
  } else if (!hasTransparentRgbaPixel(brandPath)) {
    errors.push(`Hero brand image must contain transparent pixels: ${heroBrand.src}`)
  }
}

const deploymentCopies: readonly DeploymentCopy[] = [
  {
    canonicalRelativePath: "assets/Lab.png",
    deployedPath: resolve(publicRoot, "Lab.png"),
    label: "Canonical Lab artwork",
  },
  {
    canonicalRelativePath: "assets/favicon.png",
    deployedPath: resolve(publicRoot, "favicon.png"),
    label: "Favicon",
    mustBeSquare: true,
  },
]

for (const copy of deploymentCopies) {
  if (!isFile(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy is missing: ${copy.deployedPath}`)
    continue
  }

  const deployedDimensions = readPngDimensions(copy.deployedPath)

  if (!deployedDimensions) {
    errors.push(`${copy.label} deployment copy is not a valid PNG`)
  }

  if (copy.mustBeSquare && deployedDimensions?.width !== deployedDimensions?.height) {
    errors.push(`${copy.label} deployment copy must be square`)
  }

  if (!repositoryRoot) {
    continue
  }

  const canonicalPath = resolve(repositoryRoot, copy.canonicalRelativePath)

  if (!isFile(canonicalPath)) {
    errors.push(`${copy.label} canonical asset is missing: ${canonicalPath}`)
    continue
  }

  const canonicalDimensions = readPngDimensions(canonicalPath)

  if (!canonicalDimensions) {
    errors.push(`${copy.label} canonical asset is not a valid PNG`)
  }

  if (copy.mustBeSquare && canonicalDimensions?.width !== canonicalDimensions?.height) {
    errors.push(`${copy.label} canonical asset must be square`)
  }

  if (fileHash(canonicalPath) !== fileHash(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy does not match its canonical asset`)
  }
}

if (errors.length > 0) {
  throw new Error(`Landing catalog validation failed:\n- ${errors.join("\n- ")}`)
}

const coverCount = projects.filter((project) => project.showcase).length

console.log(
  `Validated ${projects.length} catalog projects in ${validationContext} context across ${discoveredProjectPaths.length} repository directories, ${workbenchCategories.length} workbench categories, ${coverCount} covers, and ${deploymentCopies.length} deployment assets.`,
)
