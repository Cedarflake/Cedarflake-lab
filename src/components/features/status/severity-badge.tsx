import type {IncidentSeverity} from "@/types";

import {SEVERITY_META} from "@/lib/constants/severity";
import {SEVERITY_ICONS} from "@/lib/icons/severity-icons";

import {Badge} from "@/components/ui/badge";

const variantMap = {
  normal: "success",
  maintenance: "info",
  notice: "notice",
  warning: "warning",
  critical: "critical",
} as const;

export function SeverityBadge({
  severity,
  withLabel = true,
  label,
}: {
  severity: IncidentSeverity;
  withLabel?: boolean;
  label?: string;
}) {
  const Icon = SEVERITY_ICONS[severity];
  const meta = SEVERITY_META[severity];

  return (
    <Badge variant={variantMap[severity]}>
      <Icon className="size-3.5" />
      {withLabel ? (label ?? meta.label) : null}
    </Badge>
  );
}
