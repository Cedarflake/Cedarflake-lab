import type {EntityId, IsoDateTimeString, Visibility} from "./common";
import type {SystemComponentId} from "./system-component";

export type IncidentId = EntityId;

export type IncidentSeverity =
  | "normal"
  | "maintenance"
  | "notice"
  | "warning"
  | "critical";

export type IncidentLifecycleStatus =
  | "scheduled"
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved";

export type IncidentKind = "log" | "issue" | "maintenance";
export type TimelineAuthorType = "self" | "system";

export interface IncidentWindow {
  startedAt: IsoDateTimeString;
  expectedEndAt: IsoDateTimeString;
  expectedDurationMinutes: number;
  resolvedAt: IsoDateTimeString | null;
}

export interface TimelineUpdate {
  id: EntityId;
  incidentId: IncidentId;
  title: string;
  message: string;
  createdAt: IsoDateTimeString;
  status: IncidentLifecycleStatus;
  visibility: Visibility;
  authorType: TimelineAuthorType;
}

export interface Incident {
  id: IncidentId;
  slug: string;
  kind: IncidentKind;
  title: string;
  summary: string;
  body: string;
  severity: IncidentSeverity;
  status: IncidentLifecycleStatus;
  visibility: Visibility;
  isScheduled: boolean;
  affectsUptime?: boolean;
  componentIds: SystemComponentId[];
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  publishedAt: IsoDateTimeString;
  window: IncidentWindow;
  tags: string[];
  timeline: TimelineUpdate[];
}
