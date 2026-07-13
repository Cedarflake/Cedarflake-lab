import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { App } from "../src/App"
import { CatalogCard } from "../src/components/CatalogCard"
import { ProjectCard } from "../src/components/ProjectCard"
import {
  buildingProjects,
  catalogProjectNumber,
  otherProjects,
  projectPrimaryUrl,
  projectSourceUrl,
  showcaseProjects,
} from "../src/lib/projectCatalog"
import type { ProjectEntry } from "../src/types/project"

interface ProjectCardCase {
  cardType: "catalog" | "showcase"
  markup: string
  project: ProjectEntry
}

interface RenderedProjectAction {
  href: string | undefined
  kind: string
}

const htmlAttributeEntityValues: Readonly<Record<string, string>> = {
  "&#x27;": "'",
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&quot;": '"',
}
function decodeHtmlValue(value: string) {
  return value.replace(
    /&(?:#x27|amp|gt|lt|quot);/g,
    (entity) => htmlAttributeEntityValues[entity] ?? entity,
  )
}

function readHtmlAttribute(attributes: string, name: string) {
  const value = attributes.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

  return value === undefined ? undefined : decodeHtmlValue(value)
}

function getAnchorAttributes(markup: string) {
  return [...markup.matchAll(/<a\b([^>]*)>/g)].map((match) => match[1] ?? "")
}

function getRenderedProjectActions(markup: string): readonly RenderedProjectAction[] {
  return getAnchorAttributes(markup).flatMap((attributes) => {
    const kind = readHtmlAttribute(attributes, "data-project-action")

    return kind === undefined
      ? []
      : [
          {
            href: readHtmlAttribute(attributes, "href"),
            kind,
          },
        ]
  })
}

function getRenderedText(content: string) {
  return [...content.matchAll(/(?:^|>)([^<]*)(?=<|$)/g)]
    .map((match) => decodeHtmlValue(match[1] ?? "").trim())
    .filter(Boolean)
    .join(" ")
}

function hasInvalidAnchorStructure(markup: string) {
  let depth = 0

  for (const match of markup.matchAll(/<\/?a\b[^>]*>/g)) {
    if (match[0].startsWith("</")) {
      depth -= 1

      if (depth < 0) {
        return true
      }

      continue
    }

    depth += 1

    if (depth > 1) {
      return true
    }
  }

  return depth !== 0
}

function formatProjectCard({ cardType, project }: ProjectCardCase) {
  return `${project.path} (${cardType})`
}

const html = renderToStaticMarkup(createElement(App))
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? "")
const idSet = new Set(ids)
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
const fragmentTargets = [...html.matchAll(/\shref="#([^"]+)"/g)].map((match) => match[1] ?? "")
const labelledByTargets = [...html.matchAll(/\saria-labelledby="([^"]+)"/g)].flatMap((match) =>
  (match[1] ?? "").split(" "),
)
const describedByTargets = [...html.matchAll(/\saria-describedby="([^"]+)"/g)].flatMap((match) =>
  (match[1] ?? "").split(" "),
)
const controlledTargets = [...html.matchAll(/\saria-controls="([^"]+)"/g)].flatMap((match) =>
  (match[1] ?? "").split(" "),
)
const imageTags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
const projectImageTags = imageTags.filter((tag) => /\ssrc="\/covers\//.test(tag))
const anchorMatches = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
const buttonMatches = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
const carouselButtonMatches = buttonMatches.filter((match) =>
  /\saria-controls="[^"]+"/.test(match[1] ?? ""),
)
const externalLinkTags = [...html.matchAll(/<a\b[^>]*\starget="_blank"[^>]*>/g)].map(
  (match) => match[0],
)
const headingLevels = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
  Number.parseInt(match[1] ?? "0", 10),
)
const renderedCatalogNumbers = [
  ...html.matchAll(/<div class="catalog-card__topline"><span>([BO]-\d{2})<\/span>/g),
].map((match) => match[1] ?? "")
const expectedCatalogNumbers = [
  ...buildingProjects.map(catalogProjectNumber),
  ...otherProjects.map(catalogProjectNumber),
]
const showcaseCardCases: readonly ProjectCardCase[] = showcaseProjects.map((project) => ({
  cardType: "showcase",
  markup: renderToStaticMarkup(createElement(ProjectCard, { project })),
  project,
}))
const catalogCardCases = [buildingProjects, otherProjects].flatMap((projects) =>
  projects.map((project, index) => ({
    cardType: "catalog" as const,
    markup: renderToStaticMarkup(
      createElement(CatalogCard, {
        displayNumber: catalogProjectNumber(project, index),
        project,
      }),
    ),
    project,
  })),
)
const projectCardCases: readonly ProjectCardCase[] = [...showcaseCardCases, ...catalogCardCases]
const cardsWithInvalidLifecycle = catalogCardCases.filter(({ markup, project }) => {
  const renderedLifecycle = markup.match(/\sdata-lifecycle="([^"]+)"/)?.[1]

  return renderedLifecycle !== project.lifecycle
})
const cardsWithInvalidArchiveBadge = catalogCardCases.filter(({ markup, project }) => {
  const badgeCount = [
    ...markup.matchAll(/<strong class="catalog-card__archive">Archived<\/strong>/g),
  ].length
  const expectedBadgeCount = project.lifecycle === "archived" ? 1 : 0

  return badgeCount !== expectedBadgeCount
})
const cardsWithInvalidPrimaryLink = projectCardCases.filter(({ markup, project }) => {
  const primaryLinks = getAnchorAttributes(markup).filter(
    (attributes) => readHtmlAttribute(attributes, "data-project-primary-link") === "true",
  )
  const primaryLink = primaryLinks[0] ?? ""

  return (
    primaryLinks.length !== 1 ||
    readHtmlAttribute(primaryLink, "href") !== projectPrimaryUrl(project) ||
    readHtmlAttribute(primaryLink, "aria-label") !==
      `View ${project.title} source on GitHub (opens in a new tab)`
  )
})
const cardsWithInvalidSourceAction = projectCardCases.filter(({ markup, project }) => {
  const sourceActions = getRenderedProjectActions(markup).filter(({ kind }) => kind === "source")

  return sourceActions.length !== 1 || sourceActions[0]?.href !== projectSourceUrl(project.path)
})
const cardsWithInvalidExternalAction = projectCardCases.filter(({ markup, project }) => {
  const externalActions = getRenderedProjectActions(markup).filter(({ kind }) => kind !== "source")
  const expectedAction = project.externalAction

  if (!expectedAction) {
    return externalActions.length !== 0
  }

  return (
    externalActions.length !== 1 ||
    externalActions[0]?.kind !== expectedAction.kind ||
    externalActions[0]?.href !== expectedAction.url
  )
})
const cardsWithInvalidActionOrder = projectCardCases.filter(({ markup, project }) => {
  const renderedKinds = getRenderedProjectActions(markup).map(({ kind }) => kind)
  const expectedKinds = [
    ...(project.externalAction === undefined ? [] : [project.externalAction.kind]),
    "source",
  ]

  return (
    renderedKinds.length !== expectedKinds.length ||
    renderedKinds.some((kind, index) => kind !== expectedKinds[index])
  )
})
const cardsWithInvalidLinkRoles = projectCardCases.filter(({ markup }) => {
  const anchorAttributes = getAnchorAttributes(markup)

  return anchorAttributes.some((attributes) => {
    const primaryMarker = readHtmlAttribute(attributes, "data-project-primary-link")
    const actionMarker = readHtmlAttribute(attributes, "data-project-action")
    const hasPrimaryRole = primaryMarker !== undefined
    const hasActionRole = actionMarker !== undefined

    return hasPrimaryRole === hasActionRole || (hasPrimaryRole && primaryMarker !== "true")
  })
})
const cardsWithInvalidAnchorStructure = projectCardCases.filter(({ markup }) =>
  hasInvalidAnchorStructure(markup),
)
const errors: string[] = []

function isValidHref(href: string) {
  if (!href || href !== href.trim() || href === "#") {
    return false
  }

  try {
    const url = new URL(href, "https://landing.invalid")

    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
  } catch {
    return false
  }
}

function hasExplicitAccessibleName(attributes: string) {
  const ariaLabel = attributes.match(/\saria-label="([^"]*)"/)?.[1]?.trim()
  const labelledBy = attributes.match(/\saria-labelledby="([^"]*)"/)?.[1]?.trim()

  return Boolean(ariaLabel || labelledBy)
}

function hasRenderedText(content: string) {
  return Boolean(getRenderedText(content))
}

function findMissingTargets(targets: readonly string[]) {
  return [...new Set(targets.filter((target) => target && !idSet.has(target)))]
}

const missingFragments = findMissingTargets(fragmentTargets)
const missingLabels = findMissingTargets(labelledByTargets)
const missingDescriptions = findMissingTargets(describedByTargets)
const missingControls = findMissingTargets(controlledTargets)
const imagesWithoutAlt = imageTags.filter((tag) => !/\salt="[^"]*"/.test(tag))
const imagesWithoutDimensions = imageTags.filter(
  (tag) => !/\swidth="[1-9]\d*"/.test(tag) || !/\sheight="[1-9]\d*"/.test(tag),
)
const eagerlyLoadedImages = projectImageTags.filter((tag) => !/\sloading="lazy"/.test(tag))
const synchronouslyDecodedImages = projectImageTags.filter((tag) => !/\sdecoding="async"/.test(tag))
const draggableProjectImages = projectImageTags.filter((tag) => !/\sdraggable="false"/.test(tag))
const anchorsWithoutHref = anchorMatches.filter((match) => !/\shref="[^"]*"/.test(match[1] ?? ""))
const linkHrefs = anchorMatches.flatMap((match) => {
  const href = (match[1] ?? "").match(/\shref="([^"]*)"/)?.[1]

  return href === undefined ? [] : [href]
})
const invalidLinkHrefs = [...new Set(linkHrefs.filter((href) => !isValidHref(href)))]
const unnamedLinks = anchorMatches.filter((match) => {
  const attributes = match[1] ?? ""
  const content = match[2] ?? ""
  const hasNamedImage = /<img\b[^>]*\salt="[^"]+"[^>]*>/.test(content)

  return !hasExplicitAccessibleName(attributes) && !hasRenderedText(content) && !hasNamedImage
})
const unnamedButtons = buttonMatches.filter((match) => {
  const attributes = match[1] ?? ""
  const content = match[2] ?? ""

  return !hasExplicitAccessibleName(attributes) && !hasRenderedText(content)
})
const untypedButtons = buttonMatches.filter(
  (match) => !/\stype="(?:button|submit|reset)"/.test(match[1] ?? ""),
)
const carouselButtonsWithoutAriaDisabled = carouselButtonMatches.filter(
  (match) => !/\saria-disabled="(?:true|false)"/.test(match[1] ?? ""),
)
const nativelyDisabledCarouselButtons = carouselButtonMatches.filter((match) =>
  /\sdisabled(?:=|\s|$)/.test(match[1] ?? ""),
)
const unsafeExternalLinks = externalLinkTags.filter(
  (tag) => !/\srel="[^"]*\bnoreferrer\b[^"]*"/.test(tag),
)
const headingJumps = headingLevels.filter((level, index) => {
  const previousLevel = headingLevels[index - 1]

  return previousLevel !== undefined && level > previousLevel + 1
})

if (duplicateIds.length > 0) {
  errors.push(`Duplicate IDs: ${duplicateIds.join(", ")}`)
}

if (renderedCatalogNumbers.join("\0") !== expectedCatalogNumbers.join("\0")) {
  errors.push("Catalog card numbers do not follow their rendered collection order")
}

if (cardsWithInvalidLifecycle.length > 0) {
  errors.push(
    `Catalog card lifecycle markup does not match configuration: ${cardsWithInvalidLifecycle
      .map(({ project }) => project.path)
      .join(", ")}`,
  )
}

if (cardsWithInvalidArchiveBadge.length > 0) {
  errors.push(
    `Catalog card Archived badges do not match lifecycle configuration: ${cardsWithInvalidArchiveBadge
      .map(({ project }) => project.path)
      .join(", ")}`,
  )
}

if (cardsWithInvalidPrimaryLink.length > 0) {
  errors.push(
    `Project card primary links do not match their configured destinations: ${cardsWithInvalidPrimaryLink
      .map(formatProjectCard)
      .join(", ")}`,
  )
}

if (cardsWithInvalidSourceAction.length > 0) {
  errors.push(
    `Project cards do not render exactly one derived Source action: ${cardsWithInvalidSourceAction
      .map(formatProjectCard)
      .join(", ")}`,
  )
}

if (cardsWithInvalidExternalAction.length > 0) {
  errors.push(
    `Project card external actions do not match configuration: ${cardsWithInvalidExternalAction
      .map(formatProjectCard)
      .join(", ")}`,
  )
}

if (cardsWithInvalidActionOrder.length > 0) {
  errors.push(
    `Project card actions do not render in external-then-Source order: ${cardsWithInvalidActionOrder
      .map(formatProjectCard)
      .join(", ")}`,
  )
}

if (cardsWithInvalidLinkRoles.length > 0) {
  errors.push(
    `Project card links do not declare exactly one primary or action role: ${cardsWithInvalidLinkRoles
      .map(formatProjectCard)
      .join(", ")}`,
  )
}

if (cardsWithInvalidAnchorStructure.length > 0 || hasInvalidAnchorStructure(html)) {
  errors.push(
    `Static markup contains nested or unbalanced anchors${
      cardsWithInvalidAnchorStructure.length === 0
        ? ""
        : ` in project cards: ${cardsWithInvalidAnchorStructure.map(formatProjectCard).join(", ")}`
    }`,
  )
}

if (missingFragments.length > 0) {
  errors.push(`Missing fragment targets: ${missingFragments.join(", ")}`)
}

if (missingLabels.length > 0) {
  errors.push(`Missing aria-labelledby targets: ${missingLabels.join(", ")}`)
}

if (missingDescriptions.length > 0) {
  errors.push(`Missing aria-describedby targets: ${missingDescriptions.join(", ")}`)
}

if (missingControls.length > 0) {
  errors.push(`Missing aria-controls targets: ${missingControls.join(", ")}`)
}

if (imagesWithoutAlt.length > 0) {
  errors.push(`${imagesWithoutAlt.length} images are missing alt text`)
}

if (imagesWithoutDimensions.length > 0) {
  errors.push(`${imagesWithoutDimensions.length} images are missing intrinsic dimensions`)
}

if (eagerlyLoadedImages.length > 0) {
  errors.push(`${eagerlyLoadedImages.length} project images are not lazy-loaded`)
}

if (synchronouslyDecodedImages.length > 0) {
  errors.push(`${synchronouslyDecodedImages.length} project images do not use async decoding`)
}

if (draggableProjectImages.length > 0) {
  errors.push(`${draggableProjectImages.length} project images allow native dragging`)
}

if (anchorsWithoutHref.length > 0) {
  errors.push(`${anchorsWithoutHref.length} links are missing href attributes`)
}

if (invalidLinkHrefs.length > 0) {
  errors.push(`Invalid link destinations: ${invalidLinkHrefs.join(", ")}`)
}

if (unnamedLinks.length > 0) {
  errors.push(`${unnamedLinks.length} links are missing an accessible name`)
}

if (headingLevels.filter((level) => level === 1).length !== 1) {
  errors.push("Static markup must contain exactly one h1")
}

if (headingJumps.length > 0) {
  errors.push(`${headingJumps.length} heading levels skip their expected hierarchy`)
}

if (unnamedButtons.length > 0) {
  errors.push(`${unnamedButtons.length} buttons are missing an accessible name`)
}

if (untypedButtons.length > 0) {
  errors.push(`${untypedButtons.length} buttons are missing an explicit type`)
}

if (carouselButtonsWithoutAriaDisabled.length > 0) {
  errors.push(
    `${carouselButtonsWithoutAriaDisabled.length} carousel buttons are missing an ARIA disabled state`,
  )
}

if (nativelyDisabledCarouselButtons.length > 0) {
  errors.push(
    `${nativelyDisabledCarouselButtons.length} carousel buttons use native disabled state`,
  )
}

if (unsafeExternalLinks.length > 0) {
  errors.push(`${unsafeExternalLinks.length} external links are missing noreferrer`)
}

if (errors.length > 0) {
  throw new Error(`Landing markup validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated static markup with ${ids.length} IDs, ${linkHrefs.length} links, ${projectCardCases.length} project cards, ${fragmentTargets.length} fragment targets, ${headingLevels.length} headings, ${buttonMatches.length} buttons, and ${imageTags.length} images.`,
)
