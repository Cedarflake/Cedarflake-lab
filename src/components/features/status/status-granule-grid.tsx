import type {DailyStatusGranule, IsoDateString} from "@/types";

import {cn} from "@/lib/utils";

const granuleToneMap = {
  normal: "bg-emerald-500/25 ring-emerald-500/20 hover:bg-emerald-500/40",
  maintenance: "bg-sky-500/25 ring-sky-500/20 hover:bg-sky-500/40",
  notice: "bg-amber-500/25 ring-amber-500/20 hover:bg-amber-500/40",
  warning: "bg-orange-500/25 ring-orange-500/20 hover:bg-orange-500/40",
  critical: "bg-rose-500/25 ring-rose-500/20 hover:bg-rose-500/40",
} as const;

export function StatusGranuleGrid({
  granules,
  title,
  description,
  getGranuleTitle,
  locale = "en",
}: {
  granules: DailyStatusGranule[];
  title?: string;
  description?: string;
  getGranuleTitle?: (granule: DailyStatusGranule) => string;
  locale?: string;
}) {
  const cellSize = 12;
  const cellGap = 4;
  const minimumVisibleDaysForMonthLabel = 7;
  const parseDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const formatDate = (value: Date) => value.toISOString().slice(0, 10) as IsoDateString;
  const addDays = (value: Date, days: number) => {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };
  const getMonthStart = (value: Date) =>
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const getMonthEnd = (value: Date) =>
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  const getWeekdayIndex = (value: Date) => (value.getUTCDay() + 6) % 7;
  const startOfWeek = (value: Date) => addDays(value, -getWeekdayIndex(value));
  const endOfWeek = (value: Date) => addDays(value, 6 - getWeekdayIndex(value));
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: locale.startsWith("zh") ? "narrow" : "short",
    timeZone: "UTC",
  });

  const firstDate = granules[0] ? parseDate(granules[0].date) : null;
  const lastDate = granules.at(-1) ? parseDate(granules.at(-1)!.date) : null;
  const rangeStart = firstDate ? startOfWeek(firstDate) : null;
  const rangeEnd = lastDate ? endOfWeek(lastDate) : null;
  const totalCells = rangeStart && rangeEnd
    ? Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
    : 7;
  const weekCount = Math.max(1, Math.ceil(totalCells / 7));
  const granulesByDate = new Map<IsoDateString, DailyStatusGranule>(
    granules.map((granule) => [granule.date, granule]),
  );
  const cells = Array.from({length: totalCells}, (_, index) => {
    const date = rangeStart ? addDays(rangeStart, index) : null;
    const dateKey = date ? formatDate(date) : null;

    return {
      dateKey,
      granule: dateKey ? granulesByDate.get(dateKey) ?? null : null,
    };
  });
  const weeks = Array.from({length: weekCount}, (_, columnIndex) =>
    Array.from({length: 7}, (_, rowIndex) => cells[columnIndex * 7 + rowIndex] ?? null),
  );
  const weekdayLabels = Array.from({length: 7}, (_, index) => {
    const date = rangeStart ? addDays(rangeStart, index) : new Date(Date.UTC(2026, 0, 5 + index));
    return weekdayFormatter.format(date);
  });
  const monthLabels = [] as Array<{label: string; left: number; width: number}>;

  if (firstDate && lastDate && rangeStart) {
    for (
      let monthCursor = getMonthStart(firstDate);
      monthCursor.getTime() <= lastDate.getTime();
      monthCursor = new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 1))
    ) {
      const visibleMonthStart = new Date(
        Math.max(monthCursor.getTime(), firstDate.getTime()),
      );
      const visibleMonthEnd = new Date(
        Math.min(getMonthEnd(monthCursor).getTime(), lastDate.getTime()),
      );
      const visibleDayCount = Math.floor(
        (visibleMonthEnd.getTime() - visibleMonthStart.getTime()) / 86400000,
      ) + 1;

      if (
        visibleMonthStart.getTime() > visibleMonthEnd.getTime() ||
        visibleDayCount < minimumVisibleDaysForMonthLabel
      ) {
        continue;
      }

      const startColumnIndex = Math.floor(
        (visibleMonthStart.getTime() - rangeStart.getTime()) / 86400000 / 7,
      );
      const endColumnIndex = Math.floor(
        (visibleMonthEnd.getTime() - rangeStart.getTime()) / 86400000 / 7,
      );
      const left = startColumnIndex * (cellSize + cellGap);
      const width = (endColumnIndex - startColumnIndex + 1) * cellSize +
        Math.max(0, endColumnIndex - startColumnIndex) * cellGap;

      monthLabels.push({
        label: monthFormatter.format(visibleMonthStart),
        left,
        width,
      });
    }
  }
  const heatmapWidth = weekCount * cellSize + Math.max(0, weekCount - 1) * cellGap;

  return (
    <div className="space-y-4">
      {title || description ? (
        <div className="space-y-2">
          {title ? (
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
          ) : null}
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden pb-1">
        <div
          className="inline-grid min-w-full grid-cols-[auto_1fr] gap-x-3 gap-y-2"
          style={{gridTemplateRows: "auto auto"}}
        >
          <div aria-hidden="true" />

          <div className="relative" style={{width: `${heatmapWidth}px`, height: `${cellSize}px`}}>
            {monthLabels.map(({label, left, width}) => (
              <div
                key={`month-${label}-${left}`}
                className="absolute top-0 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                style={{left: `${left}px`, width: `${width}px`}}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid flex-none grid-rows-7 gap-1">
            {weekdayLabels.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="flex items-center justify-end pr-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                style={{height: `${cellSize}px`}}
              >
                {label}
              </div>
            ))}
          </div>

          <div
            className="grid grid-flow-col gap-1"
            style={{
              gridAutoColumns: `${cellSize}px`,
            }}
          >
            {weeks.map((week, columnIndex) => (
              <div
                key={`week-${columnIndex}`}
                className="grid gap-1"
                style={{gridTemplateRows: `repeat(7, ${cellSize}px)`}}
              >
                {week.map((cell, rowIndex) =>
                  cell?.granule ? (
                    <div
                      key={`${cell.granule.date}-${columnIndex}-${rowIndex}`}
                      title={getGranuleTitle?.(cell.granule) ?? `${cell.granule.date} · ${Math.round(cell.granule.uptimeRatio * 100)}% uptime`}
                      className={cn(
                        "rounded-[3px] ring-1 transition",
                        granuleToneMap[cell.granule.highestSeverity],
                      )}
                      style={{width: `${cellSize}px`, height: `${cellSize}px`}}
                    />
                  ) : (
                    <div
                      key={cell?.dateKey ?? `empty-${columnIndex}-${rowIndex}`}
                      aria-hidden="true"
                      style={{width: `${cellSize}px`, height: `${cellSize}px`}}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
