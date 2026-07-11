import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const stylesEntryPath = resolve(appRoot, "src/styles.css")
const stylesRoot = resolve(appRoot, "src/styles")
const styleLayers = ["foundation", "layout", "components", "pages"] as const
const importPattern = /^@import\s+["']([^"']+)["'];\s*$/gm
const commentPattern = /\/\*[\s\S]*?\*\//g
const fileNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.css$/
const errors: string[] = []

function isFile(filePath: string) {
  return existsSync(filePath) && statSync(filePath).isFile()
}

function isDirectory(directoryPath: string) {
  return existsSync(directoryPath) && statSync(directoryPath).isDirectory()
}

function listStyles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directoryPath, entry.name)

    if (entry.isDirectory()) {
      return listStyles(entryPath)
    }

    return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : []
  })
}

if (!isFile(stylesEntryPath)) {
  errors.push(`Stylesheet entrypoint is missing: ${stylesEntryPath}`)
}

if (!isDirectory(stylesRoot)) {
  errors.push(`Stylesheet root is missing: ${stylesRoot}`)
}

const entrySource = isFile(stylesEntryPath) ? readFileSync(stylesEntryPath, "utf8") : ""
const importSources = [...entrySource.matchAll(importPattern)].map((match) => match[1] ?? "")
const entryRemainder = entrySource.replace(importPattern, "").replace(commentPattern, "").trim()
const importedPaths = new Set<string>()
let previousLayerIndex = -1

if (entryRemainder) {
  errors.push("src/styles.css must remain an import-only entrypoint")
}

for (const importSource of importSources) {
  if (!importSource.endsWith(".css")) {
    errors.push(`Stylesheet import must reference a CSS file: ${importSource}`)
    continue
  }

  const importPath = resolve(dirname(stylesEntryPath), importSource)
  const pathFromStylesRoot = relative(stylesRoot, importPath)

  if (
    pathFromStylesRoot === ".." ||
    pathFromStylesRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromStylesRoot)
  ) {
    errors.push(`Stylesheet import escapes src/styles: ${importSource}`)
    continue
  }

  if (!isFile(importPath)) {
    errors.push(`Stylesheet import is missing: ${importSource}`)
    continue
  }

  if (importedPaths.has(importPath)) {
    errors.push(`Duplicate stylesheet import: ${importSource}`)
    continue
  }

  importedPaths.add(importPath)

  const layer = pathFromStylesRoot.split(sep)[0] ?? ""
  const layerIndex = styleLayers.indexOf(layer as (typeof styleLayers)[number])

  if (layerIndex === -1) {
    errors.push(`Stylesheet import uses an unknown layer: ${importSource}`)
  } else if (layerIndex < previousLayerIndex) {
    errors.push(`Stylesheet import is out of layer order: ${importSource}`)
  } else {
    previousLayerIndex = layerIndex
  }
}

const styleFiles = isDirectory(stylesRoot) ? listStyles(stylesRoot).sort() : []

for (const styleFile of styleFiles) {
  const pathFromStylesRoot = relative(stylesRoot, styleFile)
  const fileName = pathFromStylesRoot.split(sep).at(-1) ?? ""
  const source = readFileSync(styleFile, "utf8")
  const sourceWithoutComments = source.replace(commentPattern, "")

  if (!importedPaths.has(styleFile)) {
    errors.push(`Stylesheet is not imported by src/styles.css: ${pathFromStylesRoot}`)
  }

  if (!fileNamePattern.test(fileName)) {
    errors.push(`Stylesheet filename must use kebab-case: ${pathFromStylesRoot}`)
  }

  if (/@import\s/.test(sourceWithoutComments)) {
    errors.push(`Nested stylesheet imports are not allowed: ${pathFromStylesRoot}`)
  }
}

for (const layer of styleLayers) {
  const layerPrefix = `${layer}${sep}`

  if (!styleFiles.some((styleFile) => relative(stylesRoot, styleFile).startsWith(layerPrefix))) {
    errors.push(`Stylesheet layer is empty: ${layer}`)
  }
}

if (errors.length > 0) {
  throw new Error(`Landing stylesheet validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Validated ${styleFiles.length} stylesheet imports across ${styleLayers.length} ordered layers.`,
)
