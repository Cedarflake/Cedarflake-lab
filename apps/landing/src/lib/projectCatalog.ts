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
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/

function isValidIsoTimestamp(value: string) {
  const match = isoTimestampPattern.exec(value)

  if (!match) {
    return false
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"))
  const zone = match[8]
  const offsetDirection = match[9] === "-" ? -1 : 1
  const offsetHour = Number(match[10] ?? "0")
  const offsetMinute = Number(match[11] ?? "0")
  const offset = zone === "Z" ? 0 : offsetDirection * (offsetHour * 60 + offsetMinute)
  const localDate = new Date(timestamp + offset * 60_000)

  return (
    localDate.getUTCFullYear() === year &&
    localDate.getUTCMonth() + 1 === month &&
    localDate.getUTCDate() === day &&
    localDate.getUTCHours() === hour &&
    localDate.getUTCMinutes() === minute &&
    localDate.getUTCSeconds() === second &&
    localDate.getUTCMilliseconds() === millisecond
  )
}

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

    const pathSegments = project.path.split("/")

    if (
      project.path.includes("\\") ||
      pathSegments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Invalid project path: ${project.id}`)
    }

    if (project.presentation === "catalog" && !project.status.trim()) {
      throw new Error(`Missing catalog project status: ${project.id}`)
    }

    if (!isValidIsoTimestamp(project.updatedAt)) {
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

if (import.meta.env?.DEV) {
  validateProjectCatalog(catalog)
}

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

  return left.title.localeCompare(right.title, siteConfig.locale)
}

function encodeUrlPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export function projectSourceUrl(path: string) {
  return `${siteConfig.repositoryUrl}/tree/${encodeUrlPath(siteConfig.repositoryBranch)}/${encodeUrlPath(path)}`
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
