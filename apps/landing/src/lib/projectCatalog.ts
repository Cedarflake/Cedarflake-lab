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
const projectRootByKind = {
  app: "apps",
  package: "packages",
  workbench: "workbench",
  other: "others",
} satisfies Record<ProjectKind, string>
const projectRootsBySection = {
  featured: new Set(["apps", "packages"]),
  building: new Set(["apps", "packages"]),
  workbench: new Set(["workbench"]),
  others: new Set(["others"]),
} satisfies Record<ProjectEntry["section"], ReadonlySet<string>>

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
  const titles = new Set<string>()

  for (const project of projects) {
    const requiredProjectText = [project.id, project.title, project.path, project.summary]

    if (requiredProjectText.some((value) => !value.trim())) {
      throw new Error(`Missing required project text: ${project.id || "unknown project"}`)
    }

    if (requiredProjectText.some((value) => value !== value.trim())) {
      throw new Error(`Project text has surrounding whitespace: ${project.id.trim()}`)
    }

    if (ids.has(project.id)) {
      throw new Error(`Duplicate project id: ${project.id}`)
    }

    if (paths.has(project.path)) {
      throw new Error(`Duplicate project path: ${project.path}`)
    }

    const normalizedTitle = project.title.toLowerCase()

    if (titles.has(normalizedTitle)) {
      throw new Error(`Duplicate project title: ${project.title}`)
    }

    const pathSegments = project.path.split("/")
    const projectRoot = pathSegments[0] ?? ""

    if (
      project.path.includes("\\") ||
      pathSegments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Invalid project path: ${project.id}`)
    }

    if (projectRoot !== projectRootByKind[project.kind]) {
      throw new Error(`Project kind does not match its path: ${project.id}`)
    }

    if (!projectRootsBySection[project.section].has(projectRoot)) {
      throw new Error(`Project section does not match its path: ${project.id}`)
    }

    if (project.presentation === "workbench" && pathSegments[1] !== project.category) {
      throw new Error(`Workbench category does not match its path: ${project.id}`)
    }

    if (project.presentation === "catalog") {
      if (!project.status.trim()) {
        throw new Error(`Missing catalog project status: ${project.id}`)
      }

      if (project.status !== project.status.trim()) {
        throw new Error(`Catalog project status has surrounding whitespace: ${project.id}`)
      }
    }

    if (!isValidIsoTimestamp(project.updatedAt)) {
      throw new Error(`Invalid project updatedAt: ${project.id}`)
    }

    if (project.externalUrl !== undefined) {
      try {
        if (project.externalUrl !== project.externalUrl.trim()) {
          throw new Error("Surrounding whitespace")
        }

        const externalUrl = new URL(project.externalUrl)

        if (externalUrl.protocol !== "https:" || externalUrl.username || externalUrl.password) {
          throw new Error("Unsafe URL")
        }
      } catch {
        throw new Error(`Invalid project externalUrl: ${project.id}`)
      }
    }

    if (project.showcase) {
      const { cover, label, note, tags } = project.showcase
      const showcaseText = [
        label,
        cover.src,
        cover.alt,
        ...tags,
        ...(note === undefined ? [] : [note]),
      ]
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

      if (showcaseText.some((value) => value !== value.trim())) {
        throw new Error(`Project showcase text has surrounding whitespace: ${project.id}`)
      }

      if (note !== undefined && !note.trim()) {
        throw new Error(`Invalid project showcase note: ${project.id}`)
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
    titles.add(normalizedTitle)
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

export const showcaseProjects: readonly ShowcaseProject[] = catalog
  .filter(hasShowcase)
  .sort(compareByUpdatedAt)

export const buildingProjects: readonly CatalogProject[] = catalog
  .filter(isBuildingProject)
  .sort(compareByUpdatedAt)

export const workbenchProjects: readonly WorkbenchProject[] = catalog
  .filter(isWorkbenchProject)
  .sort(compareByUpdatedAt)

export const otherProjects: readonly CatalogProject[] = catalog
  .filter(isOtherProject)
  .sort(compareByUpdatedAt)

export const workbenchGroups: readonly WorkbenchGroupData[] = siteConfig.workbenchCategories
  .map((category) => ({
    id: category.id,
    title: category.title,
    items: workbenchProjects.filter((project) => project.category === category.key),
  }))
  .filter((group) => group.items.length > 0)

export const labStats: readonly LabStat[] = siteConfig.stats.map(({ kind, label }) => ({
  value: countProjects(kind),
  label,
}))
