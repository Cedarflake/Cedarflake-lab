import type {LucideIcon} from "lucide-react";
import {
  BatteryWarning,
  CircleCheckBig,
  OctagonX,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import type {IncidentSeverity} from "@/types";

export const SEVERITY_ICONS: Record<IncidentSeverity, LucideIcon> = {
  normal: CircleCheckBig,
  maintenance: Wrench,
  notice: BatteryWarning,
  warning: TriangleAlert,
  critical: OctagonX,
};
