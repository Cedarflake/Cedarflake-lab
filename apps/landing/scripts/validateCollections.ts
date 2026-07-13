import { projectCatalog } from "../src/config/projects"
import { siteConfig } from "../src/config/site"
import {
  buildingProjects,
  labStats,
  otherProjects,
  showcaseProjects,
  workbenchGroups,
  workbenchProjects,
} from "../src/lib/projectCatalog"

interface OrderedProject {
  lifecycle?: "active" | "archived"
  path: string
  title: string
  updatedAt: string
}

const errors: string[] = []

function findDuplicates(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }

    seen.add(value)
  }

  return [...duplicates]
}

function validateSamePaths(
  expectedPaths: readonly string[],
  actualPaths: readonly string[],
  label: string,
) {
  const expectedSet = new Set(expectedPaths)
  const actualSet = new Set(actualPaths)
  const missingPaths = expectedPaths.filter((path) => !actualSet.has(path))
  const unexpectedPaths = actualPaths.filter((path) => !expectedSet.has(path))
  const duplicatePaths = findDuplicates(actualPaths)

  if (missingPaths.length > 0) {
    errors.push(`${label} is missing projects: ${missingPaths.join(", ")}`)
  }

  if (unexpectedPaths.length > 0) {
    errors.push(`${label} contains unexpected projects: ${unexpectedPaths.join(", ")}`)
  }

  if (duplicatePaths.length > 0) {
    errors.push(`${label} contains duplicate projects: ${duplicatePaths.join(", ")}`)
  }
}

function validateCollectionOrder(projects: readonly OrderedProject[], label: string) {
  for (let index = 1; index < projects.length; index += 1) {
    const previousProject = projects[index - 1]
    const project = projects[index]

    if (!previousProject || !project) {
      continue
    }

    const previousLifecycleRank = previousProject.lifecycle === "archived" ? 1 : 0
    const lifecycleRank = project.lifecycle === "archived" ? 1 : 0
    const lifecycleDifference = previousLifecycleRank - lifecycleRank
    const dateDifference = Date.parse(previousProject.updatedAt) - Date.parse(project.updatedAt)
    const titleDifference = previousProject.title.localeCompare(project.title, siteConfig.locale)

    if (
      lifecycleDifference > 0 ||
      (lifecycleDifference === 0 &&
        (dateDifference < 0 || (dateDifference === 0 && titleDifference > 0)))
    ) {
      errors.push(`${label} does not follow lifecycle and update ordering at ${project.path}`)
    }
  }
}

const featuredProjects = showcaseProjects.filter((project) => project.presentation === "featured")
const groupedWorkbenchProjects = workbenchGroups.flatMap((group) => group.items)
const primaryProjects = [
  ...featuredProjects,
  ...buildingProjects,
  ...groupedWorkbenchProjects,
  ...otherProjects,
]
const configuredShowcaseProjects = projectCatalog.filter((project) => "showcase" in project)

validateSamePaths(
  projectCatalog.map((project) => project.path),
  primaryProjects.map((project) => project.path),
  "Primary project collections",
)
validateSamePaths(
  configuredShowcaseProjects.map((project) => project.path),
  showcaseProjects.map((project) => project.path),
  "Showcase collection",
)
validateSamePaths(
  workbenchProjects.map((project) => project.path),
  groupedWorkbenchProjects.map((project) => project.path),
  "Workbench groups",
)

validateCollectionOrder(showcaseProjects, "Showcase collection")
validateCollectionOrder(buildingProjects, "Building collection")
validateCollectionOrder(otherProjects, "Other collection")

const categoryKeys = new Set<string>(siteConfig.workbenchCategories.map((category) => category.key))
const expectedGroupKeys = siteConfig.workbenchCategories
  .filter((category) => workbenchProjects.some((project) => project.category === category.key))
  .map((category) => category.key)
const actualGroupKeys = workbenchGroups.map((group) => group.key)

if (expectedGroupKeys.join("\0") !== actualGroupKeys.join("\0")) {
  errors.push("Workbench groups do not follow the configured category order")
}

for (const group of workbenchGroups) {
  if (!categoryKeys.has(group.key)) {
    errors.push(`Workbench group has no configured category: ${group.key}`)
    continue
  }

  for (const project of group.items) {
    if (project.category !== group.key) {
      errors.push(`Workbench project ${project.path} is in the wrong group: ${group.key}`)
    }
  }

  validateCollectionOrder(group.items, `Workbench group ${group.key}`)
}

if (labStats.length !== siteConfig.stats.length) {
  errors.push("Rendered project stats do not match the configured stat count")
}

for (const [index, configuredStat] of siteConfig.stats.entries()) {
  const stat = labStats[index]
  const expectedValue = projectCatalog
    .filter((project) => project.kind === configuredStat.kind)
    .length.toString()
    .padStart(2, "0")

  if (!stat || stat.label !== configuredStat.label || stat.value !== expectedValue) {
    errors.push(`Invalid rendered project stat: ${configuredStat.kind}`)
  }
}

if (errors.length > 0) {
  throw new Error(`Landing collection validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated ${3 + workbenchGroups.length} rendered project collections and ${labStats.length} derived stats.`,
)
