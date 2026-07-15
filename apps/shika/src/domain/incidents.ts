import { DomainRuleError } from "./errors"

export const incidentPhases = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const

export const incidentSeverities = ["minor", "major", "critical"] as const

export type IncidentPhase = (typeof incidentPhases)[number]
export type IncidentSeverity = (typeof incidentSeverities)[number]
export type IncidentPhaseOperation = "phase_update" | "resolve" | "reopen"

export interface IncidentPhaseCommand {
  from: IncidentPhase
  to: IncidentPhase
  operation: IncidentPhaseOperation
  reason: string
}

const nonterminalPhases = new Set<IncidentPhase>([
  "investigating",
  "identified",
  "monitoring",
])

export function assertIncidentPhaseCommand({
  from,
  to,
  operation,
  reason,
}: IncidentPhaseCommand) {
  if (from === to) {
    throw new DomainRuleError(
      "INCIDENT_PHASE_UNCHANGED",
      "An incident phase command must change the phase",
    )
  }

  if (reason.trim().length === 0) {
    throw new DomainRuleError(
      "INCIDENT_REASON_REQUIRED",
      "A reason is required for every incident phase change",
    )
  }

  const isNonterminalMove =
    nonterminalPhases.has(from) && nonterminalPhases.has(to)
  const isResolution =
    nonterminalPhases.has(from) && to === "resolved" && operation === "resolve"
  const isReopen =
    from === "resolved" && to === "investigating" && operation === "reopen"

  if (
    (isNonterminalMove && operation === "phase_update") ||
    isResolution ||
    isReopen
  ) {
    return
  }

  throw new DomainRuleError(
    "INVALID_INCIDENT_PHASE_TRANSITION",
    `Cannot ${operation} an incident from ${from} to ${to}`,
  )
}
