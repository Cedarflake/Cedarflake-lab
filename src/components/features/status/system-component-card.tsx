import type {DailyStatusGranule, IncidentSeverity, SystemComponent} from "@/types";

import {StatusGranuleStrip} from "@/components/features/status/status-granule-strip";
import {SeverityBadge} from "@/components/features/status/severity-badge";
import {Badge} from "@/components/ui/badge";

export function SystemComponentCard({
  component,
  granules,
  currentSeverity,
  getGranuleTitle,
  affectedIncidentCount,
  activeIncidentCount,
  uptimeLabel,
  historyLabel,
  incidentsLabel,
  activeLabel,
}: {
  component: SystemComponent;
  granules: DailyStatusGranule[];
  currentSeverity: IncidentSeverity;
  getGranuleTitle?: (granule: DailyStatusGranule) => string;
  affectedIncidentCount: number;
  activeIncidentCount: number;
  uptimeLabel: string;
  historyLabel: string;
  incidentsLabel: string;
  activeLabel: string;
}) {
  const averageUptimeRatio =
    granules.reduce((sum, granule) => sum + granule.uptimeRatio, 0) /
    Math.max(granules.length, 1);

  return (
    <div className="grid gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,1fr)_auto] lg:items-center lg:px-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-tight text-foreground">
            {component.name}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{component.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity={currentSeverity} />
          <Badge variant="muted">{component.category}</Badge>
          <Badge variant="muted">{affectedIncidentCount} {incidentsLabel}</Badge>
          <Badge variant="muted">{activeIncidentCount} {activeLabel}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {historyLabel}
        </div>
        <StatusGranuleStrip granules={granules} compact getGranuleTitle={getGranuleTitle} />
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {uptimeLabel}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {(averageUptimeRatio * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
