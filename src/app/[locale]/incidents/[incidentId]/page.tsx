import {ArrowLeft} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {IncidentDetailHeader} from "@/components/features/incidents/incident-detail-header";
import {IncidentTimeline} from "@/components/features/incidents/incident-timeline";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {getComponentsById} from "@/lib/domain/dashboard";
import {getIncidentBySlug, sortTimelineUpdates} from "@/lib/domain/incidents-feed";
import {
  formatDateRange,
  formatDateTime,
  formatDurationMinutes,
} from "@/lib/formatters";
import {shikanekoMockData} from "@/lib/mock";
import type {
  IncidentLifecycleStatus,
  IncidentSeverity,
  Visibility,
} from "@/types";

type PageParams = Promise<{
  locale: string;
  incidentId: string;
}>;

async function getValidatedParams(
  params: PageParams,
): Promise<{locale: AppLocale; incidentId: string}> {
  const {locale, incidentId} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return {locale, incidentId};
}

export function generateStaticParams() {
  return shikanekoMockData.incidents.map((incident) => ({incidentId: incident.slug}));
}

export default async function IncidentDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const {locale, incidentId} = await getValidatedParams(params);

  setRequestLocale(locale);

  const [t, tCommon] = await Promise.all([
    getTranslations({locale, namespace: "IncidentDetail"}),
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
  const kindCopy: Record<"log" | "issue" | "maintenance", string> = {
    log: tCommon("kind.log"),
    issue: tCommon("kind.issue"),
    maintenance: tCommon("kind.maintenance"),
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
  const incident = getIncidentBySlug(incidents, incidentId);

  if (!incident) {
    notFound();
  }

  const componentsById = getComponentsById(systemComponents);
  const componentNames = incident.componentIds.map(
    (componentId) => componentsById[componentId]?.name ?? componentId,
  );
  const primaryComponent = systemComponents.find(
    (component) => component.id === incident.componentIds[0],
  );
  const timeline = sortTimelineUpdates(incident.timeline);

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-8 py-14 md:py-20">
        <Link
          href={
            primaryComponent
              ? {
                  pathname: "/components/[componentSlug]",
                  params: {componentSlug: primaryComponent.slug},
                }
              : "/components"
          }
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          {primaryComponent
            ? tCommon("actions.backToComponent")
            : tCommon("actions.backToComponents")}
        </Link>

        <section className="space-y-5">
          <SectionHeading
            kicker={t("hero.kicker")}
            title={incident.title}
            description={t("hero.description")}
          />
          <IncidentDetailHeader
            incident={incident}
            componentNames={componentNames}
            severityLabel={severityCopy[incident.severity].label}
            statusLabel={statusCopy[incident.status].label}
            visibilityLabel={visibilityCopy[incident.visibility].label}
            publishedLabel={formatDateTime(incident.publishedAt, locale)}
            durationLabel={formatDurationMinutes(
              incident.window.expectedDurationMinutes,
              locale,
            )}
            windowLabel={formatDateRange(
              incident.window.startedAt,
              incident.window.expectedEndAt,
              locale,
            )}
            publishedCaption={tCommon("labels.published")}
            durationCaption={tCommon("labels.duration")}
            windowCaption={tCommon("labels.window")}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <IncidentTimeline
            title={t("timeline.title")}
            description={t("timeline.description")}
            updates={timeline}
            formatDate={(value) => formatDateTime(value, locale)}
            getStatusLabel={(status) => statusCopy[status].label}
          />

          <section className="surface-card px-6 py-6 md:px-8">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {t("side.title")}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">{t("side.description")}</p>
            </div>
            <div className="space-y-4 pt-6 text-sm text-muted-foreground">
              <div className="surface-muted pl-4">
                <div className="text-xs uppercase tracking-[0.16em]">
                  {t("side.kindLabel")}
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {kindCopy[incident.kind]}
                </div>
              </div>
              <div className="surface-muted pl-4">
                <div className="text-xs uppercase tracking-[0.16em]">
                  {t("side.updatedLabel")}
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatDateTime(incident.updatedAt, locale)}
                </div>
              </div>
              <div className="surface-muted pl-4">
                <div className="text-xs uppercase tracking-[0.16em]">
                  {t("side.severityLabel")}
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {severityCopy[incident.severity].description}
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
