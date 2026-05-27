import type {TimelineUpdate} from "@/types";

import {INCIDENT_STATUS_META} from "@/lib/constants/incident-status";

import {Badge} from "@/components/ui/badge";

export function IncidentTimeline({
  title,
  description,
  updates,
  formatDate,
  getStatusLabel,
}: {
  title: string;
  description: string;
  updates: TimelineUpdate[];
  formatDate: (value: string) => string;
  getStatusLabel?: (status: TimelineUpdate["status"]) => string;
}) {
  return (
    <section className="surface-card px-6 py-6 md:px-8">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="pt-6">
        <ol className="space-y-4">
          {updates.map((update, index) => (
            <li key={update.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="mt-1 size-3 rounded-full bg-primary" />
                {index < updates.length - 1 ? (
                  <span className="mt-2 h-full w-px bg-border" />
                ) : null}
              </div>
              <div className="surface-muted flex-1 space-y-3 pl-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{update.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(update.createdAt)}
                    </div>
                  </div>
                  <Badge variant="muted">
                    {getStatusLabel?.(update.status) ?? INCIDENT_STATUS_META[update.status].label}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{update.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
