import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { projectCatalog } from "../src/config/projects"
import { siteConfig } from "../src/config/site"
import { workbenchCategories } from "../src/config/workbench"
import { validateProjectCatalog } from "../src/lib/projectCatalog"
import type { ProjectCover, ProjectEntry } from "../src/types/project"

interface DeploymentCopy {
  canonicalPath: string
  deployedPath: string
  label: string
}

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const publicRoot = resolve(appRoot, "public")
const repoRoot = resolve(appRoot, "../..")
const errors: string[] = []
const projects: readonly ProjectEntry[] = projectCatalog
const workbenchCategoryKeys = new Set<string>()
const workbenchCategoryIds = new Set<string>()
const referencedCoverSources = new Set<string>()

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

function validateCover(projectId: string, cover: ProjectCover) {
  if (!cover.src.startsWith("/covers/")) {
    errors.push(`Project ${projectId} cover must use the public covers directory: ${cover.src}`)
    return
  }

  referencedCoverSources.add(cover.src)

  const coverPath = resolveWithin(publicRoot, cover.src.slice(1), `Project ${projectId} cover`)

  if (!coverPath) {
    return
  }

  if (!isFile(coverPath)) {
    errors.push(`Project ${projectId} cover is missing: ${cover.src}`)
    return
  }

  if (extname(coverPath).toLowerCase() !== ".png") {
    errors.push(`Project ${projectId} cover must be a PNG: ${cover.src}`)
    return
  }

  const dimensions = readPngDimensions(coverPath)

  if (!dimensions) {
    errors.push(`Project ${projectId} cover is not a valid PNG: ${cover.src}`)
    return
  }

  if (dimensions.width !== cover.width || dimensions.height !== cover.height) {
    errors.push(
      `Project ${projectId} cover dimensions are ${dimensions.width}x${dimensions.height}, expected ${cover.width}x${cover.height}`,
    )
  }
}

validateProjectCatalog(projects)

for (const category of workbenchCategories) {
  if ([category.key, category.id, category.title].some((value) => !value.trim())) {
    errors.push(`Workbench category has missing text: ${category.key || "unknown category"}`)
  }

  if (workbenchCategoryKeys.has(category.key)) {
    errors.push(`Duplicate workbench category key: ${category.key}`)
  }

  if (workbenchCategoryIds.has(category.id)) {
    errors.push(`Duplicate workbench category id: ${category.id}`)
  }

  workbenchCategoryKeys.add(category.key)
  workbenchCategoryIds.add(category.id)
}

for (const project of projects) {
  const projectPath = resolveWithin(repoRoot, project.path, `Project ${project.id} path`)

  if (projectPath && !isDirectory(projectPath)) {
    errors.push(`Project ${project.id} path is missing: ${project.path}`)
  }

  if (project.showcase) {
    validateCover(project.id, project.showcase.cover)
  }

  if (project.presentation === "workbench" && !workbenchCategoryKeys.has(project.category)) {
    errors.push(`Project ${project.id} uses an unknown workbench category: ${project.category}`)
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

const brandPath = siteConfig.hero.brandImage.startsWith("/")
  ? resolveWithin(publicRoot, siteConfig.hero.brandImage.slice(1), "Hero brand image")
  : null

if (!brandPath) {
  errors.push(`Hero brand image must use a public-root path: ${siteConfig.hero.brandImage}`)
} else if (!isFile(brandPath)) {
  errors.push(`Hero brand image is missing: ${siteConfig.hero.brandImage}`)
}

const deploymentCopies: readonly DeploymentCopy[] = [
  {
    canonicalPath: resolve(repoRoot, "assets/Lab.png"),
    deployedPath: resolve(publicRoot, "Lab.png"),
    label: "Hero artwork",
  },
  {
    canonicalPath: resolve(repoRoot, "assets/favicon.png"),
    deployedPath: resolve(publicRoot, "favicon.png"),
    label: "Favicon",
  },
]

for (const copy of deploymentCopies) {
  if (!isFile(copy.canonicalPath)) {
    errors.push(`${copy.label} canonical asset is missing: ${copy.canonicalPath}`)
    continue
  }

  if (!isFile(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy is missing: ${copy.deployedPath}`)
    continue
  }

  if (fileHash(copy.canonicalPath) !== fileHash(copy.deployedPath)) {
    errors.push(`${copy.label} deployment copy does not match its canonical asset`)
  }
}

if (errors.length > 0) {
  throw new Error(`Landing catalog validation failed:\n- ${errors.join("\n- ")}`)
}

const coverCount = projects.filter((project) => project.showcase).length

console.log(
  `Validated ${projects.length} projects, ${workbenchCategories.length} workbench categories, ${coverCount} covers, and ${deploymentCopies.length} deployment copies.`,
)
