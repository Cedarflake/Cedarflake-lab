import { projectCatalog } from "../config/projects"
import { siteConfig } from "../config/site"
import type {
  CatalogProject,
  LabStat,
  ProjectEntry,
  ProjectExternalActionKind,
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
const catalogProjectPrefixBySection = {
  building: "B",
  others: "O",
} satisfies Record<CatalogProject["section"], string>
const projectExternalActionKinds = new Set<ProjectExternalActionKind>(["live", "install"])

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
  const paths = new Set<string>()
  const titles = new Set<string>()

  for (const project of projects) {
    const projectLabel = project.path.trim() || project.title.trim() || "unknown project"
    const requiredProjectText = [project.title, project.path, project.summary]

    if (requiredProjectText.some((value) => !value.trim())) {
      throw new Error(`Missing required project text: ${projectLabel}`)
    }

    if (requiredProjectText.some((value) => value !== value.trim())) {
      throw new Error(`Project text has surrounding whitespace: ${projectLabel}`)
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
      throw new Error(`Invalid project path: ${projectLabel}`)
    }

    if (projectRoot !== projectRootByKind[project.kind]) {
      throw new Error(`Project kind does not match its path: ${projectLabel}`)
    }

    if (!projectRootsBySection[project.section].has(projectRoot)) {
      throw new Error(`Project section does not match its path: ${projectLabel}`)
    }

    if (project.presentation === "workbench") {
      if (pathSegments[1] !== project.category) {
        throw new Error(`Workbench category does not match its path: ${projectLabel}`)
      }

      if (project.externalAction !== undefined) {
        throw new Error(`Workbench project cannot define externalAction: ${projectLabel}`)
      }
    }

    if (project.presentation === "catalog") {
      if (!project.label.trim()) {
        throw new Error(`Missing catalog project label: ${projectLabel}`)
      }

      if (project.label !== project.label.trim()) {
        throw new Error(`Catalog project label has surrounding whitespace: ${projectLabel}`)
      }

      if (project.lifecycle !== "active" && project.lifecycle !== "archived") {
        throw new Error(`Invalid catalog project lifecycle: ${projectLabel}`)
      }
    }

    if (!isValidIsoTimestamp(project.updatedAt)) {
      throw new Error(`Invalid project updatedAt: ${projectLabel}`)
    }

    if (project.externalAction !== undefined) {
      const { kind, url } = project.externalAction

      if (!projectExternalActionKinds.has(kind)) {
        throw new Error(`Invalid project externalAction kind: ${projectLabel}`)
      }

      try {
        if (url !== url.trim()) {
          throw new Error("Surrounding whitespace")
        }

        const parsedUrl = new URL(url)

        if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
          throw new Error("Unsafe URL")
        }
      } catch {
        throw new Error(`Invalid project externalAction URL: ${projectLabel}`)
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
        throw new Error(`Invalid project showcase: ${projectLabel}`)
      }

      if (showcaseText.some((value) => value !== value.trim())) {
        throw new Error(`Project showcase text has surrounding whitespace: ${projectLabel}`)
      }

      if (note !== undefined && !note.trim()) {
        throw new Error(`Invalid project showcase note: ${projectLabel}`)
      }

      if (
        normalizedTags.length === 0 ||
        normalizedTags.some((tag) => !tag) ||
        new Set(normalizedTags).size !== normalizedTags.length
      ) {
        throw new Error(`Invalid project showcase tags: ${projectLabel}`)
      }
    }

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

function lifecycleSortRank(project: ProjectEntry) {
  return project.presentation === "catalog" && project.lifecycle === "archived" ? 1 : 0
}

function compareProjects(left: ProjectEntry, right: ProjectEntry) {
  const lifecycleDifference = lifecycleSortRank(left) - lifecycleSortRank(right)

  if (lifecycleDifference !== 0) {
    return lifecycleDifference
  }

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

export function projectPrimaryUrl(project: ProjectEntry) {
  return projectSourceUrl(project.path)
}

export function catalogProjectNumber(project: CatalogProject, index: number) {
  const prefix = catalogProjectPrefixBySection[project.section]

  return `${prefix}-${String(index + 1).padStart(2, "0")}`
}

export const showcaseProjects: readonly ShowcaseProject[] = catalog
  .filter(hasShowcase)
  .sort(compareProjects)

export const buildingProjects: readonly CatalogProject[] = catalog
  .filter(isBuildingProject)
  .sort(compareProjects)

export const workbenchProjects: readonly WorkbenchProject[] = catalog
  .filter(isWorkbenchProject)
  .sort(compareProjects)

export const otherProjects: readonly CatalogProject[] = catalog
  .filter(isOtherProject)
  .sort(compareProjects)

export const workbenchGroups: readonly WorkbenchGroupData[] = siteConfig.workbenchCategories
  .map((category) => ({
    key: category.key,
    icon: category.icon,
    title: category.title,
    items: workbenchProjects.filter((project) => project.category === category.key),
  }))
  .filter((group) => group.items.length > 0)

export const labStats: readonly LabStat[] = siteConfig.stats.map(({ kind, label }) => ({
  value: countProjects(kind),
  label,
}))
