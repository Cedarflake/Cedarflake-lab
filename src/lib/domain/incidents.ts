import {SEVERITY_META} from "@/lib/constants/severity";
import type {Incident, IncidentSeverity} from "@/types";

export type TimeInterval = [start: number, end: number];

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function compareSeverity(
  left: IncidentSeverity,
  right: IncidentSeverity,
) {
  return SEVERITY_META[left].level - SEVERITY_META[right].level;
}

export function getHigherSeverity(
  current: IncidentSeverity,
  candidate: IncidentSeverity,
) {
  return compareSeverity(candidate, current) > 0 ? candidate : current;
}

export function getIncidentAffectsUptime(incident: Incident) {
  return incident.affectsUptime ?? SEVERITY_META[incident.severity].affectsUptime;
}

export function getIncidentEffectiveEnd(
  incident: Incident,
  fallbackRangeEnd: string | Date,
) {
  if (incident.window.resolvedAt) {
    return toDate(incident.window.resolvedAt);
  }

  if (incident.isScheduled || incident.status === "scheduled") {
    return toDate(incident.window.expectedEndAt);
  }

  return toDate(fallbackRangeEnd);
}

export function clampIncidentInterval(
  incident: Incident,
  rangeStart: string | Date,
  rangeEnd: string | Date,
): TimeInterval | null {
  const start = Math.max(
    toDate(incident.window.startedAt).getTime(),
    toDate(rangeStart).getTime(),
  );
  const end = Math.min(
    getIncidentEffectiveEnd(incident, rangeEnd).getTime(),
    toDate(rangeEnd).getTime(),
  );

  return start < end ? [start, end] : null;
}

export function mergeIntervals(intervals: TimeInterval[]) {
  if (intervals.length === 0) {
    return [] as TimeInterval[];
  }

  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  const merged: TimeInterval[] = [sorted[0]];

  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
      continue;
    }

    merged.push([...current]);
  }

  return merged;
}

export function getIntervalMinutes(intervals: TimeInterval[]) {
  return Math.round(
    intervals.reduce((sum, [start, end]) => sum + (end - start) / 60000, 0),
  );
}

export function getIncidentIntervals(
  incidents: Incident[],
  rangeStart: string | Date,
  rangeEnd: string | Date,
  predicate?: (incident: Incident) => boolean,
) {
  return incidents
    .filter((incident) => (predicate ? predicate(incident) : true))
    .map((incident) => clampIncidentInterval(incident, rangeStart, rangeEnd))
    .filter((interval): interval is TimeInterval => interval !== null);
}
