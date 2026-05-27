import {CalendarClock, TimerReset} from "lucide-react";

import type {Incident} from "@/types";

import {Badge} from "@/components/ui/badge";

export function UpcomingMaintenanceCard({
  incident,
  countdownLabel,
  windowLabel,
}: {
  incident: Incident;
  countdownLabel: string;
  windowLabel: string;
}) {
  return (
    <section className="surface-card px-5 py-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{incident.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{incident.summary}</p>
          </div>
          <Badge variant="info">Scheduled</Badge>
        </div>
      </div>
      <div className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-muted flex items-center gap-3 pl-3">
            <TimerReset className="size-4 text-foreground" />
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Countdown
              </div>
              <div className="text-sm font-medium text-foreground">{countdownLabel}</div>
            </div>
          </div>
          <div className="surface-muted flex items-center gap-3 pl-3">
            <CalendarClock className="size-4 text-foreground" />
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Window
              </div>
              <div className="text-sm font-medium text-foreground">{windowLabel}</div>
            </div>
          </div>
        </div>
        <p className="pt-2 text-sm leading-6 text-muted-foreground">{incident.body}</p>
      </div>
    </section>
  );
}
