import {SEVERITY_ORDER} from "@/lib/constants/severity";
import {
  getIncidentAffectsUptime,
  getIncidentIntervals,
  getIntervalMinutes,
  mergeIntervals,
} from "@/lib/domain/incidents";
import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import type {Incident, SeverityMinutesBreakdown, SlaSnapshot} from "@/types";

export interface CalculateSlaSnapshotOptions {
  incidents: Incident[];
  startedAt: string;
  endedAt: string;
  label: string;
}

function createSeverityBreakdown(): SeverityMinutesBreakdown {
  return {
    normal: 0,
    maintenance: 0,
    notice: 0,
    warning: 0,
    critical: 0,
  };
}

function toIsoDate(value: string) {
  return value.slice(0, 10) as `${number}-${number}-${number}`;
}

function getDaySpan(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

export function calculateSlaSnapshot({
  incidents,
  startedAt,
  endedAt,
  label,
}: CalculateSlaSnapshotOptions): SlaSnapshot {
  const totalMinutes = Math.max(
    1,
    Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000,
    ),
  );

  const degradedIntervals = mergeIntervals(
    getIncidentIntervals(incidents, startedAt, endedAt, (incident) =>
      getIncidentAffectsUptime(incident),
    ),
  );

  const maintenanceIntervals = mergeIntervals(
    getIncidentIntervals(
      incidents,
      startedAt,
      endedAt,
      (incident) => incident.severity === "maintenance",
    ),
  );

  const severityMinutes = SEVERITY_ORDER.reduce((breakdown, severity) => {
    const intervals = mergeIntervals(
      getIncidentIntervals(
        incidents,
        startedAt,
        endedAt,
        (incident) => incident.severity === severity,
      ),
    );

    breakdown[severity] = getIntervalMinutes(intervals);
    return breakdown;
  }, createSeverityBreakdown());

  const affectedMinutes = getIntervalMinutes(degradedIntervals);
  const maintenanceMinutes = getIntervalMinutes(maintenanceIntervals);
  const uptimePercentage = Number(
    (((totalMinutes - affectedMinutes) / totalMinutes) * 100).toFixed(2),
  );

  const granules = buildDailyStatusGranules({
    incidents,
    startDate: toIsoDate(startedAt),
    days: getDaySpan(startedAt, endedAt),
  });

  const degradedGranuleCount = granules.filter(
    (granule) => granule.affectedMinutes > 0,
  ).length;

  return {
    label,
    startedAt,
    endedAt,
    totalMinutes,
    affectedMinutes,
    maintenanceMinutes,
    uptimePercentage,
    severityMinutes,
    impactedIncidentIds: incidents
      .filter((incident) => getIncidentAffectsUptime(incident))
      .map((incident) => incident.id),
    granuleCount: granules.length,
    healthyGranuleCount: granules.length - degradedGranuleCount,
    degradedGranuleCount,
  };
}
