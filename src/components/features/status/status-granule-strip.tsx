import type {DailyStatusGranule} from "@/types";

import {cn} from "@/lib/utils";

const granuleToneMap = {
  normal: "bg-emerald-500/25 ring-emerald-500/15 hover:bg-emerald-500/40",
  maintenance: "bg-sky-500/25 ring-sky-500/15 hover:bg-sky-500/40",
  notice: "bg-amber-500/25 ring-amber-500/15 hover:bg-amber-500/40",
  warning: "bg-orange-500/25 ring-orange-500/15 hover:bg-orange-500/40",
  critical: "bg-rose-500/25 ring-rose-500/15 hover:bg-rose-500/40",
} as const;

export function StatusGranuleStrip({
  granules,
  className,
  compact = false,
  getGranuleTitle,
}: {
  granules: DailyStatusGranule[];
  className?: string;
  compact?: boolean;
  getGranuleTitle?: (granule: DailyStatusGranule) => string;
}) {
  return (
    <div
      className={cn(
        compact ? "flex flex-nowrap gap-1 overflow-hidden" : "flex flex-wrap gap-1.5",
        className,
      )}
    >
      {granules.map((granule) => (
        <div
          key={granule.date}
          title={getGranuleTitle?.(granule) ?? `${granule.date} · ${Math.round(granule.uptimeRatio * 100)}% uptime`}
          className={cn(
            compact
              ? "h-4 w-1 shrink-0 rounded-[2px] ring-1 transition md:h-4 md:w-1"
              : "h-5 w-2.5 rounded-sm ring-1 transition md:h-6 md:w-3",
            granuleToneMap[granule.highestSeverity],
          )}
        />
      ))}
    </div>
  );
}