import type {ComponentProps} from "react";

import {Clock3, EyeOff, LockKeyhole, UserRoundCheck} from "lucide-react";

import type {Incident} from "@/types";

import {Link} from "@/i18n/navigation";
import {INCIDENT_STATUS_META} from "@/lib/constants/incident-status";
import {SEVERITY_META} from "@/lib/constants/severity";

import {SeverityBadge} from "@/components/features/status/severity-badge";
import {Badge} from "@/components/ui/badge";

const visibilityIconMap = {
  public: UserRoundCheck,
  authenticated: LockKeyhole,
  private: EyeOff,
} as const;

type IncidentLinkHref = ComponentProps<typeof Link>["href"];

export function IncidentListItem({
  incident,
  componentNames,
  timeLabel,
  severityLabel,
  severityDescription,
  statusLabel,
  visibilityLabel,
  href,
  hrefLabel,
}: {
  incident: Incident;
  componentNames: string[];
  timeLabel: string;
  severityLabel?: string;
  severityDescription?: string;
  statusLabel?: string;
  visibilityLabel?: string;
  href?: IncidentLinkHref;
  hrefLabel?: string;
}) {
  const VisibilityIcon = visibilityIconMap[incident.visibility];

  return (
    <article className="surface-card px-5 py-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{incident.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{incident.summary}</p>
          </div>
          <SeverityBadge severity={incident.severity} label={severityLabel} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="muted">{statusLabel ?? INCIDENT_STATUS_META[incident.status].label}</Badge>
          <Badge variant="muted">
            <VisibilityIcon className="size-3.5" />
            {visibilityLabel ?? incident.visibility}
          </Badge>
          <Badge variant="muted">
            <Clock3 className="size-3.5" />
            {timeLabel}
          </Badge>
        </div>
      </div>
      <div className="space-y-4 pt-4">
        <p className="text-sm leading-6 text-muted-foreground">{incident.body}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          {componentNames.map((name) => (
            <span
              key={name}
              className="border-l border-border/60 pl-2.5 text-xs text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="pt-2 text-xs text-muted-foreground">
          {severityDescription ?? SEVERITY_META[incident.severity].description}
        </div>
        {href && hrefLabel ? (
          <div className="pt-4">
            <Link
              href={href}
              className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              {hrefLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}
