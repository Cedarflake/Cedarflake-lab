import { DomainRuleError } from "./errors"

export const statusConditions = [
  "available",
  "limited",
  "degraded",
  "unavailable",
] as const

export type StatusCondition = (typeof statusConditions)[number]
export type PublicDisposition =
  | "published"
  | "withdrawn"
  | "redacted"
  | "suppressed"

export interface StatusTransitionCandidate {
  id: string
  condition: StatusCondition
  effectiveAt: number
  recordedAt: number
  audienceOrdinal: number
  validUntil: number | null
}

export interface PublicStatusTransitionCandidate
  extends StatusTransitionCandidate {
  publicDisposition: PublicDisposition
}

export type UnknownStatusReason =
  | "not_reported"
  | "expired"
  | "withdrawn"
  | "redacted"
  | "suppressed"

export interface FreshStatusProjection {
  condition: StatusCondition
  effectiveAt: number
  validUntil: number | null
  selectedTransitionId: string
  unknownReason: null
}

export interface UnknownStatusProjection {
  condition: "unknown"
  effectiveAt: number | null
  validUntil: number | null
  selectedTransitionId: string | null
  unknownReason: UnknownStatusReason
}

export type StatusProjection = FreshStatusProjection | UnknownStatusProjection

const severityRank: Record<StatusCondition, number> = {
  available: 0,
  limited: 1,
  degraded: 2,
  unavailable: 3,
}

function compareDescending(
  left: StatusTransitionCandidate,
  right: StatusTransitionCandidate,
) {
  return (
    right.effectiveAt - left.effectiveAt ||
    right.recordedAt - left.recordedAt ||
    right.audienceOrdinal - left.audienceOrdinal ||
    right.id.localeCompare(left.id)
  )
}

export function assertValidStatusInterval(
  effectiveAt: number,
  validUntil: number | null,
) {
  if (validUntil !== null && validUntil <= effectiveAt) {
    throw new DomainRuleError(
      "INVALID_STATUS_INTERVAL",
      "validUntil must be later than effectiveAt",
    )
  }
}

function selectCurrentCandidate<T extends StatusTransitionCandidate>(
  transitions: readonly T[],
  now: number,
) {
  return transitions
    .filter((transition) => transition.effectiveAt <= now)
    .toSorted(compareDescending)[0]
}

function notReported(): UnknownStatusProjection {
  return {
    condition: "unknown",
    effectiveAt: null,
    validUntil: null,
    selectedTransitionId: null,
    unknownReason: "not_reported",
  }
}

function projectSelectedStatus(
  selected: StatusTransitionCandidate | undefined,
  now: number,
): StatusProjection {
  if (!selected) return notReported()

  if (selected.validUntil !== null && selected.validUntil <= now) {
    return {
      condition: "unknown",
      effectiveAt: selected.effectiveAt,
      validUntil: selected.validUntil,
      selectedTransitionId: selected.id,
      unknownReason: "expired",
    }
  }

  return {
    condition: selected.condition,
    effectiveAt: selected.effectiveAt,
    validUntil: selected.validUntil,
    selectedTransitionId: selected.id,
    unknownReason: null,
  }
}

export function projectOwnerStatus(
  transitions: readonly StatusTransitionCandidate[],
  now: number,
): StatusProjection {
  return projectSelectedStatus(selectCurrentCandidate(transitions, now), now)
}

export function projectPublicStatus(
  transitions: readonly PublicStatusTransitionCandidate[],
  now: number,
): StatusProjection {
  const candidates = transitions
    .filter((transition) => transition.effectiveAt <= now)
    .toSorted(compareDescending)

  const selected = candidates[0]

  if (!selected) return notReported()

  if (selected.publicDisposition !== "published") {
    return {
      condition: "unknown",
      effectiveAt: selected.effectiveAt,
      validUntil: selected.validUntil,
      selectedTransitionId: selected.id,
      unknownReason: selected.publicDisposition,
    }
  }

  return projectSelectedStatus(selected, now)
}

export type OverallCoverage = "complete" | "partial" | "none"

export interface OverallStatus {
  condition: StatusCondition | "unknown"
  coverage: OverallCoverage
  hasActiveMaintenance: boolean
}

export function deriveOverallStatus(
  projections: readonly StatusProjection[],
  hasActiveMaintenance: boolean,
): OverallStatus {
  const fresh = projections.filter(
    (projection): projection is FreshStatusProjection =>
      projection.condition !== "unknown",
  )

  const coverage: OverallCoverage =
    projections.length === 0 || fresh.length === 0
      ? "none"
      : fresh.length === projections.length
        ? "complete"
        : "partial"

  const condition = fresh.reduce<StatusCondition | "unknown">(
    (worst, projection) => {
      if (worst === "unknown") {
        return projection.condition
      }

      return severityRank[projection.condition] > severityRank[worst]
        ? projection.condition
        : worst
    },
    "unknown",
  )

  return { condition, coverage, hasActiveMaintenance }
}
