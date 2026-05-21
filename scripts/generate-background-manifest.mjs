import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const backgroundDirectory = path.join(projectRoot, 'public', 'assets', 'background')
const outputDirectory = path.join(projectRoot, 'src', 'generated')
const outputFile = path.join(outputDirectory, 'backgroundManifest.ts')

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

async function collectBackgroundFiles(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true })
  const sortedEntries = [...directoryEntries].sort((leftEntry, rightEntry) =>
    leftEntry.name.localeCompare(rightEntry.name, 'en'),
  )

  const backgroundFiles = []

  for (const directoryEntry of sortedEntries) {
    const absolutePath = path.join(directoryPath, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      backgroundFiles.push(...(await collectBackgroundFiles(absolutePath)))
      continue
    }

    const fileExtension = path.extname(directoryEntry.name).toLowerCase()

    if (!SUPPORTED_EXTENSIONS.has(fileExtension)) {
      continue
    }

    backgroundFiles.push(absolutePath)
  }

  return backgroundFiles
}

async function main() {
  let backgroundFilePaths = []

  try {
    backgroundFilePaths = await collectBackgroundFiles(backgroundDirectory)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      backgroundFilePaths = []
    } else {
      throw error
    }
  }

  const publicPaths = backgroundFilePaths.map((backgroundFilePath) => {
    const relativePath = path.relative(backgroundDirectory, backgroundFilePath)
    const normalizedRelativePath = relativePath.split(path.sep).join('/')

    return `/assets/background/${normalizedRelativePath}`
  })

  const fileContent = `export const BACKGROUND_IMAGE_PATHS = ${JSON.stringify(publicPaths, null, 2)} as const\n`

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(outputFile, fileContent, 'utf8')

  console.log(`Generated background manifest with ${publicPaths.length} entr${publicPaths.length === 1 ? 'y' : 'ies'}.`)
}

await main()
