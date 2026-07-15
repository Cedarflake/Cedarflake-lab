import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";

import { PublicHeader } from "@/components/public/PublicHeader";
import type { AppLocale } from "@/i18n/config";
import { getPublicIncidentDetail } from "@/lib/data/public-incidents";
import { getPublicSiteProfile } from "@/lib/data/public-site-profile";
import {
  createPublicSiteProfileMetadata,
  resolvePublicSiteProfile,
} from "@/lib/public/site-profile-fallback";

interface IncidentPageProps {
  params: Promise<{ id: string }>;
}

const getRouteSiteProfile = cache(async (locale: AppLocale) =>
  resolvePublicSiteProfile(await getPublicSiteProfile(), locale),
);

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("Incident"),
  ]);
  return createPublicSiteProfileMetadata(
    await getRouteSiteProfile(locale),
    t("metadataTitle"),
  );
}

function displayTime(timestamp: number, timeZone: string, locale: AppLocale) {
  const formatted = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);

  return `${formatted} ${timeZone}`;
}

function severityTone(severity: string) {
  switch (severity) {
    case "critical":
      return "unavailable";
    case "major":
      return "degraded";
    default:
      return "limited";
  }
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  await connection();
  const locale = await getLocale();
  const [{ id }, siteProfile, t, common] = await Promise.all([
    params,
    getRouteSiteProfile(locale),
    getTranslations("Incident"),
    getTranslations("Common"),
  ]);
  const incident = await getPublicIncidentDetail(id);

  if (!incident) notFound();

  if (incident.kind === "redacted") {
    return (
      <main className="page-shell">
        <PublicHeader currentPage="incident" siteProfile={siteProfile} />
        <article
          className="status-hero"
          data-condition="unknown"
          aria-labelledby="redacted-incident-heading"
        >
          <div className="hero-topline flex-wrap">
            <p className="eyebrow">{t("recordEyebrow")}</p>
            <span className="live-indicator">{t("detailsUnavailable")}</span>
          </div>
          <div className="hero-status-row">
            <h1 className="hero-status" id="redacted-incident-heading">
              {t("redactedTitle")}
            </h1>
            <div className="hero-summary">
              <p className="hero-description">{t("redactedDescription")}</p>
              <p className="hero-updated">{t("redactedTimeline")}</p>
            </div>
          </div>
        </article>
      </main>
    );
  }

  const { current, updates } = incident;
  const currentAffectedComponentNames = current.affectedComponents
    .map((component) => component.name)
    .join(", ");

  return (
    <main className="page-shell">
      <PublicHeader currentPage="incident" siteProfile={siteProfile} />
      <article
        className="status-hero"
        data-condition={severityTone(current.severity)}
        aria-labelledby="incident-heading"
      >
        <div className="hero-topline flex-wrap">
          <p className="eyebrow">{t("eyebrow")}</p>
          <span className="live-indicator">
            {common(`phase.${current.phase}`)}
          </span>
        </div>
        <div className="hero-status-row">
          <h1 className="hero-status break-words" id="incident-heading">
            {current.title}
          </h1>
          <div className="hero-summary">
            {current.summary ? (
              <p className="hero-description">{current.summary}</p>
            ) : (
              <p className="hero-description">{t("noLatestSummary")}</p>
            )}
            <p className="hero-updated">
              {t.rich("latestUpdate", {
                value: displayTime(
                  current.effectiveAt,
                  siteProfile.timezone,
                  locale,
                ),
                timestamp: (chunks) => (
                  <time dateTime={new Date(current.effectiveAt).toISOString()}>
                    {chunks}
                  </time>
                ),
              })}
            </p>
          </div>
        </div>
        <dl className="mt-10 grid gap-5 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">{t("severity")}</dt>
            <dd className="mt-3">
              <span className="condition-pill" data-severity={current.severity}>
                {common(`severity.${current.severity}`)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{t("affectedItems")}</dt>
            <dd className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
              {currentAffectedComponentNames || t("noAffectedItems")}
            </dd>
          </div>
        </dl>
      </article>

      <section
        className="content-section"
        aria-labelledby="incident-updates-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("timeline")}</p>
            <h2 className="section-title" id="incident-updates-heading">
              {t("updates")}
            </h2>
          </div>
          <span
            className="section-count"
            aria-label={t("updateCount", { count: updates.length })}
          >
            {updates.length}
          </span>
        </div>
        {updates.length === 0 ? (
          <p className="empty-state">{t("noUpdates")}</p>
        ) : (
          <ol className="records-list">
            {updates.map((update) => (
              <li className="record-row" key={update.publicEntryId}>
                <div className="record-topline">
                  <div>
                    <p className="eyebrow">{t("updateEyebrow")}</p>
                    <h3 className="record-title mt-2 capitalize">
                      {common(`phase.${update.phase}`)}
                    </h3>
                  </div>
                  <span
                    className="condition-pill shrink-0"
                    data-severity={update.severity}
                  >
                    {common(`severity.${update.severity}`)}
                  </span>
                </div>
                {update.summary ? (
                  <p className="record-copy">{update.summary}</p>
                ) : (
                  <p className="record-copy">{t("noUpdateSummary")}</p>
                )}
                <p className="record-meta">
                  {t.rich("updateMeta", {
                    value: displayTime(
                      update.effectiveAt,
                      siteProfile.timezone,
                      locale,
                    ),
                    items:
                      update.affectedComponents.length === 0
                        ? t("noAffectedItems")
                        : update.affectedComponents
                            .map((component) => component.name)
                            .join(", "),
                    timestamp: (chunks) => (
                      <time
                        dateTime={new Date(update.effectiveAt).toISOString()}
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
      </section>
    </main>
  );
}
