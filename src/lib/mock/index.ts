import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import {calculateSlaSnapshot} from "@/lib/domain/uptime";

import {incidents} from "./incidents";
import {systemComponents} from "./system-components";

export const shikanekoDemoRange = {
  label: "最近 45 天",
  startedAt: "2026-04-14T00:00:00+08:00",
  endedAt: "2026-05-28T00:00:00+08:00",
  granuleStartDate: "2026-04-14",
  granuleDays: 45,
} as const;

export const shikanekoMockData = {
  systemComponents,
  incidents,
  granules: buildDailyStatusGranules({
    incidents,
    startDate: shikanekoDemoRange.granuleStartDate,
    days: shikanekoDemoRange.granuleDays,
  }),
  slaSnapshot: calculateSlaSnapshot({
    incidents,
    startedAt: shikanekoDemoRange.startedAt,
    endedAt: shikanekoDemoRange.endedAt,
    label: shikanekoDemoRange.label,
  }),
} as const;

export {incidents, systemComponents};
