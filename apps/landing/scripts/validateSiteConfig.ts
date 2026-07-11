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
const invalidBranchCharacters = new Set(["~", "^", ":", "?", "*", "[", "\\"])

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

export function isCanonicalGitHubRepositoryUrl(value: string) {
  try {
    const repositoryUrl = new URL(value)
    const repositoryPathSegments = repositoryUrl.pathname.split("/").filter(Boolean)
    const [owner, repository] = repositoryPathSegments

    return !(
      repositoryUrl.origin !== "https://github.com" ||
      repositoryUrl.username ||
      repositoryUrl.password ||
      repositoryPathSegments.length !== 2 ||
      !owner ||
      !repository ||
      repositoryUrl.pathname !== `/${owner}/${repository}` ||
      repository.toLowerCase().endsWith(".git") ||
      repositoryUrl.search ||
      repositoryUrl.hash ||
      value.endsWith("/")
    )
  } catch {
    return false
  }
}

export function isPortableGitBranch(repositoryBranch: string) {
  const branchSegments = repositoryBranch.split("/")
  const hasInvalidBranchCharacter = [...repositoryBranch].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0

    return (
      /\s/u.test(character) ||
      codePoint < 32 ||
      codePoint === 127 ||
      invalidBranchCharacters.has(character)
    )
  })

  return !(
    repositoryBranch === "@" ||
    repositoryBranch.startsWith("-") ||
    repositoryBranch.includes("..") ||
    repositoryBranch.includes("@{") ||
    repositoryBranch.endsWith(".") ||
    hasInvalidBranchCharacter ||
    branchSegments.some(
      (segment) =>
        !segment ||
        segment.startsWith(".") ||
        segment.endsWith(".lock") ||
        segment === "." ||
        segment === "..",
    )
  )
}

function validateRepositoryConfig() {
  if (!isCanonicalGitHubRepositoryUrl(siteConfig.repositoryUrl)) {
    errors.push(`Invalid repository URL: ${siteConfig.repositoryUrl}`)
  }

  if (!isPortableGitBranch(siteConfig.repositoryBranch)) {
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
