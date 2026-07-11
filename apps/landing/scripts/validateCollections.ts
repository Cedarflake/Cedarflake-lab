import { projectCatalog } from "../src/config/projects"
import { siteConfig } from "../src/config/site"
import type { WorkbenchCategory } from "../src/config/workbench"
import {
  buildingProjects,
  labStats,
  otherProjects,
  showcaseProjects,
  workbenchGroups,
  workbenchProjects,
} from "../src/lib/projectCatalog"

interface OrderedProject {
  id: string
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

function validateSameIds(
  expectedIds: readonly string[],
  actualIds: readonly string[],
  label: string,
) {
  const expectedSet = new Set(expectedIds)
  const actualSet = new Set(actualIds)
  const missingIds = expectedIds.filter((id) => !actualSet.has(id))
  const unexpectedIds = actualIds.filter((id) => !expectedSet.has(id))
  const duplicateIds = findDuplicates(actualIds)

  if (missingIds.length > 0) {
    errors.push(`${label} is missing projects: ${missingIds.join(", ")}`)
  }

  if (unexpectedIds.length > 0) {
    errors.push(`${label} contains unexpected projects: ${unexpectedIds.join(", ")}`)
  }

  if (duplicateIds.length > 0) {
    errors.push(`${label} contains duplicate projects: ${duplicateIds.join(", ")}`)
  }
}

function validateNewestFirst(projects: readonly OrderedProject[], label: string) {
  for (let index = 1; index < projects.length; index += 1) {
    const previousProject = projects[index - 1]
    const project = projects[index]

    if (!previousProject || !project) {
      continue
    }

    const dateDifference = Date.parse(previousProject.updatedAt) - Date.parse(project.updatedAt)
    const titleDifference = previousProject.title.localeCompare(project.title, siteConfig.locale)

    if (dateDifference < 0 || (dateDifference === 0 && titleDifference > 0)) {
      errors.push(`${label} is not newest-first at project ${project.id}`)
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

validateSameIds(
  projectCatalog.map((project) => project.id),
  primaryProjects.map((project) => project.id),
  "Primary project collections",
)
validateSameIds(
  configuredShowcaseProjects.map((project) => project.id),
  showcaseProjects.map((project) => project.id),
  "Showcase collection",
)
validateSameIds(
  workbenchProjects.map((project) => project.id),
  groupedWorkbenchProjects.map((project) => project.id),
  "Workbench groups",
)

validateNewestFirst(showcaseProjects, "Showcase collection")
validateNewestFirst(buildingProjects, "Building collection")
validateNewestFirst(otherProjects, "Other collection")

const categoryKeyById = new Map<string, WorkbenchCategory>(
  siteConfig.workbenchCategories.map((category) => [category.id, category.key] as const),
)
const expectedGroupIds = siteConfig.workbenchCategories
  .filter((category) => workbenchProjects.some((project) => project.category === category.key))
  .map((category) => category.id)
const actualGroupIds = workbenchGroups.map((group) => group.id)

if (expectedGroupIds.join("\0") !== actualGroupIds.join("\0")) {
  errors.push("Workbench groups do not follow the configured category order")
}

for (const group of workbenchGroups) {
  const categoryKey = categoryKeyById.get(group.id)

  if (!categoryKey) {
    errors.push(`Workbench group has no configured category: ${group.id}`)
    continue
  }

  for (const project of group.items) {
    if (project.category !== categoryKey) {
      errors.push(`Workbench project ${project.id} is in the wrong group: ${group.id}`)
    }
  }

  validateNewestFirst(group.items, `Workbench group ${group.id}`)
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
