export const TRUSTED_SKIP_MESSAGE_TYPE = "youtube-auto-resume:trusted-skip"

export interface TrustedSkipRequest {
  type: typeof TRUSTED_SKIP_MESSAGE_TYPE
  x: number
  y: number
}

export interface TrustedSkipResponse {
  ok: boolean
  error?: string
}

interface UnknownRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

export function isTrustedSkipRequest(
  value: unknown,
): value is TrustedSkipRequest {
  return (
    isRecord(value)
    && value.type === TRUSTED_SKIP_MESSAGE_TYPE
    && isCoordinate(value.x)
    && isCoordinate(value.y)
  )
}

export function isTrustedSkipResponse(
  value: unknown,
): value is TrustedSkipResponse {
  return isRecord(value) && typeof value.ok === "boolean"
}
