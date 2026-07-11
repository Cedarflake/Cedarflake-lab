import { projectCatalog } from "../config/projects"
import { siteConfig } from "../config/site"
import type {
  CatalogProject,
  LabStat,
  ProjectEntry,
  ProjectKind,
  ShowcaseProject,
  WorkbenchGroupData,
  WorkbenchProject,
} from "../types/project"

const catalog: readonly ProjectEntry[] = projectCatalog
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

export function validateProjectCatalog(projects: readonly ProjectEntry[]) {
  const ids = new Set<string>()
  const paths = new Set<string>()

  for (const project of projects) {
    if ([project.id, project.title, project.path, project.summary].some((value) => !value.trim())) {
      throw new Error(`Missing required project text: ${project.id || "unknown project"}`)
    }

    if (ids.has(project.id)) {
      throw new Error(`Duplicate project id: ${project.id}`)
    }

    if (paths.has(project.path)) {
      throw new Error(`Duplicate project path: ${project.path}`)
    }

    if (
      !isoTimestampPattern.test(project.updatedAt) ||
      Number.isNaN(Date.parse(project.updatedAt))
    ) {
      throw new Error(`Invalid project updatedAt: ${project.id}`)
    }

    if (project.externalUrl !== undefined) {
      try {
        const externalUrl = new URL(project.externalUrl)

        if (externalUrl.protocol !== "http:" && externalUrl.protocol !== "https:") {
          throw new Error("Unsupported protocol")
        }
      } catch {
        throw new Error(`Invalid project externalUrl: ${project.id}`)
      }
    }

    if (project.showcase) {
      const { cover, label, tags } = project.showcase
      const normalizedTags = tags.map((tag) => tag.trim().toLowerCase())

      if (
        !label.trim() ||
        !cover.src.trim() ||
        !cover.alt.trim() ||
        !Number.isInteger(cover.width) ||
        !Number.isInteger(cover.height) ||
        cover.width <= 0 ||
        cover.height <= 0
      ) {
        throw new Error(`Invalid project showcase: ${project.id}`)
      }

      if (
        normalizedTags.length === 0 ||
        normalizedTags.some((tag) => !tag) ||
        new Set(normalizedTags).size !== normalizedTags.length
      ) {
        throw new Error(`Invalid project showcase tags: ${project.id}`)
      }
    }

    ids.add(project.id)
    paths.add(project.path)
  }
}

validateProjectCatalog(catalog)

function hasShowcase(project: ProjectEntry): project is ShowcaseProject {
  return project.showcase !== undefined
}

function isBuildingProject(project: ProjectEntry): project is CatalogProject {
  return project.presentation === "catalog" && project.section === "building"
}

function isWorkbenchProject(project: ProjectEntry): project is WorkbenchProject {
  return project.presentation === "workbench"
}

function isOtherProject(project: ProjectEntry): project is CatalogProject {
  return project.presentation === "catalog" && project.section === "others"
}

function countProjects(kind: ProjectKind) {
  return catalog
    .filter((project) => project.kind === kind)
    .length.toString()
    .padStart(2, "0")
}

function compareByUpdatedAt(left: ProjectEntry, right: ProjectEntry) {
  const updatedAtDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)

  if (updatedAtDifference !== 0) {
    return updatedAtDifference
  }

  return left.title.localeCompare(right.title, "en")
}

export function projectSourceUrl(path: string) {
  return `${siteConfig.repositoryUrl}/tree/${siteConfig.repositoryBranch}/${path}`
}

export function projectUrl(project: ProjectEntry) {
  return project.externalUrl ?? projectSourceUrl(project.path)
}

export const showcaseProjects = catalog.filter(hasShowcase).sort(compareByUpdatedAt)

export const buildingProjects = catalog.filter(isBuildingProject).sort(compareByUpdatedAt)

export const workbenchProjects = catalog.filter(isWorkbenchProject).sort(compareByUpdatedAt)

export const otherProjects = catalog.filter(isOtherProject).sort(compareByUpdatedAt)

export const workbenchGroups: readonly WorkbenchGroupData[] = siteConfig.workbenchCategories
  .map((category) => ({
    id: category.id,
    title: category.title,
    items: workbenchProjects.filter((project) => project.category === category.key),
  }))
  .filter((group) => group.items.length > 0)

export const labStats = siteConfig.stats.map(({ kind, label }) => ({
  value: countProjects(kind),
  label,
})) satisfies readonly LabStat[]
