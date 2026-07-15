import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  Activity,
  Archive,
  Box,
  CalendarClock,
  CalendarPlus,
  CirclePlus,
  Eye,
  History,
  LayoutDashboard,
  PencilLine,
  RotateCcw,
  Settings,
  ShieldAlert,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AdminPaneFocusManager } from "@/components/admin/AdminPaneFocusManager";
import { CloseStatusPublicationForm } from "@/components/admin/CloseStatusPublicationForm";
import { CloseComponentPublicationForm } from "@/components/admin/CloseComponentPublicationForm";
import { ComponentLifecycleForm } from "@/components/admin/ComponentLifecycleForm";
import { ComponentMetadataForm } from "@/components/admin/ComponentMetadataForm";
import { CreateComponentForm } from "@/components/admin/CreateComponentForm";
import {
  CloseIncidentPublicationForm,
  CreateIncidentForm,
  UpdateIncidentForm,
} from "@/components/admin/IncidentForms";
import { IncidentMetadataForm } from "@/components/admin/IncidentMetadataForm";
import {
  CloseMaintenancePublicationForm,
  ScheduleMaintenanceForm,
  UpdateMaintenanceForm,
} from "@/components/admin/MaintenanceForms";
import { OwnerTimeline } from "@/components/admin/OwnerTimeline";
import { PublishComponentForm } from "@/components/admin/PublishComponentForm";
import { PublishMaintenanceForm } from "@/components/admin/PublishMaintenanceForm";
import { ReportStatusForm } from "@/components/admin/ReportStatusForm";
import { CloseSiteProfilePublicationForm } from "@/components/admin/CloseSiteProfilePublicationForm";
import { EditSiteProfileForm } from "@/components/admin/EditSiteProfileForm";
import { PublishSiteProfileForm } from "@/components/admin/PublishSiteProfileForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import type { OwnerTimelineCursor } from "@/domain/owner-timeline";
import { DomainRuleError } from "@/domain/errors";
import { getOwnerAccessState } from "@/lib/auth/require-owner";
import { getOwnerDashboard } from "@/lib/data/owner-dashboard";
import { getOwnerComponentPrivacyReview } from "@/lib/data/owner-component-privacy";
import { getOwnerIncidents } from "@/lib/data/owner-incidents";
import { getOwnerMaintenanceWindows } from "@/lib/data/owner-maintenance";
import { getOwnerSiteProfile } from "@/lib/data/owner-site-profile";
import { getOwnerTimelinePage } from "@/lib/data/owner-timeline";
import { getPublicStatusPage } from "@/lib/data/public-status";
import type { AdminComponentOption } from "@/lib/forms/admin-component-option";
import { getComponentArchiveBlockers } from "@/lib/forms/component-archive-blockers";
import { getRequestTime } from "@/lib/time/request-time";

type AdminView =
  | "overview"
  | "timeline"
  | "status"
  | "incident"
  | "incident-new"
  | "maintenance"
  | "maintenance-new"
  | "component"
  | "component-new"
  | "settings";

interface AdminPageProps {
  searchParams: Promise<{
    item?: string | string[];
    notice?: string | string[];
    task?: string | string[];
    timelineAfter?: string | string[];
    timelineAsOf?: string | string[];
    view?: string | string[];
  }>;
}

interface AdminNavLinkProps {
  href: string;
  icon: LucideIcon;
  isCurrent: boolean;
  label: string;
  meta?: string;
}

interface AdminPaneTabProps {
  href: string;
  icon: LucideIcon;
  isCurrent: boolean;
  label: string;
}

interface AdminPaneProps {
  children: ReactNode;
  description: string;
  eyebrow: string;
  tabs?: ReactNode;
  title: string;
}

interface AdminPrerequisiteProps {
  copy: string;
  heading: string;
  id: string;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");

  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

const noticeMessageKeys = {
  "component-archived": "notice.componentArchived",
  "component-created": "notice.componentCreated",
  "component-metadata-saved": "notice.componentMetadataSaved",
  "component-published": "notice.componentPublished",
  "component-redacted": "notice.componentRedacted",
  "component-suppressed": "notice.componentSuppressed",
  "component-unarchived": "notice.componentUnarchived",
  "component-withdrawn": "notice.componentWithdrawn",
  "incident-created": "notice.incidentCreated",
  "incident-metadata-revised": "notice.incidentMetadataRevised",
  "incident-publication-closed": "notice.incidentPublicationClosed",
  "incident-updated": "notice.incidentUpdated",
  "maintenance-publication-closed": "notice.maintenancePublicationClosed",
  "maintenance-published": "notice.maintenancePublished",
  "maintenance-scheduled": "notice.maintenanceScheduled",
  "maintenance-updated": "notice.maintenanceUpdated",
  "status-publication-closed": "notice.statusPublicationClosed",
  "status-reported": "notice.statusReported",
  "site-profile-published": "notice.siteProfilePublished",
  "site-profile-redacted": "notice.siteProfileRedacted",
  "site-profile-saved": "notice.siteProfileSaved",
  "site-profile-suppressed": "notice.siteProfileSuppressed",
  "site-profile-withdrawn": "notice.siteProfileWithdrawn",
} as const;

const adminViews: readonly AdminView[] = [
  "overview",
  "timeline",
  "status",
  "incident",
  "incident-new",
  "maintenance",
  "maintenance-new",
  "component",
  "component-new",
  "settings",
];

function displayTime(timestamp: number, locale: "en" | "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(timestamp);
}

function readSearchValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function isAdminView(value: string): value is AdminView {
  return adminViews.some((view) => view === value);
}

function adminHref(view: AdminView, item?: string, task?: string) {
  const parameters = new URLSearchParams({ view });
  if (item) parameters.set("item", item);
  if (task) parameters.set("task", task);

  return "/admin?" + parameters.toString();
}

function readOwnerTimelineCursor(
  asOfValue: string,
  afterValue: string,
): OwnerTimelineCursor | null {
  if (asOfValue === "" && afterValue === "") return null;

  if (!/^\d+$/.test(asOfValue) || !/^\d+$/.test(afterValue)) {
    redirect(adminHref("timeline"));
  }

  const asOfOwnerOrdinal = Number(asOfValue);
  const lastOwnerOrdinal = Number(afterValue);
  if (
    !Number.isSafeInteger(asOfOwnerOrdinal) ||
    !Number.isSafeInteger(lastOwnerOrdinal) ||
    asOfOwnerOrdinal < 0 ||
    lastOwnerOrdinal <= 0 ||
    lastOwnerOrdinal > asOfOwnerOrdinal
  ) {
    redirect(adminHref("timeline"));
  }

  return {
    version: 1,
    asOfOwnerOrdinal,
    lastOwnerOrdinal,
  };
}

function ownerTimelineHref(cursor: OwnerTimelineCursor) {
  if (cursor.lastOwnerOrdinal === null) return adminHref("timeline");

  return (
    "/admin?" +
    new URLSearchParams({
      view: "timeline",
      timelineAsOf: String(cursor.asOfOwnerOrdinal),
      timelineAfter: String(cursor.lastOwnerOrdinal),
    }).toString()
  );
}

function AdminNavLink({
  href,
  icon: Icon,
  isCurrent,
  label,
  meta,
}: AdminNavLinkProps) {
  return (
    <li>
      <Link
        aria-current={isCurrent ? "page" : undefined}
        className="admin-nav-link"
        href={href}
      >
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0"
          strokeWidth={1.75}
        />
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {meta ? <span className="admin-nav-link-meta">{meta}</span> : null}
        </span>
      </Link>
    </li>
  );
}

function AdminPaneTab({
  href,
  icon: Icon,
  isCurrent,
  label,
}: AdminPaneTabProps) {
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className="admin-pane-tab"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  );
}

function AdminPane({
  children,
  description,
  eyebrow,
  tabs,
  title,
}: AdminPaneProps) {
  return (
    <section className="admin-pane">
      <header className="admin-pane-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="admin-pane-title" id="admin-pane-title">
          {title}
        </h2>
        <p className="admin-pane-description">{description}</p>
        {tabs}
      </header>
      <div className="admin-pane-content">{children}</div>
    </section>
  );
}

function AdminPrerequisite({ copy, heading, id }: AdminPrerequisiteProps) {
  const t = useTranslations("Admin");

  return (
    <section className="admin-prerequisite" aria-labelledby={id}>
      <div className="admin-prerequisite-content">
        <p className="eyebrow">{t("setupRequired")}</p>
        <h3 className="admin-prerequisite-title" id={id}>
          {heading}
        </h3>
        <p className="admin-prerequisite-copy">{copy}</p>
      </div>
      <Link
        className="action-button action-button-primary"
        href={adminHref("component-new")}
      >
        <CirclePlus
          aria-hidden="true"
          className="size-4 shrink-0"
          strokeWidth={1.75}
        />
        {t("createFirstComponent")}
      </Link>
    </section>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await connection();

  const access = await getOwnerAccessState();
  if (access.kind === "anonymous") redirect("/login?returnTo=%2Fadmin");
  if (access.kind === "denied") redirect("/auth-error");

  const [parameters, locale, t, common] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("Admin"),
    getTranslations("Common"),
  ]);
  const requestedView = readSearchValue(parameters.view);
  const requestedItem = readSearchValue(parameters.item);
  const requestedTask = readSearchValue(parameters.task);
  const initialView = isAdminView(requestedView) ? requestedView : "overview";
  const timelineCursor =
    initialView === "timeline"
      ? readOwnerTimelineCursor(
          readSearchValue(parameters.timelineAsOf),
          readSearchValue(parameters.timelineAfter),
        )
      : null;
  const now = getRequestTime();
  const [dashboard, incidents, maintenanceWindows, siteProfile] =
    await Promise.all([
      getOwnerDashboard(now),
      getOwnerIncidents(),
      getOwnerMaintenanceWindows(now),
      getOwnerSiteProfile(),
    ]);
  let ownerTimeline: Awaited<ReturnType<typeof getOwnerTimelinePage>> | null =
    null;

  if (initialView === "timeline") {
    try {
      ownerTimeline = await getOwnerTimelinePage({
        limit: 20,
        cursor: timelineCursor,
      });
    } catch (error) {
      if (
        error instanceof DomainRuleError &&
        error.code === "INVALID_OWNER_TIMELINE_CURSOR"
      ) {
        redirect(adminHref("timeline"));
      }

      throw error;
    }
  }
  let publicPreview: Awaited<ReturnType<typeof getPublicStatusPage>> | null =
    null;

  try {
    publicPreview = await getPublicStatusPage(now);
  } catch {
    publicPreview = null;
  }

  const noticeKey = readSearchValue(parameters.notice);
  const noticeMessageKey =
    noticeMessageKeys[noticeKey as keyof typeof noticeMessageKeys];
  const notice = noticeMessageKey ? t(noticeMessageKey) : "";
  const options: AdminComponentOption[] = dashboard.components
    .filter((component) => component.metadata.lifecycle === "active")
    .map((component) => ({
      componentId: component.componentId,
      name: component.metadata.ownerName,
      componentVersion: component.componentVersion,
      condition: component.status.condition,
      isPublic: component.publication.isComponentPublic,
      metadataPublicationVersion:
        component.publication.componentMetadata.version,
      statusPublicationVersion: component.publication.componentStatus.version,
    }));
  const componentById = new Map(
    dashboard.components.map((component) => [component.componentId, component]),
  );
  const uniqueComponentIds = (componentIds: readonly string[]) => [
    ...new Set(componentIds),
  ];
  const reviewComponentGuards = (componentIds: readonly string[]) =>
    uniqueComponentIds(componentIds).map((componentId) => {
      const component = componentById.get(componentId);
      if (!component) {
        throw new Error("An owner component reference could not be resolved");
      }

      return {
        componentId,
        expectedComponentVersion: component.componentVersion,
      };
    });
  const reviewComponentOptions = (componentIds: readonly string[]) =>
    uniqueComponentIds(componentIds).map((componentId) => {
      const component = componentById.get(componentId);
      if (!component) {
        throw new Error("An owner component reference could not be resolved");
      }

      return {
        componentId,
        name: component.metadata.ownerName,
        componentVersion: component.componentVersion,
        condition: component.status.condition,
        isPublic: component.publication.isComponentPublic,
        metadataPublicationVersion:
          component.publication.componentMetadata.version,
        statusPublicationVersion: component.publication.componentStatus.version,
      };
    });
  const reviewPublicComponentGuards = (componentIds: readonly string[]) =>
    uniqueComponentIds(componentIds).map((componentId) => {
      const component = componentById.get(componentId);
      if (!component) {
        throw new Error("An owner component reference could not be resolved");
      }

      return {
        componentId,
        expectedComponentVersion: component.componentVersion,
        expectedComponentMetadataPublicationVersion:
          component.publication.componentMetadata.version,
      };
    });
  const orderedIncidents = incidents.toSorted(
    (left, right) =>
      Number(left.latestPhase === "resolved") -
        Number(right.latestPhase === "resolved") ||
      right.updatedAt - left.updatedAt,
  );
  const orderedMaintenance = maintenanceWindows.toSorted(
    (left, right) =>
      Number(left.phase === "completed" || left.phase === "cancelled") -
        Number(right.phase === "completed" || right.phase === "cancelled") ||
      right.updatedAt - left.updatedAt,
  );
  const selectedIncident =
    initialView === "incident"
      ? (orderedIncidents.find(
          (incident) => incident.incidentId === requestedItem,
        ) ?? orderedIncidents[0])
      : undefined;
  const selectedMaintenance =
    initialView === "maintenance"
      ? (orderedMaintenance.find(
          (window) => window.maintenanceWindowId === requestedItem,
        ) ?? orderedMaintenance[0])
      : undefined;
  const selectedComponent =
    initialView === "component"
      ? (dashboard.components.find(
          (component) => component.componentId === requestedItem,
        ) ?? dashboard.components[0])
      : undefined;
  const view: AdminView =
    initialView === "incident" && !selectedIncident
      ? "incident-new"
      : initialView === "maintenance" && !selectedMaintenance
        ? "maintenance-new"
        : initialView === "component" && !selectedComponent
          ? "component-new"
          : initialView;

  let activePane: ReactNode;

  if (view === "timeline" && ownerTimeline) {
    activePane = (
      <AdminPane
        description={t("pane.timelineDescription")}
        eyebrow={t("pane.timelineEyebrow")}
        title={t("pane.timelineTitle")}
      >
        <OwnerTimeline
          nextHref={
            ownerTimeline.nextCursor
              ? ownerTimelineHref(ownerTimeline.nextCursor)
              : null
          }
          timeline={ownerTimeline}
          timeZone={siteProfile?.revision.timezone ?? "Asia/Shanghai"}
        />
      </AdminPane>
    );
  } else if (view === "status") {
    activePane = (
      <AdminPane
        description={t("pane.statusDescription")}
        eyebrow={t("pane.statusEyebrow")}
        title={t("pane.statusTitle")}
      >
        {options.length === 0 ? (
          <AdminPrerequisite
            copy={t("pane.statusEmptyCopy")}
            heading={t("pane.statusEmptyHeading")}
            id="status-empty-heading"
          />
        ) : (
          <ReportStatusForm
            idempotencyKey={randomUUID()}
            options={options}
            preparedAt={now}
          />
        )}
      </AdminPane>
    );
  } else if (view === "incident-new") {
    activePane = (
      <AdminPane
        description={t("pane.incidentNewDescription")}
        eyebrow={t("pane.incidentNewEyebrow")}
        title={t("pane.incidentNewTitle")}
      >
        {options.length === 0 ? (
          <AdminPrerequisite
            copy={t("pane.incidentEmptyCopy")}
            heading={t("pane.incidentEmptyHeading")}
            id="incident-empty-heading"
          />
        ) : (
          <CreateIncidentForm
            idempotencyKey={randomUUID()}
            options={options}
            preparedAt={now}
          />
        )}
      </AdminPane>
    );
  } else if (view === "incident" && selectedIncident) {
    const latestUpdate = selectedIncident.updates.at(-1);
    const latestComponentIds =
      latestUpdate?.affectedComponents.map(
        (component) => component.componentId,
      ) ?? [];
    const historicalComponentIds = selectedIncident.updates.flatMap((update) =>
      update.publicAffectedComponents.map((component) => component.componentId),
    );
    const closableLastAction =
      selectedIncident.publication.lastAction &&
      selectedIncident.publication.lastAction !== "suppress"
        ? selectedIncident.publication.lastAction
        : null;
    const incidentTask =
      requestedTask === "metadata"
        ? "metadata"
        : requestedTask === "privacy" && closableLastAction
          ? "privacy"
          : "operate";
    const incidentMetadataComponents = dashboard.components.map(
      (component) => ({
        componentId: component.componentId,
        componentVersion: component.componentVersion,
        isActive: component.metadata.lifecycle === "active",
        isPublic: component.publication.isComponentPublic,
        metadataPublicationVersion:
          component.publication.componentMetadata.version,
        name: component.metadata.ownerName,
      }),
    );

    activePane = (
      <AdminPane
        description={t("pane.incidentDescription")}
        eyebrow={t("pane.incidentEyebrow")}
        tabs={
          <nav
            aria-label={t("tabs.incidentOperations")}
            className="admin-pane-tabs"
          >
            <AdminPaneTab
              href={adminHref(
                "incident",
                selectedIncident.incidentId,
                "operate",
              )}
              icon={Activity}
              isCurrent={incidentTask === "operate"}
              label={t("tabs.update")}
            />
            <AdminPaneTab
              href={adminHref(
                "incident",
                selectedIncident.incidentId,
                "metadata",
              )}
              icon={PencilLine}
              isCurrent={incidentTask === "metadata"}
              label={t("tabs.details")}
            />
            {closableLastAction ? (
              <AdminPaneTab
                href={adminHref(
                  "incident",
                  selectedIncident.incidentId,
                  "privacy",
                )}
                icon={ShieldAlert}
                isCurrent={incidentTask === "privacy"}
                label={t("tabs.publicRecord")}
              />
            ) : null}
          </nav>
        }
        title={selectedIncident.latestTitle}
      >
        <div className="mb-7 flex flex-wrap gap-2">
          <span
            className="condition-pill"
            data-severity={selectedIncident.latestSeverity}
          >
            {common(`severity.${selectedIncident.latestSeverity}`)}
          </span>
          <span className="exposure-pill">
            {common(`phase.${selectedIncident.latestPhase}`)}
          </span>
          <span
            className={
              selectedIncident.publication.resultingDisposition === "published"
                ? "exposure-pill bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "exposure-pill"
            }
          >
            {selectedIncident.publication.resultingDisposition === "published"
              ? t("public")
              : t("ownerOnly")}
          </span>
        </div>
        {incidentTask === "privacy" && closableLastAction ? (
          <CloseIncidentPublicationForm
            affectedComponents={reviewPublicComponentGuards(
              historicalComponentIds,
            )}
            idempotencyKey={randomUUID()}
            incidentId={selectedIncident.incidentId}
            incidentVersion={selectedIncident.version}
            key={`${selectedIncident.incidentId}:${selectedIncident.publication.version}:${closableLastAction}`}
            lastAction={closableLastAction}
            publicationVersion={selectedIncident.publication.version}
          />
        ) : incidentTask === "metadata" && latestUpdate ? (
          <IncidentMetadataForm
            components={incidentMetadataComponents}
            currentAffectedComponents={reviewComponentGuards(
              latestComponentIds,
            )}
            currentOwner={{
              title: latestUpdate.title,
              severity: latestUpdate.severity,
              summary: latestUpdate.ownerSummary,
              privateNote: latestUpdate.privateNote,
            }}
            currentPublic={selectedIncident.publication.currentSnapshot}
            idempotencyKey={randomUUID()}
            incidentId={selectedIncident.incidentId}
            incidentVersion={selectedIncident.version}
            preparedAt={now}
            publicationVersion={selectedIncident.publication.version}
          />
        ) : (
          <UpdateIncidentForm
            components={reviewComponentOptions(latestComponentIds)}
            idempotencyKey={randomUUID()}
            incidentId={selectedIncident.incidentId}
            incidentVersion={selectedIncident.version}
            isPublic={
              selectedIncident.publication.resultingDisposition === "published"
            }
            phase={selectedIncident.latestPhase}
            preparedAt={now}
            publicationVersion={selectedIncident.publication.version}
          />
        )}
      </AdminPane>
    );
  } else if (view === "maintenance-new") {
    activePane = (
      <AdminPane
        description={t("pane.maintenanceNewDescription")}
        eyebrow={t("pane.maintenanceNewEyebrow")}
        title={t("pane.maintenanceNewTitle")}
      >
        {options.length === 0 ? (
          <AdminPrerequisite
            copy={t("pane.maintenanceEmptyCopy")}
            heading={t("pane.maintenanceEmptyHeading")}
            id="maintenance-empty-heading"
          />
        ) : (
          <ScheduleMaintenanceForm
            idempotencyKey={randomUUID()}
            options={options}
            preparedAt={now}
          />
        )}
      </AdminPane>
    );
  } else if (view === "maintenance" && selectedMaintenance) {
    const latestComponentIds =
      selectedMaintenance.latestEvent.affectedComponents.map(
        (component) => component.componentId,
      );
    const historicalComponentIds = selectedMaintenance.events.flatMap((event) =>
      event.affectedComponents.map((component) => component.componentId),
    );
    const publishMaintenanceComponents = uniqueComponentIds(
      latestComponentIds,
    ).map((componentId) => {
      const component = componentById.get(componentId);
      if (!component) {
        throw new Error("An owner component reference could not be resolved");
      }

      const publicMetadata =
        component.publication.componentMetadata.currentSource?.snapshot ?? null;

      return {
        componentId,
        name: publicMetadata?.name ?? component.metadata.ownerName,
        expectedComponentVersion: component.componentVersion,
        expectedComponentMetadataPublicationVersion:
          component.publication.isComponentPublic && publicMetadata
            ? component.publication.componentMetadata.version
            : 0,
      };
    });
    const closableLastAction =
      selectedMaintenance.publication.lastAction &&
      selectedMaintenance.publication.lastAction !== "suppress"
        ? selectedMaintenance.publication.lastAction
        : null;
    const canPublishMaintenance =
      selectedMaintenance.publication.resultingDisposition !== "published" &&
      selectedMaintenance.publication.lastAction !== "suppress";
    const maintenanceTask =
      requestedTask === "publish" && canPublishMaintenance
        ? "publish"
        : requestedTask === "privacy" && closableLastAction
          ? "privacy"
          : "operate";

    activePane = (
      <AdminPane
        description={t("pane.maintenanceDescription")}
        eyebrow={t("pane.maintenanceEyebrow")}
        tabs={
          <nav
            aria-label={t("tabs.maintenanceOperations")}
            className="admin-pane-tabs"
          >
            <AdminPaneTab
              href={adminHref(
                "maintenance",
                selectedMaintenance.maintenanceWindowId,
                "operate",
              )}
              icon={Activity}
              isCurrent={maintenanceTask === "operate"}
              label={t("tabs.update")}
            />
            {canPublishMaintenance ? (
              <AdminPaneTab
                href={adminHref(
                  "maintenance",
                  selectedMaintenance.maintenanceWindowId,
                  "publish",
                )}
                icon={Upload}
                isCurrent={maintenanceTask === "publish"}
                label={t("tabs.publish")}
              />
            ) : null}
            {closableLastAction ? (
              <AdminPaneTab
                href={adminHref(
                  "maintenance",
                  selectedMaintenance.maintenanceWindowId,
                  "privacy",
                )}
                icon={ShieldAlert}
                isCurrent={maintenanceTask === "privacy"}
                label={t("tabs.publicRecord")}
              />
            ) : null}
          </nav>
        }
        title={selectedMaintenance.latestEvent.title}
      >
        <div className="mb-7 flex flex-wrap items-center gap-2">
          <span className="condition-pill" data-condition="limited">
            {common(`phase.${selectedMaintenance.phase}`)}
          </span>
          <span
            className={
              selectedMaintenance.publication.resultingDisposition ===
              "published"
                ? "exposure-pill bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "exposure-pill"
            }
          >
            {selectedMaintenance.publication.resultingDisposition ===
            "published"
              ? t("public")
              : t("ownerOnly")}
          </span>
          {selectedMaintenance.isOverdue ? (
            <span className="exposure-pill bg-[var(--warning-soft)] text-[var(--warning)]">
              {t("overdue", {
                reason: selectedMaintenance.overdueReason
                  ? common(`overdueReason.${selectedMaintenance.overdueReason}`)
                  : "",
              })}
            </span>
          ) : null}
        </div>
        <p className="mb-7 text-sm leading-6 text-[var(--muted-strong)]">
          {displayTime(selectedMaintenance.latestEvent.startsAt, locale)} –{" "}
          {displayTime(selectedMaintenance.latestEvent.endsAt, locale)}
        </p>
        {maintenanceTask === "publish" && canPublishMaintenance ? (
          <PublishMaintenanceForm
            affectedComponents={publishMaintenanceComponents}
            endsAt={selectedMaintenance.latestEvent.endsAt}
            idempotencyKey={randomUUID()}
            maintenanceVersion={selectedMaintenance.maintenanceVersion}
            maintenanceWindowId={selectedMaintenance.maintenanceWindowId}
            ownerSummary={selectedMaintenance.latestEvent.ownerSummary}
            ownerTitle={selectedMaintenance.latestEvent.title}
            phase={selectedMaintenance.phase}
            preparedAt={now}
            publicationVersion={selectedMaintenance.publication.version}
            startsAt={selectedMaintenance.latestEvent.startsAt}
            timezone={selectedMaintenance.latestEvent.timezone}
          />
        ) : maintenanceTask === "privacy" && closableLastAction ? (
          <CloseMaintenancePublicationForm
            affectedComponents={reviewPublicComponentGuards(
              historicalComponentIds,
            )}
            idempotencyKey={randomUUID()}
            key={`${selectedMaintenance.maintenanceWindowId}:${selectedMaintenance.publication.version}:${closableLastAction}`}
            lastAction={closableLastAction}
            maintenanceVersion={selectedMaintenance.maintenanceVersion}
            maintenanceWindowId={selectedMaintenance.maintenanceWindowId}
            publicationVersion={selectedMaintenance.publication.version}
          />
        ) : (
          <UpdateMaintenanceForm
            components={reviewComponentOptions(latestComponentIds)}
            idempotencyKey={randomUUID()}
            isPublic={
              selectedMaintenance.publication.resultingDisposition ===
              "published"
            }
            maintenanceVersion={selectedMaintenance.maintenanceVersion}
            maintenanceWindowId={selectedMaintenance.maintenanceWindowId}
            phase={selectedMaintenance.phase}
            preparedAt={now}
            publicationVersion={selectedMaintenance.publication.version}
          />
        )}
      </AdminPane>
    );
  } else if (view === "component-new") {
    activePane = (
      <AdminPane
        description={t("pane.componentNewDescription")}
        eyebrow={t("pane.componentNewEyebrow")}
        title={t("pane.componentNewTitle")}
      >
        <CreateComponentForm
          idempotencyKey={randomUUID()}
          preparedAt={now}
          suggestedSortOrder={dashboard.components.length}
        />
      </AdminPane>
    );
  } else if (view === "component" && selectedComponent) {
    const publishedStatus = selectedComponent.statusHistory.find(
      (transition) =>
        transition.publicationVersion ===
          selectedComponent.publication.componentStatus.version &&
        transition.publicDisposition === "published",
    );
    const currentVisitorSnapshot =
      publicPreview?.components.find(
        (component) =>
          component.componentPublicId === selectedComponent.componentPublicId,
      ) ?? null;
    const canPublish =
      selectedComponent.metadata.lifecycle === "active" &&
      selectedComponent.metadata.publicDraft !== null &&
      selectedComponent.publication.componentMetadata.currentSource
        ?.sourceId !== selectedComponent.metadata.revisionId;
    const hasPublicationHistory =
      selectedComponent.publication.componentMetadata.version > 0 ||
      selectedComponent.publication.componentStatus.version > 0;
    const componentTask =
      requestedTask === "privacy" && hasPublicationHistory
        ? "privacy"
        : requestedTask === "publish" && canPublish
          ? "publish"
          : requestedTask === "lifecycle"
            ? "lifecycle"
            : requestedTask === "status-privacy" && publishedStatus
              ? "status-privacy"
              : "metadata";
    const privacyReview =
      componentTask === "privacy"
        ? await getOwnerComponentPrivacyReview(selectedComponent.componentId)
        : null;
    if (componentTask === "privacy" && !privacyReview) {
      throw new Error("The selected component privacy review is unavailable");
    }
    const privacyParentLabels = privacyReview
      ? Object.fromEntries(
          [
            ...privacyReview.redact.dependentParents,
            ...privacyReview.suppress.dependentParents,
          ].map((parent) => {
            if (parent.kind === "incident") {
              const incident = orderedIncidents.find(
                (candidate) => candidate.incidentId === parent.incidentId,
              );
              return [
                `incident:${parent.incidentId}`,
                {
                  title: incident?.latestTitle ?? t("relation.incident"),
                  meta: incident
                    ? t("relation.incidentMeta", {
                        phase: common(`phase.${incident.latestPhase}`),
                      })
                    : t("relation.incident"),
                },
              ];
            }

            const maintenance = orderedMaintenance.find(
              (candidate) =>
                candidate.maintenanceWindowId === parent.maintenanceWindowId,
            );
            return [
              `maintenance:${parent.maintenanceWindowId}`,
              {
                title:
                  maintenance?.latestEvent.title ?? t("relation.maintenance"),
                meta: maintenance
                  ? t("relation.maintenanceMeta", {
                      phase: common(`phase.${maintenance.phase}`),
                    })
                  : t("relation.maintenance"),
              },
            ];
          }),
        )
      : {};
    const archiveBlockers = getComponentArchiveBlockers(
      selectedComponent.componentId,
      incidents,
      maintenanceWindows,
    );
    const suggestedCondition =
      selectedComponent.status.condition === "unknown"
        ? undefined
        : selectedComponent.status.condition;

    activePane = (
      <AdminPane
        description={t("pane.componentDescription")}
        eyebrow={t("pane.componentEyebrow")}
        tabs={
          <nav
            aria-label={t("tabs.componentOperations")}
            className="admin-pane-tabs"
          >
            <AdminPaneTab
              href={adminHref(
                "component",
                selectedComponent.componentId,
                "metadata",
              )}
              icon={PencilLine}
              isCurrent={componentTask === "metadata"}
              label={t("tabs.edit")}
            />
            {canPublish ? (
              <AdminPaneTab
                href={adminHref(
                  "component",
                  selectedComponent.componentId,
                  "publish",
                )}
                icon={Upload}
                isCurrent={componentTask === "publish"}
                label={t("tabs.publish")}
              />
            ) : null}
            <AdminPaneTab
              href={adminHref(
                "component",
                selectedComponent.componentId,
                "lifecycle",
              )}
              icon={
                selectedComponent.metadata.lifecycle === "active"
                  ? Archive
                  : RotateCcw
              }
              isCurrent={componentTask === "lifecycle"}
              label={
                selectedComponent.metadata.lifecycle === "active"
                  ? t("tabs.archive")
                  : t("tabs.restore")
              }
            />
            {publishedStatus ? (
              <AdminPaneTab
                href={adminHref(
                  "component",
                  selectedComponent.componentId,
                  "status-privacy",
                )}
                icon={ShieldAlert}
                isCurrent={componentTask === "status-privacy"}
                label={t("tabs.publicStatus")}
              />
            ) : null}
            {hasPublicationHistory ? (
              <AdminPaneTab
                href={adminHref(
                  "component",
                  selectedComponent.componentId,
                  "privacy",
                )}
                icon={ShieldAlert}
                isCurrent={componentTask === "privacy"}
                label={t("tabs.componentPrivacy")}
              />
            ) : null}
          </nav>
        }
        title={selectedComponent.metadata.ownerName}
      >
        <div key={selectedComponent.componentId}>
          {componentTask === "publish" &&
          canPublish &&
          selectedComponent.metadata.publicDraft ? (
            <PublishComponentForm
              componentId={selectedComponent.componentId}
              componentVersion={selectedComponent.componentVersion}
              currentVisitorSnapshot={currentVisitorSnapshot}
              defaultValidityMs={selectedComponent.metadata.defaultValidityMs}
              idempotencyKey={randomUUID()}
              metadataPublicationVersion={
                selectedComponent.publication.componentMetadata.version
              }
              preparedAt={now}
              publicDraft={selectedComponent.metadata.publicDraft}
              statusPublicationVersion={
                selectedComponent.publication.componentStatus.version
              }
              suggestedCondition={suggestedCondition}
            />
          ) : componentTask === "lifecycle" ? (
            <ComponentLifecycleForm
              blockers={archiveBlockers}
              componentId={selectedComponent.componentId}
              componentVersion={selectedComponent.componentVersion}
              hasCurrentPublicStatus={
                selectedComponent.publication.componentStatus.currentSource !==
                null
              }
              idempotencyKey={randomUUID()}
              isComponentPublic={
                selectedComponent.publication.isComponentPublic
              }
              lifecycle={selectedComponent.metadata.lifecycle}
              metadataPublicationVersion={
                selectedComponent.publication.componentMetadata.version
              }
              statusPublicationVersion={
                selectedComponent.publication.componentStatus.version
              }
            />
          ) : componentTask === "privacy" && privacyReview ? (
            <CloseComponentPublicationForm
              idempotencyKey={randomUUID()}
              parentLabels={privacyParentLabels}
              review={privacyReview}
            />
          ) : componentTask === "status-privacy" && publishedStatus ? (
            <CloseStatusPublicationForm
              componentId={selectedComponent.componentId}
              componentVersion={selectedComponent.componentVersion}
              idempotencyKey={randomUUID()}
              key={`${publishedStatus.transitionId}:${publishedStatus.publicationVersion}`}
              statusPublicationVersion={publishedStatus.publicationVersion}
              statusTransitionId={publishedStatus.transitionId}
            />
          ) : (
            <ComponentMetadataForm
              componentId={selectedComponent.componentId}
              componentVersion={selectedComponent.componentVersion}
              idempotencyKey={randomUUID()}
              metadata={selectedComponent.metadata}
              metadataPublicationVersion={
                selectedComponent.publication.componentMetadata.version
              }
              visitorSnapshot={currentVisitorSnapshot}
            />
          )}
        </div>
      </AdminPane>
    );
  } else if (view === "settings") {
    const settingsTask =
      requestedTask === "publish" || requestedTask === "privacy"
        ? requestedTask
        : "edit";

    activePane = (
      <AdminPane
        description={t("pane.settingsDescription")}
        eyebrow={t("pane.settingsEyebrow")}
        tabs={
          <nav
            aria-label={t("tabs.siteProfileOperations")}
            className="admin-pane-tabs"
          >
            <AdminPaneTab
              href={adminHref("settings", undefined, "edit")}
              icon={PencilLine}
              isCurrent={settingsTask === "edit"}
              label={t("tabs.edit")}
            />
            <AdminPaneTab
              href={adminHref("settings", undefined, "publish")}
              icon={Upload}
              isCurrent={settingsTask === "publish"}
              label={t("tabs.publish")}
            />
            <AdminPaneTab
              href={adminHref("settings", undefined, "privacy")}
              icon={ShieldAlert}
              isCurrent={settingsTask === "privacy"}
              label={t("tabs.publicRecord")}
            />
          </nav>
        }
        title={siteProfile?.revision.ownerTitle ?? t("siteProfile")}
      >
        {settingsTask === "publish" ? (
          <PublishSiteProfileForm
            idempotencyKey={randomUUID()}
            profile={siteProfile}
          />
        ) : settingsTask === "privacy" ? (
          <CloseSiteProfilePublicationForm
            idempotencyKey={randomUUID()}
            profile={siteProfile}
          />
        ) : (
          <EditSiteProfileForm
            idempotencyKey={randomUUID()}
            profile={siteProfile}
          />
        )}
      </AdminPane>
    );
  } else {
    const incidentTarget = orderedIncidents[0]
      ? adminHref("incident", orderedIncidents[0].incidentId)
      : adminHref("incident-new");
    const maintenanceTarget = orderedMaintenance[0]
      ? adminHref("maintenance", orderedMaintenance[0].maintenanceWindowId)
      : adminHref("maintenance-new");
    const componentTarget = dashboard.components[0]
      ? adminHref("component", dashboard.components[0].componentId)
      : adminHref("component-new");

    activePane = (
      <AdminPane
        description={t("pane.overviewDescription")}
        eyebrow={t("pane.overviewEyebrow")}
        title={t("pane.overviewTitle")}
      >
        <dl className="admin-overview-projections">
          <div className="admin-overview-projection">
            <dt className="eyebrow">{t("pane.owner")}</dt>
            <dd className="admin-overview-value">
              <span
                className="condition-pill"
                data-condition={dashboard.overall.condition}
              >
                {common(`condition.${dashboard.overall.condition}`)}
              </span>
              <span className="text-xl font-semibold capitalize">
                {common(`coverage.${dashboard.overall.coverage}`)}
              </span>
              {dashboard.overall.hasActiveMaintenance ? (
                <span className="admin-overview-maintenance">
                  {t("pane.maintenanceInProgress")}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="admin-overview-projection">
            <dt className="eyebrow">{t("pane.public")}</dt>
            <dd className="admin-overview-value">
              {publicPreview ? (
                <>
                  <span
                    className="condition-pill"
                    data-condition={publicPreview.overall.condition}
                  >
                    {common(`condition.${publicPreview.overall.condition}`)}
                  </span>
                  <span className="text-xl font-semibold capitalize">
                    {common(`coverage.${publicPreview.overall.coverage}`)}
                  </span>
                  {publicPreview.overall.hasActiveMaintenance ? (
                    <span className="admin-overview-maintenance">
                      {t("pane.maintenanceInProgress")}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-[var(--muted-strong)]">
                  {t("previewUnavailable")}
                </span>
              )}
            </dd>
          </div>
        </dl>
        <div className="admin-overview-counts">
          <Link className="admin-overview-count" href={incidentTarget}>
            <span className="eyebrow">{t("pane.incidents")}</span>
            <span className="admin-overview-count-value">
              {orderedIncidents.length}
            </span>
          </Link>
          <Link className="admin-overview-count" href={maintenanceTarget}>
            <span className="eyebrow">{t("pane.maintenance")}</span>
            <span className="admin-overview-count-value">
              {orderedMaintenance.length}
            </span>
          </Link>
          <Link className="admin-overview-count" href={componentTarget}>
            <span className="eyebrow">{t("pane.components")}</span>
            <span className="admin-overview-count-value">
              {dashboard.components.length}
            </span>
          </Link>
        </div>
      </AdminPane>
    );
  }

  return (
    <main className="admin-shell mx-auto min-h-dvh w-full max-w-[90rem] px-4 py-5 sm:px-7 sm:py-7 lg:px-8">
      <a className="admin-skip-link" href="#admin-active-pane">
        {t("skip")}
      </a>
      <AdminPaneFocusManager targetId="admin-active-pane" />
      <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-[var(--accent-strong)]">{t("console")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            {t("title")}
          </h1>
        </div>
        <div className="flex min-h-11 flex-wrap items-start gap-2 sm:justify-end">
          <LocaleSwitcher />
          <Link className="action-button" href="/">
            <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t("publicPreview")}
          </Link>
          <SignOutButton />
        </div>
      </header>

      <p
        aria-live="polite"
        aria-atomic="true"
        className="mt-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent-strong)] empty:hidden"
        role="status"
      >
        {notice}
      </p>

      <div className="admin-workspace">
        <aside className="admin-sidebar" aria-label={t("workspaceNavigation")}>
          <nav aria-label={t("workspace")} className="admin-nav">
            <ul className="admin-nav-list">
              <AdminNavLink
                href={adminHref("overview")}
                icon={LayoutDashboard}
                isCurrent={view === "overview"}
                label={t("navigation.overview")}
                meta={t("navigation.overviewMeta")}
              />
              <AdminNavLink
                href={adminHref("timeline")}
                icon={History}
                isCurrent={view === "timeline"}
                label={t("navigation.timeline")}
                meta={t("navigation.timelineMeta")}
              />
              <AdminNavLink
                href={adminHref("status")}
                icon={Activity}
                isCurrent={view === "status"}
                label={t("navigation.status")}
                meta={t("navigation.statusMeta")}
              />
            </ul>

            <section className="admin-nav-group">
              <h2 className="admin-nav-label">{t("navigation.incidents")}</h2>
              <ul className="admin-nav-list">
                <AdminNavLink
                  href={adminHref("incident-new")}
                  icon={CirclePlus}
                  isCurrent={view === "incident-new"}
                  label={t("navigation.openIncident")}
                />
                {orderedIncidents.map((incident) => (
                  <AdminNavLink
                    href={adminHref("incident", incident.incidentId)}
                    icon={TriangleAlert}
                    isCurrent={
                      view === "incident" &&
                      selectedIncident?.incidentId === incident.incidentId
                    }
                    key={incident.incidentId}
                    label={incident.latestTitle}
                    meta={common(`phase.${incident.latestPhase}`)}
                  />
                ))}
              </ul>
            </section>

            <section className="admin-nav-group">
              <h2 className="admin-nav-label">{t("navigation.maintenance")}</h2>
              <ul className="admin-nav-list">
                <AdminNavLink
                  href={adminHref("maintenance-new")}
                  icon={CalendarPlus}
                  isCurrent={view === "maintenance-new"}
                  label={t("navigation.scheduleMaintenance")}
                />
                {orderedMaintenance.map((window) => (
                  <AdminNavLink
                    href={adminHref("maintenance", window.maintenanceWindowId)}
                    icon={CalendarClock}
                    isCurrent={
                      view === "maintenance" &&
                      selectedMaintenance?.maintenanceWindowId ===
                        window.maintenanceWindowId
                    }
                    key={window.maintenanceWindowId}
                    label={window.latestEvent.title}
                    meta={common(`phase.${window.phase}`)}
                  />
                ))}
              </ul>
            </section>

            <section className="admin-nav-group">
              <h2 className="admin-nav-label">{t("navigation.components")}</h2>
              <ul className="admin-nav-list">
                <AdminNavLink
                  href={adminHref("component-new")}
                  icon={CirclePlus}
                  isCurrent={view === "component-new"}
                  label={t("navigation.createComponent")}
                />
                {dashboard.components.map((component) => (
                  <AdminNavLink
                    href={adminHref("component", component.componentId)}
                    icon={Box}
                    isCurrent={
                      view === "component" &&
                      selectedComponent?.componentId === component.componentId
                    }
                    key={component.componentId}
                    label={component.metadata.ownerName}
                    meta={common(`lifecycle.${component.metadata.lifecycle}`)}
                  />
                ))}
              </ul>
            </section>

            <section className="admin-nav-group">
              <h2 className="admin-nav-label">
                {t("navigation.configuration")}
              </h2>
              <ul className="admin-nav-list">
                <AdminNavLink
                  href={adminHref("settings", undefined, "edit")}
                  icon={Settings}
                  isCurrent={view === "settings"}
                  label={t("navigation.settings")}
                  meta={siteProfile ? t("configured") : t("notConfigured")}
                />
              </ul>
            </section>
          </nav>
        </aside>

        <div
          aria-labelledby="admin-pane-title"
          className="min-w-0"
          id="admin-active-pane"
          role="region"
          tabIndex={-1}
        >
          {activePane}
        </div>
      </div>
    </main>
  );
}
