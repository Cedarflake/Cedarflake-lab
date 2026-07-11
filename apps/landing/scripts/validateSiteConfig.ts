import { siteConfig } from "../src/config/site"
import type { ProjectKind } from "../src/types/project"

const errors: string[] = []
const projectKindCoverage = {
  app: true,
  package: true,
  workbench: true,
  other: true,
} satisfies Record<ProjectKind, true>
const expectedProjectKinds = Object.keys(projectKindCoverage) as ProjectKind[]

function validateText(value: unknown, path: string) {
  if (typeof value === "string") {
    if (!value.trim()) {
      errors.push(`${path} must not be empty`)
    } else if (value !== value.trim()) {
      errors.push(`${path} must not have surrounding whitespace`)
    }

    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateText(item, `${path}[${index}]`))
    return
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => validateText(item, `${path}.${key}`))
  }
}

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

function validateUnique(values: readonly string[], label: string) {
  const duplicates = findDuplicates(values)

  if (duplicates.length > 0) {
    errors.push(`Duplicate ${label}: ${duplicates.join(", ")}`)
  }
}

function validateRepositoryConfig() {
  try {
    const repositoryUrl = new URL(siteConfig.repositoryUrl)

    if (
      repositoryUrl.protocol !== "https:" ||
      repositoryUrl.username ||
      repositoryUrl.password ||
      repositoryUrl.pathname === "/" ||
      repositoryUrl.search ||
      repositoryUrl.hash ||
      siteConfig.repositoryUrl.endsWith("/")
    ) {
      throw new Error("Invalid repository URL")
    }
  } catch {
    errors.push(`Invalid repository URL: ${siteConfig.repositoryUrl}`)
  }

  const branchSegments = siteConfig.repositoryBranch.split("/")

  if (
    siteConfig.repositoryBranch.includes("\\") ||
    branchSegments.some(
      (segment) => !segment || segment !== segment.trim() || segment === "." || segment === "..",
    )
  ) {
    errors.push(`Invalid repository branch: ${siteConfig.repositoryBranch}`)
  }
}

validateText(siteConfig, "siteConfig")
validateRepositoryConfig()

try {
  new Intl.DateTimeFormat(siteConfig.locale, { timeZone: siteConfig.timeZone })
} catch {
  errors.push(`Invalid locale or time zone: ${siteConfig.locale}, ${siteConfig.timeZone}`)
}

const statKinds = siteConfig.stats.map((stat) => stat.kind)
const statLabels = siteConfig.stats.map((stat) => stat.label)
const missingProjectKinds = expectedProjectKinds.filter((kind) => !statKinds.includes(kind))

validateUnique(statKinds, "project stat kinds")
validateUnique(statLabels, "project stat labels")

if (missingProjectKinds.length > 0) {
  errors.push(`Missing project stat kinds: ${missingProjectKinds.join(", ")}`)
}

validateUnique(
  siteConfig.navigation.map((item) => item.href),
  "navigation destinations",
)
validateUnique(siteConfig.hero.ruler, "hero ruler labels")
validateUnique(siteConfig.openBench.commands, "repository commands")

const sections = Object.values(siteConfig.sections)

validateUnique([...sections.map((section) => section.id), siteConfig.openBench.id], "section IDs")
validateUnique(
  [...sections.map((section) => section.heading.titleId), siteConfig.openBench.titleId],
  "section title IDs",
)

if (errors.length > 0) {
  throw new Error(`Landing site configuration validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated site configuration with ${siteConfig.stats.length} stats, ${siteConfig.navigation.length} navigation links, ${sections.length} sections, and ${siteConfig.openBench.commands.length} commands.`,
)
