import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {RecentIncidentFeed} from "@/components/features/status/recent-incident-feed";
import {StatusGranuleGrid} from "@/components/features/status/status-granule-grid";
import {SystemComponentCard} from "@/components/features/status/system-component-card";
import {LocaleSwitcher} from "@/components/i18n/locale-switcher";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {calculateSlaSnapshot} from "@/lib/domain/uptime";
import {
  buildDailyStatusGranules,
} from "@/lib/domain/status-granules";
import {
  getActiveIncidents,
  getActiveIncidentsByComponent,
  getComponentsById,
  getComponentIncidentCount,
  getRecentIncidents,
  getUpcomingMaintenances,
} from "@/lib/domain/dashboard";
import {shikanekoDemoRange, shikanekoMockData} from "@/lib/mock";
import type {DailyStatusGranule, IncidentLifecycleStatus, IncidentSeverity} from "@/types";

const COMPONENT_GRANULE_DAYS = 30;
const YEAR_GRANULE_DAYS = 365;

type PageParams = Promise<{
  locale: string;
}>;

type NavigationItem = {
  href: string;
  label: string;
};

async function getLocaleFromParams(params: PageParams): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export default async function LocalizedHomePage({
  params,
}: {
  params: PageParams;
}) {
  const locale = await getLocaleFromParams(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Home"});
  const tCommon = await getTranslations({locale, namespace: "IncidentCommon"});
  const navigation = t.raw("navigation") as NavigationItem[];
  const {systemComponents, incidents} = shikanekoMockData;
  const yearEndedAt = shikanekoDemoRange.endedAt;
  const yearEndDate = new Date(yearEndedAt);
  const yearStartDate = new Date(yearEndDate);
  yearStartDate.setUTCDate(yearStartDate.getUTCDate() - (YEAR_GRANULE_DAYS - 1));
  const yearGranuleStartDate = yearStartDate.toISOString().slice(0, 10) as `${number}-${number}-${number}`;
  const yearStartedAt = `${yearGranuleStartDate}T00:00:00.000Z`;
  const granules = buildDailyStatusGranules({
    incidents,
    startDate: yearGranuleStartDate,
    days: YEAR_GRANULE_DAYS,
  });
  const slaSnapshot = calculateSlaSnapshot({
    incidents,
    startedAt: yearStartedAt,
    endedAt: yearEndedAt,
    label: locale.startsWith("zh") ? "最近一年" : "Last year",
  });
  const activeIncidents = getActiveIncidents(incidents);
  const upcomingMaintenances = getUpcomingMaintenances(incidents);
  const recentIncidents = getRecentIncidents(incidents, 10);
  const componentsById = getComponentsById(systemComponents);
  const incidentsById = Object.fromEntries(incidents.map((incident) => [incident.id, incident]));
  const orderedComponents = [...systemComponents].sort((left, right) => left.order - right.order);
  const componentGranuleDays = Math.min(COMPONENT_GRANULE_DAYS, granules.length);
  const componentGranuleStartDate =
    granules.at(-componentGranuleDays)?.date ?? shikanekoMockData.granules[0]?.date ?? "2026-04-14";
  const severityLabels: Record<IncidentSeverity, string> = {
    normal: tCommon("severity.normal.label"),
    maintenance: tCommon("severity.maintenance.label"),
    notice: tCommon("severity.notice.label"),
    warning: tCommon("severity.warning.label"),
    critical: tCommon("severity.critical.label"),
  };
  const statusLabels: Record<IncidentLifecycleStatus, string> = {
    scheduled: tCommon("status.scheduled.label"),
    investigating: tCommon("status.investigating.label"),
    identified: tCommon("status.identified.label"),
    monitoring: tCommon("status.monitoring.label"),
    resolved: tCommon("status.resolved.label"),
  };
  const componentGranulesById = Object.fromEntries(
    orderedComponents.map((component) => [
      component.id,
      buildDailyStatusGranules({
        incidents,
        startDate: componentGranuleStartDate,
        days: componentGranuleDays,
        componentId: component.id,
      }),
    ]),
  );
  const componentSeverityById = Object.fromEntries(
    orderedComponents.map((component) => {
      const latestGranule = componentGranulesById[component.id]?.at(-1);

      return [
        component.id,
        (latestGranule?.highestSeverity ?? "normal") as IncidentSeverity,
      ];
    }),
  );
  const formatGranuleTitle = (granule: DailyStatusGranule) => {
    const relatedIncidents = granule.incidentIds
      .map((incidentId) => incidentsById[incidentId])
      .filter((incident) => incident !== undefined);
    const componentNames = Array.from(
      new Set(
        relatedIncidents.flatMap((incident) =>
          incident.componentIds.map((componentId) => componentsById[componentId]?.name ?? componentId),
        ),
      ),
    );

    if (locale.startsWith("zh")) {
      return [
        granule.date,
        `状态：${severityLabels[granule.highestSeverity]}`,
        `可用性：${Math.round(granule.uptimeRatio * 100)}%`,
        componentNames.length > 0 ? `模块：${componentNames.join("、")}` : "模块：当天没有模块受影响",
        relatedIncidents.length > 0
          ? `事件：${relatedIncidents.map((incident) => incident.title).join("；")}`
          : "事件：当天没有关联事件",
      ].join("\n");
    }

    return [
      granule.date,
      `Severity: ${severityLabels[granule.highestSeverity]}`,
      `Uptime: ${Math.round(granule.uptimeRatio * 100)}%`,
      componentNames.length > 0
        ? `Components: ${componentNames.join(", ")}`
        : "Components: no affected components",
      relatedIncidents.length > 0
        ? `Incidents: ${relatedIncidents.map((incident) => incident.title).join("; ")}`
        : "Incidents: none",
    ].join("\n");
  };

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-14 py-14 md:gap-18 md:py-20">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>

        <section className="space-y-8">
          <nav className="flex flex-wrap gap-3">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </section>

        <section id="uptime" className="space-y-8 pt-6 md:pt-8">
          <SectionHeading
            kicker={t("granules.kicker")}
            title={t("granules.title")}
            description={t("granules.description")}
          />
          <StatusGranuleGrid
            granules={granules}
            getGranuleTitle={formatGranuleTitle}
            locale={locale}
          />
          <div className="space-y-5 border-t border-border/60 pt-6">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Uptime
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.uptimePercentage}%
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Healthy days
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.healthyGranuleCount}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Live incidents
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {activeIncidents.length}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Scheduled
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {upcomingMaintenances.length}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Affected minutes
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.affectedMinutes}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Maintenance minutes
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.maintenanceMinutes}
                </div>
              </div>
            </div>

            <div className="border-y border-border/70 px-5 py-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Tracked incidents
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {slaSnapshot.impactedIncidentIds.length}
              </div>
            </div>
          </div>
        </section>

        <section id="components" className="space-y-8 pt-6 md:pt-8">
          <SectionHeading
            kicker={t("components.kicker")}
            title={t("components.title")}
            description={t("components.description")}
          />
          <div className="space-y-6">
            {orderedComponents.map((component) => (
              <Link
                key={component.id}
                href={{
                  pathname: "/components/[componentSlug]",
                  params: {componentSlug: component.slug},
                }}
                className="block transition hover:opacity-95"
              >
                <SystemComponentCard
                  component={component}
                  granules={componentGranulesById[component.id] ?? []}
                  currentSeverity={componentSeverityById[component.id] ?? "normal"}
                  getGranuleTitle={formatGranuleTitle}
                  affectedIncidentCount={getComponentIncidentCount(component, incidents)}
                  activeIncidentCount={getActiveIncidentsByComponent(component.id, incidents).length}
                  historyLabel={t("components.historyLabel", {days: componentGranuleDays})}
                  uptimeLabel={t("components.uptimeLabel")}
                  incidentsLabel={t("components.incidentsLabel")}
                  activeLabel={t("components.activeLabel")}
                />
              </Link>
            ))}
          </div>
        </section>

        <section id="recent-events" className="space-y-8 pt-6 md:pt-8">
          <SectionHeading
            kicker={t("recentFeed.kicker")}
            title={t("recentFeed.title")}
            description={t("recentFeed.description")}
          />
          <RecentIncidentFeed
            incidents={recentIncidents}
            componentsById={componentsById}
            locale={locale}
            emptyLabel={t("recentFeed.empty")}
            detailLabel={tCommon("actions.viewIncident")}
            statusLabels={statusLabels}
          />
        </section>
      </main>
    </div>
  );
}
