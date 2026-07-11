import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { siteConfig } from "../src/config/site"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const html = readFileSync(resolve(appRoot, "index.html"), "utf8")
const errors: string[] = []

function getTags(tagName: string) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0])
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"))

  return match?.[1] ?? match?.[2]
}

function findTagByAttribute(tags: readonly string[], name: string, value: string) {
  return tags.find((tag) => getAttribute(tag, name)?.toLowerCase() === value.toLowerCase())
}

const htmlTag = getTags("html")[0]
const titleMatches = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)]
const title = titleMatches[0]?.[1]?.trim() ?? ""
const metaTags = getTags("meta")
const linkTags = getTags("link")
const scriptTags = getTags("script")
const rootTags = getTags("div").filter((tag) => getAttribute(tag, "id") === "root")
const charsetMeta = metaTags.find((tag) => getAttribute(tag, "charset")?.toLowerCase() === "utf-8")
const descriptionMeta = findTagByAttribute(metaTags, "name", "description")
const viewportMeta = findTagByAttribute(metaTags, "name", "viewport")
const themeColorMeta = findTagByAttribute(metaTags, "name", "theme-color")
const faviconLink = linkTags.find((tag) =>
  (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("icon"),
)
const heroPreload = linkTags.find(
  (tag) =>
    (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("preload") &&
    getAttribute(tag, "as")?.toLowerCase() === "image" &&
    getAttribute(tag, "href") === siteConfig.hero.brandImage,
)
const entryScript = scriptTags.find((tag) => getAttribute(tag, "src") === "/src/main.tsx")

if (!htmlTag || getAttribute(htmlTag, "lang") !== siteConfig.locale) {
  errors.push(`Document language must match the site locale: ${siteConfig.locale}`)
}

if (titleMatches.length !== 1 || !title || !title.includes(siteConfig.name)) {
  errors.push(`Document must contain one branded title: ${siteConfig.name}`)
}

if (!charsetMeta) {
  errors.push("Document is missing its UTF-8 charset declaration")
}

if (!descriptionMeta || !getAttribute(descriptionMeta, "content")?.trim()) {
  errors.push("Document is missing its description metadata")
}

if (!viewportMeta || !getAttribute(viewportMeta, "content")?.includes("width=device-width")) {
  errors.push("Document is missing its responsive viewport metadata")
}

if (!themeColorMeta || !getAttribute(themeColorMeta, "content")?.trim()) {
  errors.push("Document is missing its theme color metadata")
}

if (
  !faviconLink ||
  getAttribute(faviconLink, "href") !== "/favicon.png" ||
  getAttribute(faviconLink, "type") !== "image/png"
) {
  errors.push("Document favicon link must reference /favicon.png as image/png")
}

if (
  !heroPreload ||
  getAttribute(heroPreload, "type") !== "image/png" ||
  getAttribute(heroPreload, "fetchpriority") !== "high"
) {
  errors.push(`Document must preload the hero artwork: ${siteConfig.hero.brandImage}`)
}

if (rootTags.length !== 1) {
  errors.push("Document must contain exactly one #root mount point")
}

if (!entryScript || getAttribute(entryScript, "type") !== "module") {
  errors.push("Document is missing its module entry script")
}

if (errors.length > 0) {
  throw new Error(`Landing document validation failed:\n- ${errors.join("\n- ")}`)
}

console.log("Validated document language, metadata, resources, and application mount point.")
