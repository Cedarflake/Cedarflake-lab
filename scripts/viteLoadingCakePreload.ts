import type { HtmlTagDescriptor, IndexHtmlTransformContext, Plugin } from "vite"

import { loadingCakeAssetPreloads, loadingCakePreloadAttribute } from "../src/app/loadingCakeAssets"
import type { LoadingCakePreloadAsset } from "../src/app/loadingCakeAssets"

type BuildBundle = NonNullable<IndexHtmlTransformContext["bundle"]>
type HtmlTagAttributes = NonNullable<HtmlTagDescriptor["attrs"]>

const loadingCakeChunkNamePrefix = "assets/LoadingCake-"
const earlyLoadingCakePreloadAttribute = "data-loading-cake-module-preload"

function isPreloadAlreadyInHtml(html: string, fileName: string) {
  return html.includes(`href="/${fileName}"`) || html.includes(`href="${fileName}"`)
}

function findLoadingCakeChunk(bundle: BuildBundle) {
  return Object.values(bundle).find(
    (output) => output.type === "chunk" && output.fileName.startsWith(loadingCakeChunkNamePrefix),
  )
}

function collectImportedChunkFileNames(
  bundle: BuildBundle,
  fileName: string,
  collectedFileNames: Set<string>,
) {
  const output = bundle[fileName]

  if (!output || output.type !== "chunk") {
    return
  }

  for (const importedFileName of output.imports) {
    if (collectedFileNames.has(importedFileName)) {
      continue
    }

    collectedFileNames.add(importedFileName)
    collectImportedChunkFileNames(bundle, importedFileName, collectedFileNames)
  }
}

function resolveLoadingCakeModulePreloads(bundle: BuildBundle, html: string) {
  const loadingCakeChunk = findLoadingCakeChunk(bundle)

  if (!loadingCakeChunk) {
    return []
  }

  const fileNames = new Set<string>([loadingCakeChunk.fileName])
  collectImportedChunkFileNames(bundle, loadingCakeChunk.fileName, fileNames)

  return [...fileNames]
    .filter((fileName) => fileName.startsWith("assets/") && !fileName.startsWith("assets/index-"))
    .filter((fileName) => !isPreloadAlreadyInHtml(html, fileName))
    .sort()
}

function createLoadingCakeAssetPreloadAttrs(asset: LoadingCakePreloadAsset): HtmlTagAttributes {
  const attrs: HtmlTagAttributes = {
    [loadingCakePreloadAttribute]: asset.href,
    as: asset.as,
    fetchpriority: "high",
    href: asset.href,
    rel: "preload",
    type: asset.type,
  }

  if (asset.as === "fetch") {
    attrs.crossorigin = "anonymous"
  }

  return attrs
}

function createLoadingCakeAssetPreloadTags(): HtmlTagDescriptor[] {
  return loadingCakeAssetPreloads.map((asset) => ({
    attrs: createLoadingCakeAssetPreloadAttrs(asset),
    injectTo: "head",
    tag: "link",
  }))
}

function createLoadingCakeModulePreloadTags(fileNames: string[]): HtmlTagDescriptor[] {
  return fileNames.map((fileName) => ({
    attrs: {
      [earlyLoadingCakePreloadAttribute]: "true",
      crossorigin: "",
      href: `/${fileName}`,
      rel: "modulepreload",
    },
    injectTo: "head",
    tag: "link",
  }))
}

export function preloadLoadingCakeInHtml(): Plugin {
  return {
    name: "preload-loading-cake-in-html",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const modulePreloads = context.bundle
          ? createLoadingCakeModulePreloadTags(
              resolveLoadingCakeModulePreloads(context.bundle, html),
            )
          : []

        return [...createLoadingCakeAssetPreloadTags(), ...modulePreloads]
      },
    },
  }
}
