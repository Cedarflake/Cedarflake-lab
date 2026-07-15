import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";

import { PublicHeader } from "@/components/public/PublicHeader";
import type { AppLocale } from "@/i18n/config";
import { getPublicActiveIncidents } from "@/lib/data/public-incidents";
import { getPublicMaintenanceWindows } from "@/lib/data/public-maintenance";
import { getPublicSiteProfile } from "@/lib/data/public-site-profile";
import { getPublicStatusPage } from "@/lib/data/public-status";
import type { PublicComponentStatusDto } from "@/lib/data/public-status-repository";
import { getPublicTimelinePage } from "@/lib/data/public-timeline";
import type { PublicTimelineEntryDto } from "@/lib/data/public-timeline-repository";
import {
  createPublicSiteProfileMetadata,
  resolvePublicSiteProfile,
} from "@/lib/public/site-profile-fallback";

const getRouteSiteProfile = cache(async (locale: AppLocale) =>
  resolvePublicSiteProfile(await getPublicSiteProfile(), locale),
);

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("PublicStatus"),
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

async function ComponentFreshness({
  locale,
  status,
  timeZone,
}: {
  locale: AppLocale;
  status: PublicComponentStatusDto["status"];
  timeZone: string;
}) {
  const t = await getTranslations("PublicStatus");
  const validUntil = status.validUntil;

  if (status.condition !== "unknown") {
    return (
      <p className="record-meta">
        {t.rich("effective", {
          value: displayTime(status.effectiveAt, timeZone, locale),
          timestamp: (chunks) => (
            <time dateTime={new Date(status.effectiveAt).toISOString()}>
              {chunks}
            </time>
          ),
        })}
        {validUntil === null ? (
          ` · ${t("noExpiry")}`
        ) : (
          <>
            {" · "}
            {t.rich("expires", {
              value: displayTime(validUntil, timeZone, locale),
              timestamp: (chunks) => (
                <time dateTime={new Date(validUntil).toISOString()}>
                  {chunks}
                </time>
              ),
            })}
          </>
        )}
      </p>
    );
  }

  switch (status.unknownReason) {
    case "expired":
      return validUntil === null ? (
        <p className="record-meta">{t("reportExpired")}</p>
      ) : (
        <p className="record-meta">
          {t.rich("reportingExpired", {
            value: displayTime(validUntil, timeZone, locale),
            timestamp: (chunks) => (
              <time dateTime={new Date(validUntil).toISOString()}>
                {chunks}
              </time>
            ),
          })}
        </p>
      );
    case "withdrawn":
      return <p className="record-meta">{t("reportWithdrawn")}</p>;
    case "redacted":
      return <p className="record-meta">{t("reportRedacted")}</p>;
    case "not_reported":
    case "suppressed":
      return <p className="record-meta">{t("reportUnavailable")}</p>;
  }
}

export default async function Home() {
  await connection();
  const locale = await getLocale();
  const [t, common] = await Promise.all([
    getTranslations("PublicStatus"),
    getTranslations("Common"),
  ]);
  const [siteProfile, page, incidents, maintenance, timeline] =
    await Promise.all([
      getRouteSiteProfile(locale),
      getPublicStatusPage(),
      getPublicActiveIncidents(),
      getPublicMaintenanceWindows(),
      getPublicTimelinePage({ limit: 5 }),
    ]);
  const timelineEntries = timeline.kind === "page" ? timeline.entries : [];
  const lastPublicChangeAt = page.lastPublicChangeAt;
  const statusHeading = (
    condition: PublicComponentStatusDto["status"]["condition"],
  ) =>
    condition === "unknown"
      ? t("notReported")
      : common(`condition.${condition}`);
  const timelineLabel = (entry: PublicTimelineEntryDto) => {
    switch (entry.kind) {
      case "component_status":
        return t("timeline.component", {
          name: entry.componentName,
          condition: common(`condition.${entry.condition}`),
        });
      case "incident":
        return t("timeline.incident", {
          title: entry.title,
          phase: common(`phase.${entry.phase}`),
        });
      case "maintenance":
        return t("timeline.maintenance", {
          title: entry.title,
          phase: common(`phase.${entry.phase}`),
        });
      case "redacted":
        return t("timeline.redacted");
      case "withdrawn":
        return t("timeline.withdrawn");
    }
  };

  return (
    <main className="page-shell">
      <PublicHeader currentPage="status" siteProfile={siteProfile} />

      <section
        className="status-hero"
        data-condition={page.overall.condition}
        aria-labelledby="current-status-heading"
      >
        <div className="hero-topline">
          <p className="eyebrow">{t("currentEyebrow")}</p>
          <span
            className="live-indicator"
            data-maintenance={
              page.overall.hasActiveMaintenance ? "true" : "false"
            }
          >
            {page.overall.hasActiveMaintenance
              ? t("maintenanceInProgress")
              : t("publicSnapshot")}
          </span>
        </div>
        <div className="hero-status-row">
          <h1 className="hero-status capitalize" id="current-status-heading">
            {statusHeading(page.overall.condition)}
          </h1>
          <div className="hero-summary">
            <p className="hero-description">
              {t(`description.${page.overall.condition}`)}{" "}
              {t(`coverage.${page.overall.coverage}`)}
            </p>
            <p className="hero-updated">
              {lastPublicChangeAt === null
                ? t("noPublicChange")
                : t.rich("lastPublicChange", {
                    value: displayTime(
                      lastPublicChangeAt,
                      siteProfile.timezone,
                      locale,
                    ),
                    timestamp: (chunks) => (
                      <time
                        dateTime={new Date(lastPublicChangeAt).toISOString()}
                      >
                        {chunks}
                      </time>
                    ),
                  })}
            </p>
          </div>
        </div>
      </section>

      <section className="content-section" aria-labelledby="incidents-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("incidentsEyebrow")}</p>
            <h2 className="section-title" id="incidents-heading">
              {t("activeIncidents")}
            </h2>
          </div>
          <span
            className="section-count"
            aria-label={t("activeIncidentCount", { count: incidents.length })}
          >
            {incidents.length}
          </span>
        </div>
        {incidents.length === 0 ? (
          <p className="empty-state">{t("noActiveIncidents")}</p>
        ) : (
          <ul className="records-list">
            {incidents.map((incident) => (
              <li className="record-row" key={incident.incidentPublicId}>
                <div className="record-topline">
                  <h3 className="record-title">
                    <Link href={"/incidents/" + incident.incidentPublicId}>
                      {incident.title}
                    </Link>
                  </h3>
                  <span
                    className="condition-pill"
                    data-severity={incident.severity}
                  >
                    {common(`severity.${incident.severity}`)} ·{" "}
                    {common(`phase.${incident.phase}`)}
                  </span>
                </div>
                {incident.summary ? (
                  <p className="record-copy">{incident.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="content-section" aria-labelledby="components-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("componentsEyebrow")}</p>
            <h2 className="section-title" id="components-heading">
              {t("statusComponents")}
            </h2>
          </div>
          <span
            className="section-count"
            aria-label={t("componentCount", { count: page.components.length })}
          >
            {page.components.length}
          </span>
        </div>
        {page.components.length === 0 ? (
          <p className="empty-state">{t("noComponents")}</p>
        ) : (
          <ul className="records-list">
            {page.components.map((component) => (
              <li className="record-row" key={component.componentPublicId}>
                <div className="record-topline">
                  <h3 className="record-title">{component.name}</h3>
                  <span
                    className="condition-pill"
                    data-condition={component.status.condition}
                  >
                    {statusHeading(component.status.condition)}
                  </span>
                </div>
                {component.summary ? (
                  <p className="record-copy">{component.summary}</p>
                ) : null}
                {component.statusSummary ? (
                  <p className="record-copy">{component.statusSummary}</p>
                ) : null}
                <ComponentFreshness
                  locale={locale}
                  status={component.status}
                  timeZone={siteProfile.timezone}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="content-section"
        aria-labelledby="maintenance-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("maintenanceEyebrow")}</p>
            <h2 className="section-title" id="maintenance-heading">
              {t("maintenance")}
            </h2>
          </div>
          <span
            className="section-count"
            aria-label={t("maintenanceCount", { count: maintenance.length })}
          >
            {maintenance.length}
          </span>
        </div>
        {maintenance.length === 0 ? (
          <p className="empty-state">{t("noMaintenance")}</p>
        ) : (
          <ul className="records-list">
            {maintenance.map((window) => (
              <li className="record-row" key={window.maintenancePublicId}>
                <div className="record-topline">
                  <h3 className="record-title">{window.title}</h3>
                  <span className="condition-pill" data-condition="limited">
                    {common(`phase.${window.phase}`)}
                  </span>
                </div>
                {window.summary ? (
                  <p className="record-copy">{window.summary}</p>
                ) : null}
                <p className="record-meta">
                  <time dateTime={new Date(window.startsAt).toISOString()}>
                    {displayTime(window.startsAt, siteProfile.timezone, locale)}
                  </time>{" "}
                  –{" "}
                  <time dateTime={new Date(window.endsAt).toISOString()}>
                    {displayTime(window.endsAt, siteProfile.timezone, locale)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="content-section" aria-labelledby="history-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("publicRecordEyebrow")}</p>
            <h2 className="section-title" id="history-heading">
              {t("recentHistory")}
            </h2>
          </div>
          <Link
            className="section-link inline-flex items-center gap-1.5"
            href="/history"
          >
            {t("viewAll")}
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 shrink-0"
              strokeWidth={1.75}
            />
          </Link>
        </div>
        {timelineEntries.length === 0 ? (
          <p className="empty-state">{t("noPublicChange")}</p>
        ) : (
          <ol className="timeline-list">
            {timelineEntries.map((entry) => (
              <li
                className="timeline-row"
                key={[entry.publicOrdinal, entry.publicEntryId].join(":")}
              >
                <span aria-hidden="true" className="timeline-dot" />
                <div>
                  <p className="timeline-copy">{timelineLabel(entry)}</p>
                  <p className="record-meta">
                    <time dateTime={new Date(entry.effectiveAt).toISOString()}>
                      {displayTime(
                        entry.effectiveAt,
                        siteProfile.timezone,
                        locale,
                      )}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
