import type {IncidentSeverity} from "@/types";

import {SEVERITY_META, SEVERITY_ORDER} from "@/lib/constants/severity";
import {SEVERITY_ICONS} from "@/lib/icons/severity-icons";

export function SeverityLegend({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items?: Partial<Record<IncidentSeverity, {label: string; description: string}>>;
}) {
  return (
    <section className="surface-card px-6 py-6 md:px-8">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 pt-6 md:grid-cols-5">
        {SEVERITY_ORDER.map((severity) => (
          <LegendItem key={severity} severity={severity} item={items?.[severity]} />
        ))}
      </div>
    </section>
  );
}

function LegendItem({
  severity,
  item,
}: {
  severity: IncidentSeverity;
  item?: {label: string; description: string};
}) {
  const meta = SEVERITY_META[severity];
  const Icon = SEVERITY_ICONS[severity];

  return (
    <div className="surface-muted flex h-full flex-col gap-3 pl-4">
      <div className="flex items-center gap-3 text-foreground">
        <span>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium">{item?.label ?? meta.label}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {item?.description ?? meta.description}
      </p>
    </div>
  );
}
