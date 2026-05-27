import type {Incident, TimelineUpdate} from "@/types";

export function sortIncidentsByPublishedAt(incidents: Incident[]) {
  return [...incidents].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

export function getIncidentBySlug(incidents: Incident[], slug: string) {
  return incidents.find((incident) => incident.slug === slug) ?? null;
}

export function sortTimelineUpdates(updates: TimelineUpdate[]) {
  return [...updates].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function sortTimelineUpdatesDesc(updates: TimelineUpdate[]) {
  return [...updates].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
