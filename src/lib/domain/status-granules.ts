import {
  clampIncidentInterval,
  getHigherSeverity,
  getIncidentAffectsUptime,
  getIncidentIntervals,
  getIntervalMinutes,
  mergeIntervals,
} from "@/lib/domain/incidents";
import type {
  DailyStatusGranule,
  Incident,
  IncidentSeverity,
  IsoDateString,
  SystemComponentId,
} from "@/types";

export interface BuildDailyStatusGranulesOptions {
  incidents: Incident[];
  startDate: IsoDateString;
  days: number;
  componentId?: SystemComponentId;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date): IsoDateString {
  return date.toISOString().slice(0, 10) as IsoDateString;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function buildDailyStatusGranules({
  incidents,
  startDate,
  days,
  componentId,
}: BuildDailyStatusGranulesOptions): DailyStatusGranule[] {
  const start = startOfDay(new Date(`${startDate}T00:00:00.000Z`));
  const scopedIncidents = componentId
    ? incidents.filter((incident) => incident.componentIds.includes(componentId))
    : incidents;

  return Array.from({length: days}, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);

    const overlappingIncidents = scopedIncidents.filter(
      (incident) => clampIncidentInterval(incident, dayStart, dayEnd) !== null,
    );

    const highestSeverity = overlappingIncidents.reduce<IncidentSeverity>(
      (current, incident) => getHigherSeverity(current, incident.severity),
      "normal",
    );

    const affectedMinutes = getIntervalMinutes(
      mergeIntervals(
        getIncidentIntervals(
          overlappingIncidents,
          dayStart,
          dayEnd,
          (incident) => getIncidentAffectsUptime(incident),
        ),
      ),
    );

    const maintenanceMinutes = getIntervalMinutes(
      mergeIntervals(
        getIncidentIntervals(
          overlappingIncidents,
          dayStart,
          dayEnd,
          (incident) => incident.severity === "maintenance",
        ),
      ),
    );

    return {
      date: formatDate(dayStart),
      highestSeverity,
      incidentIds: overlappingIncidents.map((incident) => incident.id),
      scheduledIncidentIds: overlappingIncidents
        .filter((incident) => incident.isScheduled)
        .map((incident) => incident.id),
      affectedMinutes,
      maintenanceMinutes,
      uptimeRatio: Math.max(0, 1 - affectedMinutes / 1440),
    };
  });
}
