import type {EntityId, Visibility} from "./common";
import type {IncidentSeverity} from "./incident";

export type SystemComponentId = EntityId;

export type SystemComponentCategory =
  | "health"
  | "mind"
  | "study"
  | "art";

export interface SystemComponent {
  id: SystemComponentId;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  category: SystemComponentCategory;
  order: number;
  defaultVisibility: Visibility;
  currentSeverity: IncidentSeverity;
  ownerLabel: string;
  tags: string[];
}
