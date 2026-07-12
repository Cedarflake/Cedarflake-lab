import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { App } from "../src/App"

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
  return [...content.matchAll(/(?:^|>)([^<]*)(?=<|$)/g)].some((match) =>
    Boolean((match[1] ?? "").trim()),
  )
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
  `Validated static markup with ${ids.length} IDs, ${linkHrefs.length} links, ${fragmentTargets.length} fragment targets, ${headingLevels.length} headings, ${buttonMatches.length} buttons, and ${imageTags.length} images.`,
)
