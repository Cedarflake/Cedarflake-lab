export interface DebugMode {
  isEnabled: boolean
  label: string
  noObstacles: boolean
}

const disabledTokens = new Set(["0", "false", "off", "none"])
const noObstacleTokens = new Set([
  "",
  "1",
  "true",
  "yes",
  "clear-road",
  "clear_road",
  "no-obstacles",
  "no_obstacles",
])
const defaultDebugMode: DebugMode = {
  isEnabled: false,
  label: "",
  noObstacles: false,
}

function splitDebugValue(value: string) {
  return value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => !disabledTokens.has(token))
}

export function resolveDebugModeFromSearch(search: string): DebugMode {
  const params = new URLSearchParams(search)
  const debugValues = params.getAll("debug")

  if (params.get("noObstacles") === "1") {
    debugValues.push("no-obstacles")
  }

  if (debugValues.length === 0) {
    return defaultDebugMode
  }

  const tokens = debugValues.flatMap(splitDebugValue)
  const noObstacles = tokens.some((token) => noObstacleTokens.has(token))

  if (!noObstacles) {
    return defaultDebugMode
  }

  return {
    isEnabled: true,
    label: "No obstacles",
    noObstacles,
  }
}

export function resolveDebugMode(): DebugMode {
  if (typeof window === "undefined") {
    return defaultDebugMode
  }

  return resolveDebugModeFromSearch(window.location.search)
}
