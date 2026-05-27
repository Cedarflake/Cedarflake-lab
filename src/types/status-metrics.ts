import type {IsoDateString, IsoDateTimeString} from "./common";
import type {IncidentId, IncidentSeverity} from "./incident";

export type SeverityMinutesBreakdown = Record<IncidentSeverity, number>;

export interface DailyStatusGranule {
  date: IsoDateString;
  highestSeverity: IncidentSeverity;
  incidentIds: IncidentId[];
  scheduledIncidentIds: IncidentId[];
  affectedMinutes: number;
  maintenanceMinutes: number;
  uptimeRatio: number;
}

export interface SlaSnapshot {
  label: string;
  startedAt: IsoDateTimeString;
  endedAt: IsoDateTimeString;
  totalMinutes: number;
  affectedMinutes: number;
  maintenanceMinutes: number;
  uptimePercentage: number;
  severityMinutes: SeverityMinutesBreakdown;
  impactedIncidentIds: IncidentId[];
  granuleCount: number;
  healthyGranuleCount: number;
  degradedGranuleCount: number;
}
