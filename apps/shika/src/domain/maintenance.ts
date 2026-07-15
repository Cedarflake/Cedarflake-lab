import { DomainRuleError } from "./errors"

export const maintenancePhases = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const

export type MaintenancePhase = (typeof maintenancePhases)[number]
export type MaintenanceOperation =
  | "reschedule"
  | "start"
  | "complete"
  | "cancel"

export interface MaintenancePhaseCommand {
  phase: MaintenancePhase
  operation: MaintenanceOperation
}

export function assertMaintenanceWindow(startsAt: number, endsAt: number) {
  if (startsAt >= endsAt) {
    throw new DomainRuleError(
      "INVALID_MAINTENANCE_WINDOW",
      "Maintenance must end after it starts",
    )
  }
}

export function nextMaintenancePhase({
  phase,
  operation,
}: MaintenancePhaseCommand): MaintenancePhase {
  const nextByOperation: Partial<
    Record<MaintenancePhase, Partial<Record<MaintenanceOperation, MaintenancePhase>>>
  > = {
    scheduled: {
      reschedule: "scheduled",
      start: "in_progress",
      cancel: "cancelled",
    },
    in_progress: {
      complete: "completed",
      cancel: "cancelled",
    },
  }

  const next = nextByOperation[phase]?.[operation]

  if (!next) {
    throw new DomainRuleError(
      "INVALID_MAINTENANCE_TRANSITION",
      `Cannot ${operation} maintenance in phase ${phase}`,
    )
  }

  return next
}
