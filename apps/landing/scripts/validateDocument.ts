import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { siteConfig } from "../src/config/site"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const html = readFileSync(resolve(appRoot, "index.html"), "utf8")
const doctypeMatches = [...html.matchAll(/<!doctype\s+html\s*>/gi)]
const errors: string[] = []

function getTags(tagName: string) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0])
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"))

  return match?.[1] ?? match?.[2]
}

function findTagsByAttribute(tags: readonly string[], name: string, value: string) {
  return tags.filter((tag) => getAttribute(tag, name)?.toLowerCase() === value.toLowerCase())
}

const htmlTags = getTags("html")
const headTags = getTags("head")
const bodyTags = getTags("body")
const htmlTag = htmlTags[0]
const titleMatches = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)]
const title = titleMatches[0]?.[1]?.trim() ?? ""
const metaTags = getTags("meta")
const linkTags = getTags("link")
const scriptTags = getTags("script")
const rootTags = getTags("div").filter((tag) => getAttribute(tag, "id") === "root")
const charsetMetas = metaTags.filter((tag) => getAttribute(tag, "charset") !== undefined)
const descriptionMetas = findTagsByAttribute(metaTags, "name", "description")
const viewportMetas = findTagsByAttribute(metaTags, "name", "viewport")
const themeColorMetas = findTagsByAttribute(metaTags, "name", "theme-color")
const faviconLinks = linkTags.filter((tag) =>
  (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("icon"),
)
const heroPreloads = linkTags.filter(
  (tag) =>
    (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("preload") &&
    getAttribute(tag, "as")?.toLowerCase() === "image" &&
    getAttribute(tag, "href") === siteConfig.hero.brand.src,
)
const entryScripts = scriptTags.filter((tag) => getAttribute(tag, "src") === "/src/main.tsx")
const descriptionMeta = descriptionMetas[0]
const viewportMeta = viewportMetas[0]
const themeColorMeta = themeColorMetas[0]
const faviconLink = faviconLinks[0]
const heroPreload = heroPreloads[0]
const entryScript = entryScripts[0]

if (doctypeMatches.length !== 1 || !/^\s*<!doctype\s+html\s*>/i.test(html)) {
  errors.push("Document must begin with exactly one HTML5 doctype")
}

if (htmlTags.length !== 1 || !htmlTag || getAttribute(htmlTag, "lang") !== siteConfig.locale) {
  errors.push(`Document language must match the site locale: ${siteConfig.locale}`)
}

if (headTags.length !== 1 || bodyTags.length !== 1) {
  errors.push("Document must contain exactly one head and one body")
}

if (titleMatches.length !== 1 || !title || !title.includes(siteConfig.name)) {
  errors.push(`Document must contain one branded title: ${siteConfig.name}`)
}

if (
  charsetMetas.length !== 1 ||
  getAttribute(charsetMetas[0] ?? "", "charset")?.toLowerCase() !== "utf-8"
) {
  errors.push("Document must contain exactly one UTF-8 charset declaration")
}

if (descriptionMetas.length !== 1 || !getAttribute(descriptionMeta ?? "", "content")?.trim()) {
  errors.push("Document must contain exactly one description metadata tag")
}

if (
  viewportMetas.length !== 1 ||
  !getAttribute(viewportMeta ?? "", "content")?.includes("width=device-width")
) {
  errors.push("Document must contain exactly one responsive viewport metadata tag")
}

if (themeColorMetas.length !== 1 || !getAttribute(themeColorMeta ?? "", "content")?.trim()) {
  errors.push("Document must contain exactly one theme color metadata tag")
}

if (
  faviconLinks.length !== 1 ||
  !faviconLink ||
  getAttribute(faviconLink, "href") !== "/favicon.png" ||
  getAttribute(faviconLink, "type") !== "image/png"
) {
  errors.push("Document favicon link must reference /favicon.png as image/png")
}

if (
  heroPreloads.length !== 1 ||
  !heroPreload ||
  getAttribute(heroPreload, "type") !== "image/png" ||
  getAttribute(heroPreload, "fetchpriority") !== "high"
) {
  errors.push(`Document must preload the hero artwork: ${siteConfig.hero.brand.src}`)
}

if (rootTags.length !== 1) {
  errors.push("Document must contain exactly one #root mount point")
}

if (entryScripts.length !== 1 || !entryScript || getAttribute(entryScript, "type") !== "module") {
  errors.push("Document must contain exactly one module entry script")
}

if (errors.length > 0) {
  throw new Error(`Landing document validation failed:\n- ${errors.join("\n- ")}`)
}

console.log("Validated document language, metadata, resources, and application mount point.")
