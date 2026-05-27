import {CalendarRange, Clock3, EyeOff, LockKeyhole, UserRoundCheck} from "lucide-react";

import type {Incident} from "@/types";

import {INCIDENT_STATUS_META} from "@/lib/constants/incident-status";

import {SeverityBadge} from "@/components/features/status/severity-badge";
import {Badge} from "@/components/ui/badge";

const visibilityIconMap = {
  public: UserRoundCheck,
  authenticated: LockKeyhole,
  private: EyeOff,
} as const;

export function IncidentDetailHeader({
  incident,
  componentNames,
  severityLabel,
  statusLabel,
  visibilityLabel,
  publishedLabel,
  windowLabel,
  durationLabel,
  publishedCaption,
  durationCaption,
  windowCaption,
}: {
  incident: Incident;
  componentNames: string[];
  severityLabel?: string;
  statusLabel?: string;
  visibilityLabel?: string;
  publishedLabel: string;
  windowLabel: string;
  durationLabel: string;
  publishedCaption: string;
  durationCaption: string;
  windowCaption: string;
}) {
  const VisibilityIcon = visibilityIconMap[incident.visibility];

  return (
    <section className="surface-card px-6 py-6 md:px-8 md:py-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={incident.severity} label={severityLabel} />
              <Badge variant="muted">{statusLabel ?? INCIDENT_STATUS_META[incident.status].label}</Badge>
              <Badge variant="muted">
                <VisibilityIcon className="size-3.5" />
                {visibilityLabel ?? incident.visibility}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {incident.title}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground">
                {incident.summary}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-5 pt-6">
        <p className="text-sm leading-7 text-muted-foreground">{incident.body}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile icon={CalendarRange} label={publishedCaption} value={publishedLabel} />
          <InfoTile icon={Clock3} label={durationCaption} value={durationLabel} />
          <InfoTile icon={CalendarRange} label={windowCaption} value={windowLabel} />
        </div>
        <div className="flex flex-wrap gap-2">
          {componentNames.map((name) => (
            <span
              key={name}
              className="border-l border-border/60 pl-3 text-xs text-muted-foreground"
            >
              {name}
            </span>
          ))}
          {incident.tags.map((tag) => (
            <span
              key={tag}
              className="border-l border-border/60 pl-3 text-xs text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarRange;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-muted flex items-start gap-3 pl-4">
      <span className="text-foreground">
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-sm font-medium leading-6 text-foreground">{value}</div>
      </div>
    </div>
  );
}
