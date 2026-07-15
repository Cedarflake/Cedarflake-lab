import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";

import { PublicHeader } from "@/components/public/PublicHeader";
import type { AppLocale } from "@/i18n/config";
import { getPublicSiteProfile } from "@/lib/data/public-site-profile";
import { getPublicTimelinePage } from "@/lib/data/public-timeline";
import {
  PublicTimelineRequestError,
  type PublicTimelineEntryDto,
} from "@/lib/data/public-timeline-repository";
import {
  createPublicSiteProfileMetadata,
  resolvePublicSiteProfile,
} from "@/lib/public/site-profile-fallback";
import { PublicCursorError } from "@/lib/timeline/public-cursor";

interface HistoryPageProps {
  searchParams: Promise<{ cursor?: string | string[] }>;
}

const getRouteSiteProfile = cache(async (locale: AppLocale) =>
  resolvePublicSiteProfile(await getPublicSiteProfile(), locale),
);

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("History"),
  ]);
  return createPublicSiteProfileMetadata(
    await getRouteSiteProfile(locale),
    t("metadataTitle"),
  );
}

function displayTime(timestamp: number, timeZone: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);
}

function entryTone(entry: PublicTimelineEntryDto) {
  switch (entry.kind) {
    case "component_status":
      return entry.condition;
    case "incident":
      return entry.severity === "critical" ? "unavailable" : "degraded";
    case "maintenance":
      return "limited";
    case "redacted":
    case "withdrawn":
      return "unknown";
  }
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  await connection();
  const locale = await getLocale();
  const [parameters, siteProfile, t, common] = await Promise.all([
    searchParams,
    getRouteSiteProfile(locale),
    getTranslations("History"),
    getTranslations("Common"),
  ]);
  if (Array.isArray(parameters.cursor)) notFound();

  let timeline: Awaited<ReturnType<typeof getPublicTimelinePage>>;

  try {
    timeline = await getPublicTimelinePage({
      limit: 20,
      cursor: parameters.cursor ?? null,
    });
  } catch (error) {
    if (
      error instanceof PublicCursorError ||
      error instanceof PublicTimelineRequestError
    ) {
      notFound();
    }

    throw error;
  }

  if (timeline.kind === "reset") {
    return (
      <main className="page-shell">
        <PublicHeader currentPage="history" siteProfile={siteProfile} />
        <section
          className="status-hero"
          data-condition="unknown"
          aria-labelledby="history-reset-heading"
        >
          <div className="hero-topline flex-wrap">
            <p className="eyebrow">{t("privacyBoundary")}</p>
            <span className="live-indicator">{t("snapshotExpired")}</span>
          </div>
          <div className="hero-status-row">
            <h1 className="hero-status" id="history-reset-heading">
              {t("historyChanged")}
            </h1>
            <div className="hero-summary">
              <p className="hero-description">
                {t("historyChangedDescription")}
              </p>
              <Link
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] px-5 text-sm font-semibold no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                href="/history"
              >
                {t("restart")}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={1.75}
                />
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <PublicHeader currentPage="history" siteProfile={siteProfile} />

      <section
        className="status-hero"
        data-condition="unknown"
        aria-labelledby="history-heading"
      >
        <div className="hero-topline flex-wrap">
          <p className="eyebrow">{t("publishedRecords")}</p>
          <span className="live-indicator">{t("privacySafeTimeline")}</span>
        </div>
        <div className="hero-status-row">
          <h1 className="hero-status" id="history-heading">
            {t("title")}
          </h1>
          <div className="hero-summary">
            <p className="hero-description">{t("description")}</p>
            <p className="hero-updated">
              {t("newestFirst", { timezone: siteProfile.timezone })}
            </p>
          </div>
        </div>
      </section>

      <section className="content-section" aria-labelledby="records-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("timeline")}</p>
            <h2 className="section-title" id="records-heading">
              {t("publishedChanges")}
            </h2>
          </div>
          <span
            className="section-count"
            aria-label={t("pageCount", { count: timeline.entries.length })}
          >
            {timeline.entries.length}
          </span>
        </div>

        {timeline.entries.length === 0 ? (
          <p className="empty-state">{t("empty")}</p>
        ) : (
          <ol className="records-list">
            {timeline.entries.map((entry) => (
              <li
                className="record-row"
                key={`${entry.publicOrdinal}:${entry.publicEntryId}`}
              >
                <div className="record-topline">
                  <div>
                    <p className="eyebrow">{t(`kind.${entry.kind}`)}</p>
                    <h3 className="record-title mt-2 break-words">
                      {entry.kind === "incident" && entry.detailAvailable ? (
                        <Link href={`/incidents/${entry.incidentPublicId}`}>
                          {entry.kind === "incident"
                            ? `${entry.title}: ${common(`phase.${entry.phase}`)}`
                            : null}
                        </Link>
                      ) : entry.kind === "component_status" ? (
                        `${entry.componentName}: ${common(`condition.${entry.condition}`)}`
                      ) : entry.kind === "maintenance" ? (
                        `${entry.title}: ${common(`phase.${entry.phase}`)}`
                      ) : (
                        t(`kind.${entry.kind}`)
                      )}
                    </h3>
                  </div>
                  <span
                    className="condition-pill shrink-0"
                    data-condition={entryTone(entry)}
                  >
                    {entry.kind === "incident"
                      ? t("incidentBadge", {
                          severity: common(`severity.${entry.severity}`),
                        })
                      : t(`kind.${entry.kind}`)}
                  </span>
                </div>
                {"summary" in entry && entry.summary ? (
                  <p className="record-copy">{entry.summary}</p>
                ) : null}
                <p className="record-meta">
                  {t.rich("effective", {
                    value: displayTime(
                      entry.effectiveAt,
                      siteProfile.timezone,
                      locale,
                    ),
                    timezone: siteProfile.timezone,
                    timestamp: (chunks) => (
                      <time
                        dateTime={new Date(entry.effectiveAt).toISOString()}
                      >
                        {chunks}
                      </time>
                    ),
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}

        {timeline.nextCursor ? (
          <div className="mt-6 flex justify-end">
            <Link
              className="section-link inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-5"
              href={`/history?cursor=${encodeURIComponent(timeline.nextCursor)}`}
            >
              {t("olderRecords")}
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 shrink-0"
                strokeWidth={1.75}
              />
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
