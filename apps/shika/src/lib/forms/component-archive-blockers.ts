import type { IncidentPhase } from "@/domain/incidents"
import type { MaintenancePhase } from "@/domain/maintenance"

interface IncidentReview {
  incidentId: string
  latestTitle: string
  latestPhase: IncidentPhase
  updates: readonly {
    affectedComponents: readonly { componentId: string }[]
  }[]
}

interface MaintenanceReview {
  maintenanceWindowId: string
  phase: MaintenancePhase
  latestEvent: {
    title: string
    affectedComponents: readonly { componentId: string }[]
  }
}

export interface ComponentArchiveBlocker {
  kind: "incident" | "maintenance"
  sourceId: string
  title: string
  phase: IncidentPhase | MaintenancePhase
}

export function getComponentArchiveBlockers(
  componentId: string,
  incidents: readonly IncidentReview[],
  maintenanceWindows: readonly MaintenanceReview[],
): ComponentArchiveBlocker[] {
  const incidentBlockers = incidents.flatMap<ComponentArchiveBlocker>(
    (incident) => {
      const latestUpdate = incident.updates.at(-1)
      const isAffected = latestUpdate?.affectedComponents.some(
        (component) => component.componentId === componentId,
      )

      if (incident.latestPhase === "resolved" || !isAffected) return []

      return [
        {
          kind: "incident",
          sourceId: incident.incidentId,
          title: incident.latestTitle,
          phase: incident.latestPhase,
        },
      ]
    },
  )
  const maintenanceBlockers =
    maintenanceWindows.flatMap<ComponentArchiveBlocker>((maintenance) => {
      const isActive =
        maintenance.phase === "scheduled" ||
        maintenance.phase === "in_progress"
      const isAffected = maintenance.latestEvent.affectedComponents.some(
        (component) => component.componentId === componentId,
      )

      if (!isActive || !isAffected) return []

      return [
        {
          kind: "maintenance",
          sourceId: maintenance.maintenanceWindowId,
          title: maintenance.latestEvent.title,
          phase: maintenance.phase,
        },
      ]
    })

  return [...incidentBlockers, ...maintenanceBlockers]
}
