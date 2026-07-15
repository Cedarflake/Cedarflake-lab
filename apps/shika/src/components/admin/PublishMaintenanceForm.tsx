"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { publishMaintenanceAction } from "@/app/admin/maintenance-actions";
import type { MaintenancePhase } from "@/domain/maintenance";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";

export interface PublishMaintenanceComponentGuard {
  componentId: string;
  name: string;
  expectedComponentVersion: number;
  expectedComponentMetadataPublicationVersion: number;
}

interface PublishMaintenanceFormProps {
  affectedComponents: readonly PublishMaintenanceComponentGuard[];
  idempotencyKey: string;
  maintenanceWindowId: string;
  maintenanceVersion: number;
  publicationVersion: number;
  phase: MaintenancePhase;
  ownerTitle: string;
  ownerSummary: string | null;
  startsAt: number;
  endsAt: number;
  timezone: string;
  preparedAt: number;
}

const fieldClassName =
  "w-full border border-[var(--border)] bg-transparent px-3 py-2 text-sm";

function displaySchedule(timestamp: number, timezone: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

export function PublishMaintenanceForm({
  affectedComponents,
  idempotencyKey,
  maintenanceWindowId,
  maintenanceVersion,
  publicationVersion,
  phase,
  ownerTitle,
  ownerSummary,
  startsAt,
  endsAt,
  timezone,
  preparedAt,
}: PublishMaintenanceFormProps) {
  const locale = useLocale();
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [state, formAction, isPending] = useActionState(
    publishMaintenanceAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const componentGuards = affectedComponents.map(
    ({
      componentId,
      expectedComponentVersion,
      expectedComponentMetadataPublicationVersion,
    }) => ({
      componentId,
      expectedComponentVersion,
      expectedComponentMetadataPublicationVersion,
    }),
  );
  const canPublish =
    componentGuards.length > 0 &&
    componentGuards.every(
      (component) =>
        component.expectedComponentVersion > 0 &&
        component.expectedComponentMetadataPublicationVersion > 0,
    );

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-5"
      onSubmit={captureSubmissionTime}
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        name="maintenanceWindowId"
        type="hidden"
        value={maintenanceWindowId}
      />
      <input
        name="expectedMaintenanceVersion"
        type="hidden"
        value={maintenanceVersion}
      />
      <input
        name="expectedMaintenancePublicationVersion"
        type="hidden"
        value={publicationVersion}
      />
      <input
        defaultValue={String(preparedAt)}
        name="effectiveAt"
        ref={effectiveAtRef}
        type="hidden"
      />
      <input name="publicStartsAt" type="hidden" value={startsAt} />
      <input name="publicEndsAt" type="hidden" value={endsAt} />
      <input name="publicTimezone" type="hidden" value={timezone} />
      <input
        name="affectedComponents"
        type="hidden"
        value={JSON.stringify(componentGuards)}
      />

      <fieldset className="space-y-5" disabled={isPending || !canPublish}>
        <legend className="sr-only">{t("publishMaintenance.legend")}</legend>

        <div className="grid gap-3 border border-[var(--border)] p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-[var(--muted)]">{t("field.ownerTitle")}</span>
            <strong className="text-right">{ownerTitle}</strong>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[var(--muted)]">
              {t("field.ownerSummary")}
            </span>
            <span className="max-w-sm text-right">
              {ownerSummary ?? t("publishMaintenance.noOwnerSummary")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--muted)]">{t("field.phase")}</span>
            <strong className="capitalize">{common(`phase.${phase}`)}</strong>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[var(--muted)]">
              {t("field.publicSchedule")}
            </span>
            <span className="text-right">
              {displaySchedule(startsAt, timezone, locale)} –{" "}
              {displaySchedule(endsAt, timezone, locale)}
              <br />
              <span className="text-xs text-[var(--muted)]">{timezone}</span>
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[var(--muted)]">
              {t("field.affectedItems")}
            </span>
            <span className="text-right">
              {affectedComponents.map((component) => component.name).join(", ")}
            </span>
          </div>
        </div>

        <label className="block space-y-1 text-sm">
          <span>{t("field.publicTitle")}</span>
          <input
            className={fieldClassName}
            maxLength={120}
            name="publicTitle"
            placeholder={t("publishMaintenance.publicTitlePlaceholder")}
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("field.publicSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={280}
            name="publicSummary"
            placeholder={t("publishMaintenance.publicSummaryPlaceholder")}
          />
        </label>
        <label className="flex items-start gap-3 border border-[var(--border)] p-3 text-sm">
          <input
            className="mt-1"
            name="confirmation"
            required
            type="checkbox"
            value="confirmed"
          />
          <span>{t("publishMaintenance.confirmation")}</span>
        </label>
        <button
          className="border border-[var(--foreground)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
        >
          {isPending ? t("action.publishing") : t("action.publishMaintenance")}
        </button>
      </fieldset>

      {!canPublish ? (
        <p className="text-sm text-[var(--muted)]">
          {t("publishMaintenance.requirePublicComponents")}
        </p>
      ) : null}
      <AdminActionFeedback state={state} />
    </form>
  );
}
