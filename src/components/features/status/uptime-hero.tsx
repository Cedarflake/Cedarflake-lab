import {Activity, ShieldCheck, TimerReset} from "lucide-react";

import type {SlaSnapshot} from "@/types";

import {Badge} from "@/components/ui/badge";

export function UptimeHero({
  title,
  description,
  sla,
  activeCount,
  scheduledCount,
  rangeLabel,
}: {
  title: string;
  description: string;
  sla: SlaSnapshot;
  activeCount: number;
  scheduledCount: number;
  rangeLabel: string;
}) {
  return (
    <section className="surface-card px-6 py-8 md:px-10 md:py-10">
      <div className="gap-4 lg:flex lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <Badge variant="muted">{rangeLabel}</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              {description}
            </p>
          </div>
        </div>
        <div className="surface-muted min-w-full space-y-4 pl-5 lg:min-w-80">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Uptime
            </div>
            <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
              {sla.uptimePercentage}%
            </div>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-1">
            <Metric icon={ShieldCheck} label="Healthy days" value={`${sla.healthyGranuleCount}`} />
            <Metric icon={Activity} label="Live incidents" value={`${activeCount}`} />
            <Metric icon={TimerReset} label="Scheduled" value={`${scheduledCount}`} />
          </div>
        </div>
      </div>
      <div className="mt-8 grid gap-4 border-t border-border/70 pt-6 md:grid-cols-3">
        <StatCard label="Affected minutes" value={`${sla.affectedMinutes}`} />
        <StatCard label="Maintenance minutes" value={`${sla.maintenanceMinutes}`} />
        <StatCard label="Tracked incidents" value={`${sla.impactedIncidentIds.length}`} />
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-l border-border/60 pl-3">
      <span className="text-foreground">
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="text-base font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function StatCard({label, value}: {label: string; value: string}) {
  return (
    <div className="surface-muted pl-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
