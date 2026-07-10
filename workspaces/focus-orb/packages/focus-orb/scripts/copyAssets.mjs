import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const textureFileName = "noise-watercolor-m3j88gni.webp"
const sourceTexturePath = resolve(packageRoot, "src", "assets", textureFileName)
const outputTexturePath = resolve(packageRoot, "dist", "assets", textureFileName)

await mkdir(dirname(outputTexturePath), { recursive: true })
await copyFile(sourceTexturePath, outputTexturePath)
await writeFile(`${outputTexturePath}.d.ts`, "declare const src: string\n\nexport default src\n")
