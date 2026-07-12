import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const configPath = resolve(appRoot, "vercel.json")
const appPackagePath = resolve(appRoot, "package.json")
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

function readPackageManager(packageJson: Record<string, unknown>, label: string) {
  const packageManager = packageJson["packageManager"]

  if (typeof packageManager !== "string" || !packageManagerPattern.test(packageManager)) {
    errors.push(`${label} must pin a semantic pnpm packageManager version`)
    return null
  }

  return packageManager
}

function readNodeEngine(packageJson: Record<string, unknown>, label: string) {
  const engines = packageJson["engines"]
  const nodeEngine = isRecord(engines) ? engines["node"] : null

  if (typeof nodeEngine !== "string" || nodeEngine.trim().length === 0) {
    errors.push(`${label} must declare a Node.js engine range`)
    return null
  }

  return nodeEngine
}

const config = readJsonObject(configPath, "vercel.json")
const appPackage = readJsonObject(appPackagePath, "Landing package.json")
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

const rootPackageManager = rootPackage ? readPackageManager(rootPackage, "Root package.json") : null
const appPackageManager = appPackage ? readPackageManager(appPackage, "Landing package.json") : null
const rootNodeEngine = rootPackage ? readNodeEngine(rootPackage, "Root package.json") : null
const appNodeEngine = appPackage ? readNodeEngine(appPackage, "Landing package.json") : null

if (rootPackageManager && appPackageManager && rootPackageManager !== appPackageManager) {
  errors.push("Landing package.json must use the root pnpm packageManager version")
}

if (rootNodeEngine && appNodeEngine && rootNodeEngine !== appNodeEngine) {
  errors.push("Landing package.json must use the root Node.js engine range")
}

if (errors.length > 0) {
  throw new Error(`Landing deployment validation failed:\n- ${errors.join("\n- ")}`)
}

console.log("Validated Vercel deployment config, app runtime, and direct pnpm install command.")
