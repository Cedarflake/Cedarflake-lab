import type {Incident, SystemComponent} from "@/types";

function sortIncidentsByPublishedAtDesc(incidents: Incident[]) {
  return [...incidents].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

export function getComponentIncidentCount(
  component: SystemComponent,
  incidents: Incident[],
) {
  return incidents.filter((incident) => incident.componentIds.includes(component.id)).length;
}

export function getComponentBySlug(components: SystemComponent[], slug: string) {
  return components.find((component) => component.slug === slug) ?? null;
}

export function getIncidentsByComponent(componentId: string, incidents: Incident[]) {
  return sortIncidentsByPublishedAtDesc(
    incidents.filter((incident) => incident.componentIds.includes(componentId)),
  );
}

export function getActiveIncidentsByComponent(componentId: string, incidents: Incident[]) {
  return getActiveIncidents(getIncidentsByComponent(componentId, incidents));
}

export function getUpcomingMaintenancesByComponent(
  componentId: string,
  incidents: Incident[],
  now = new Date(),
) {
  return getUpcomingMaintenances(getIncidentsByComponent(componentId, incidents), now);
}

export function getResolvedIncidentsByComponent(componentId: string, incidents: Incident[]) {
  return getIncidentsByComponent(componentId, incidents).filter(
    (incident) => incident.status === "resolved",
  );
}

export function getRecentIncidents(incidents: Incident[], limit = 10) {
  return sortIncidentsByPublishedAtDesc(incidents).slice(0, limit);
}

export function groupIncidentsByPublishedDate(incidents: Incident[]) {
  const groups = new Map<string, Incident[]>();

  for (const incident of sortIncidentsByPublishedAtDesc(incidents)) {
    const dateKey = incident.publishedAt.slice(0, 10);
    const current = groups.get(dateKey) ?? [];

    current.push(incident);
    groups.set(dateKey, current);
  }

  return Array.from(groups.entries()).map(([date, items]) => ({
    date,
    incidents: items,
  }));
}

export function getActiveIncidents(incidents: Incident[]) {
  return incidents
    .filter((incident) => incident.status !== "resolved" && !incident.isScheduled)
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
    );
}

export function getUpcomingMaintenances(incidents: Incident[], now = new Date()) {
  return incidents
    .filter(
      (incident) =>
        incident.isScheduled &&
        incident.status === "scheduled" &&
        new Date(incident.window.startedAt).getTime() >= now.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.window.startedAt).getTime() -
        new Date(right.window.startedAt).getTime(),
    );
}

export function getRecentResolvedIncidents(incidents: Incident[], limit = 4) {
  return incidents
    .filter((incident) => incident.status === "resolved")
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, limit);
}

export function getComponentsById(components: SystemComponent[]) {
  return Object.fromEntries(components.map((component) => [component.id, component]));
}
