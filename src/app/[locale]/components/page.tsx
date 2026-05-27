import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {SystemComponentCard} from "@/components/features/status/system-component-card";
import {LocaleSwitcher} from "@/components/i18n/locale-switcher";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {
  getActiveIncidentsByComponent,
  getComponentIncidentCount,
} from "@/lib/domain/dashboard";
import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import {shikanekoMockData} from "@/lib/mock";
import type {DailyStatusGranule, IncidentSeverity} from "@/types";

const COMPONENT_GRANULE_DAYS = 30;

type PageParams = Promise<{
  locale: string;
}>;

async function getLocaleFromParams(params: PageParams): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export default async function ComponentsIndexPage({
  params,
}: {
  params: PageParams;
}) {
  const locale = await getLocaleFromParams(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Home"});
  const tCommon = await getTranslations({locale, namespace: "IncidentCommon"});
  const {systemComponents, incidents, granules} = shikanekoMockData;
  const incidentsById = Object.fromEntries(incidents.map((incident) => [incident.id, incident]));
  const componentsById = Object.fromEntries(
    systemComponents.map((component) => [component.id, component]),
  );
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

      return [component.id, (latestGranule?.highestSeverity ?? "normal") as IncidentSeverity];
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
      <main className="page-container flex flex-col gap-10 py-14 md:py-20">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            {tCommon("actions.backHome")}
          </Link>
          <LocaleSwitcher />
        </div>

        <section className="space-y-8">
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
      </main>
    </div>
  );
}
