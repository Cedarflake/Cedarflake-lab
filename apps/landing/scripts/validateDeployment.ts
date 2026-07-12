import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const configPath = resolve(appRoot, "vercel.json")
const rootPackagePath = resolve(appRoot, "../../package.json")
const expectedSchema = "https://openapi.vercel.sh/vercel.json"
const packageManagerPattern = /^pnpm@\d+\.\d+\.\d+$/
const errors: string[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readJsonObject(filePath: string, label: string) {
  try {
    const parsedValue: unknown = JSON.parse(readFileSync(filePath, "utf8"))

    if (isRecord(parsedValue)) {
      return parsedValue
    }

    errors.push(`${label} must contain a JSON object`)
  } catch {
    errors.push(`${label} must contain valid JSON`)
  }

  return null
}

const config = readJsonObject(configPath, "vercel.json")
const rootPackage = readJsonObject(rootPackagePath, "Root package.json")

if (config) {
  if (config["$schema"] !== expectedSchema) {
    errors.push(`vercel.json must use the official schema: ${expectedSchema}`)
  }

  if (config["installCommand"] !== "pnpm install") {
    errors.push("Vercel installCommand must remain a direct pnpm install")
  }

  const buildConfig = config["build"]
  const buildEnvironment = isRecord(buildConfig) ? buildConfig["env"] : null

  if (!isRecord(buildEnvironment)) {
    errors.push("Vercel build environment configuration is missing")
  } else if (buildEnvironment["ENABLE_EXPERIMENTAL_COREPACK"] !== "1") {
    errors.push("Vercel must enable Corepack for the workspace pnpm version")
  }
}

if (
  rootPackage &&
  (typeof rootPackage["packageManager"] !== "string" ||
    !packageManagerPattern.test(rootPackage["packageManager"]))
) {
  errors.push("Root package.json must pin a semantic pnpm packageManager version")
}

if (errors.length > 0) {
  throw new Error(`Landing deployment validation failed:\n- ${errors.join("\n- ")}`)
}

console.log("Validated Vercel deployment config with a direct pnpm install command.")
