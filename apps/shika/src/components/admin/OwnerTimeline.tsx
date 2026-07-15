import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type {
  OwnerTimelineEntryDto,
  OwnerTimelinePageDto,
} from "@/lib/data/owner-timeline-repository";

interface OwnerTimelineProps {
  timeline: OwnerTimelinePageDto;
  timeZone: string;
  nextHref: string | null;
}

function displayTime(timestamp: number, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);
}

function entryTone(entry: OwnerTimelineEntryDto) {
  switch (entry.kind) {
    case "component_status":
      return entry.condition;
    case "incident":
      return entry.severity === "critical"
        ? "unavailable"
        : entry.severity === "major"
          ? "degraded"
          : "limited";
    case "maintenance":
      return "limited";
  }
}

function affectedComponents(entry: OwnerTimelineEntryDto) {
  if (entry.kind === "component_status") return [];
  return entry.affectedComponents;
}

export function OwnerTimeline({
  timeline,
  timeZone,
  nextHref,
}: OwnerTimelineProps) {
  const locale = useLocale();
  const t = useTranslations("OwnerTimeline");
  const common = useTranslations("Common");
  const entryKindLabel = (entry: OwnerTimelineEntryDto) => {
    switch (entry.kind) {
      case "component_status":
        return t("statusReport");
      case "incident":
        return t("incidentKind", {
          kind: common(`event.${entry.updateKind}`),
        });
      case "maintenance":
        return t("maintenanceKind", {
          kind: common(`event.${entry.eventKind}`),
        });
    }
  };
  const entryTitle = (entry: OwnerTimelineEntryDto) => {
    switch (entry.kind) {
      case "component_status":
        return t("componentTitle", {
          name: entry.ownerNameSnapshot,
          condition: common(`condition.${entry.condition}`),
        });
      case "incident":
        return t("incidentTitle", {
          title: entry.title,
          phase: common(`phase.${entry.phase}`),
        });
      case "maintenance":
        return t("maintenanceTitle", {
          title: entry.title,
          phase: common(`phase.${entry.phase}`),
        });
    }
  };
  const exposureLabel = (entry: OwnerTimelineEntryDto) =>
    entry.publicState.exposure === "private"
      ? t("ownerOnly")
      : common(`disposition.${entry.publicState.disposition}`);

  return (
    <section aria-label={t("label")}>
      <div className="mb-5 flex justify-end">
        <span
          aria-label={t("pageCount", { count: timeline.entries.length })}
          className="section-count"
        >
          {timeline.entries.length}
        </span>
      </div>

      {timeline.entries.length === 0 ? (
        <p className="empty-state">{t("empty")}</p>
      ) : (
        <ol className="records-list">
          {timeline.entries.map((entry) => {
            const entryComponents = affectedComponents(entry);

            return (
              <li className="record-row" key={entry.entryId}>
                <div className="record-topline">
                  <div className="min-w-0">
                    <p className="eyebrow">{entryKindLabel(entry)}</p>
                    <h3 className="record-title mt-2 break-words">
                      {entryTitle(entry)}
                    </h3>
                  </div>
                  <span
                    className="condition-pill shrink-0"
                    data-condition={entryTone(entry)}
                  >
                    {exposureLabel(entry)}
                  </span>
                </div>

                {entry.ownerSummary ? (
                  <p className="record-copy">{entry.ownerSummary}</p>
                ) : null}
                {entry.privateNote ? (
                  <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
                    <span className="font-semibold text-[var(--foreground)]">
                      {t("privateNote")}
                    </span>{" "}
                    {entry.privateNote}
                  </p>
                ) : null}

                {entryComponents.length > 0 ? (
                  <div
                    aria-label={t("affectedItems")}
                    className="mt-4 flex flex-wrap gap-2"
                  >
                    {entryComponents.map((component) => (
                      <span
                        className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted)]"
                        key={`${component.position}:${component.componentId}`}
                      >
                        {component.ownerName}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="record-meta">
                    {t.rich("meta", {
                      effectiveValue: displayTime(
                        entry.effectiveAt,
                        timeZone,
                        locale,
                      ),
                      recordedValue: displayTime(
                        entry.recordedAt,
                        timeZone,
                        locale,
                      ),
                      ordinal: entry.ownerOrdinal,
                      effective: (chunks) => (
                        <time
                          dateTime={new Date(entry.effectiveAt).toISOString()}
                        >
                          {chunks}
                        </time>
                      ),
                      recorded: (chunks) => (
                        <time
                          dateTime={new Date(entry.recordedAt).toISOString()}
                        >
                          {chunks}
                        </time>
                      ),
                    })}
                  </p>
                  {entry.publicDetailHref ? (
                    <Link
                      className="section-link inline-flex items-center gap-1.5"
                      href={entry.publicDetailHref}
                    >
                      {t("publicDetail")}
                      <ExternalLink
                        aria-hidden="true"
                        className="size-3.5"
                        strokeWidth={1.75}
                      />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {timeline.nextCursor && nextHref ? (
        <Link
          className="section-link mt-4 inline-flex items-center gap-1.5"
          href={nextHref}
        >
          {t("olderRecords")}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5"
            strokeWidth={1.75}
          />
        </Link>
      ) : null}
    </section>
  );
}
