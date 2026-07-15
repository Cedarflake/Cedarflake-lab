import { createHash } from "node:crypto"

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value)
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Command payload numbers must be finite")
    }

    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`
  }

  throw new TypeError("Command payload contains an unsupported value")
}

export function hashCommandPayload(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex")
}
