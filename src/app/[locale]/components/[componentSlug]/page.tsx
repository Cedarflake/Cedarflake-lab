import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {IncidentListItem} from "@/components/features/status/incident-list-item";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {
  getActiveIncidentsByComponent,
  getComponentBySlug,
  getComponentsById,
  getIncidentsByComponent,
  getResolvedIncidentsByComponent,
  getUpcomingMaintenancesByComponent,
} from "@/lib/domain/dashboard";
import {formatDateRange, formatDateTime, formatDurationMinutes} from "@/lib/formatters";
import {shikanekoMockData} from "@/lib/mock";
import type {
  IncidentLifecycleStatus,
  IncidentSeverity,
  Visibility,
} from "@/types";

type PageParams = Promise<{
  locale: string;
  componentSlug: string;
}>;

async function getValidatedParams(
  params: PageParams,
): Promise<{locale: AppLocale; componentSlug: string}> {
  const {locale, componentSlug} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return {locale, componentSlug};
}

export function generateStaticParams() {
  return shikanekoMockData.systemComponents.map((component) => ({
    componentSlug: component.slug,
  }));
}

export default async function ComponentIncidentPage({
  params,
}: {
  params: PageParams;
}) {
  const {locale, componentSlug} = await getValidatedParams(params);

  setRequestLocale(locale);

  const [t, tCommon] = await Promise.all([
    getTranslations({locale, namespace: "ComponentPage"}),
    getTranslations({locale, namespace: "IncidentCommon"}),
  ]);

  const severityCopy: Record<
    IncidentSeverity,
    {label: string; description: string}
  > = {
    normal: {
      label: tCommon("severity.normal.label"),
      description: tCommon("severity.normal.description"),
    },
    maintenance: {
      label: tCommon("severity.maintenance.label"),
      description: tCommon("severity.maintenance.description"),
    },
    notice: {
      label: tCommon("severity.notice.label"),
      description: tCommon("severity.notice.description"),
    },
    warning: {
      label: tCommon("severity.warning.label"),
      description: tCommon("severity.warning.description"),
    },
    critical: {
      label: tCommon("severity.critical.label"),
      description: tCommon("severity.critical.description"),
    },
  };
  const statusCopy: Record<IncidentLifecycleStatus, {label: string}> = {
    scheduled: {label: tCommon("status.scheduled.label")},
    investigating: {label: tCommon("status.investigating.label")},
    identified: {label: tCommon("status.identified.label")},
    monitoring: {label: tCommon("status.monitoring.label")},
    resolved: {label: tCommon("status.resolved.label")},
  };
  const visibilityCopy: Record<Visibility, {label: string}> = {
    public: {label: tCommon("visibility.public.label")},
    authenticated: {label: tCommon("visibility.authenticated.label")},
    private: {label: tCommon("visibility.private.label")},
  };

  const {incidents, systemComponents} = shikanekoMockData;
  const component = getComponentBySlug(systemComponents, componentSlug);

  if (!component) {
    notFound();
  }

  const componentsById = getComponentsById(systemComponents);
  const allComponentIncidents = getIncidentsByComponent(component.id, incidents);
  const activeIncidents = getActiveIncidentsByComponent(component.id, incidents);
  const scheduledIncidents = getUpcomingMaintenancesByComponent(component.id, incidents);
  const resolvedIncidents = getResolvedIncidentsByComponent(component.id, incidents);

  const metrics = [
    {label: t("metrics.total"), value: allComponentIncidents.length},
    {label: t("metrics.active"), value: activeIncidents.length},
    {label: t("metrics.scheduled"), value: scheduledIncidents.length},
    {label: t("metrics.resolved"), value: resolvedIncidents.length},
  ];

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-10 py-14 md:py-20">
        <section className="space-y-5">
          <Link
            href="/components"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            {tCommon("actions.backToComponents")}
          </Link>

          <SectionHeading
            kicker={t("hero.kicker")}
            title={component.name}
            description={component.description}
          />

          <div className="grid gap-4 md:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeading
            kicker={t("sections.active.kicker")}
            title={t("sections.active.title")}
            description={t("sections.active.description")}
          />
          <div className="grid gap-4">
            {activeIncidents.length > 0 ? (
              activeIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  componentNames={incident.componentIds.map(
                    (componentId) => componentsById[componentId]?.name ?? componentId,
                  )}
                  timeLabel={formatDurationMinutes(incident.window.expectedDurationMinutes, locale)}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/incidents/[incidentId]",
                    params: {incidentId: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.active")}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeading
            kicker={t("sections.scheduled.kicker")}
            title={t("sections.scheduled.title")}
            description={t("sections.scheduled.description")}
          />
          <div className="grid gap-4">
            {scheduledIncidents.length > 0 ? (
              scheduledIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  componentNames={incident.componentIds.map(
                    (componentId) => componentsById[componentId]?.name ?? componentId,
                  )}
                  timeLabel={formatDateRange(
                    incident.window.startedAt,
                    incident.window.expectedEndAt,
                    locale,
                  )}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/incidents/[incidentId]",
                    params: {incidentId: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.scheduled")}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeading
            kicker={t("sections.resolved.kicker")}
            title={t("sections.resolved.title")}
            description={t("sections.resolved.description")}
          />
          <div className="grid gap-4">
            {resolvedIncidents.length > 0 ? (
              resolvedIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  componentNames={incident.componentIds.map(
                    (componentId) => componentsById[componentId]?.name ?? componentId,
                  )}
                  timeLabel={formatDateTime(incident.updatedAt, locale, {year: "numeric"})}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/incidents/[incidentId]",
                    params: {incidentId: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.resolved")}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
