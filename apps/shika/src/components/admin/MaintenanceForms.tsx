"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState, useSyncExternalStore } from "react";

import {
  closeMaintenancePublicationAction,
  scheduleMaintenanceAction,
  updateMaintenanceAction,
} from "@/app/admin/maintenance-actions";
import type { MaintenancePhase } from "@/domain/maintenance";
import type { AdminComponentOption } from "@/lib/forms/admin-component-option";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";
import { ComponentStatusOutcomeEditor } from "./ComponentStatusOutcomeEditor";

interface ScheduleMaintenanceFormProps {
  idempotencyKey: string;
  options: readonly AdminComponentOption[];
  preparedAt: number;
}

interface UpdateMaintenanceFormProps {
  components: readonly AdminComponentOption[];
  idempotencyKey: string;
  maintenanceWindowId: string;
  maintenanceVersion: number;
  publicationVersion: number;
  isPublic: boolean;
  phase: MaintenancePhase;
  preparedAt: number;
}

interface CloseMaintenancePublicationFormProps {
  affectedComponents: readonly PublicMaintenanceComponentGuard[];
  idempotencyKey: string;
  maintenanceWindowId: string;
  maintenanceVersion: number;
  publicationVersion: number;
  lastAction: "publish" | "withdraw" | "redact";
}

interface MaintenanceComponentGuard {
  componentId: string;
  expectedComponentVersion: number;
  expectedComponentMetadataPublicationVersion: number;
}

interface PublicMaintenanceComponentGuard extends MaintenanceComponentGuard {
  expectedComponentMetadataPublicationVersion: number;
}

type MaintenanceOperation =
  "reschedule" | "start" | "complete" | "cancel" | "note";
type MaintenanceClosureAction = "withdraw" | "redact" | "suppress";

const fieldClassName = "text-sm";

function toEpoch(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? String(timestamp) : "";
}

function subscribeToTimezone() {
  return () => undefined;
}

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function useBrowserTimezone() {
  return useSyncExternalStore(
    subscribeToTimezone,
    getBrowserTimezone,
    () => "UTC",
  );
}

export function ScheduleMaintenanceForm({
  idempotencyKey,
  options,
  preparedAt,
}: ScheduleMaintenanceFormProps) {
  const t = useTranslations("AdminForms");
  const [componentId, setComponentId] = useState(options[0]?.componentId ?? "");
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    "private",
  );
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [state, formAction, isPending] = useActionState(
    scheduleMaintenanceAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const timezone = useBrowserTimezone();
  const selected = options.find((option) => option.componentId === componentId);

  const handleComponentChange = (nextComponentId: string) => {
    setComponentId(nextComponentId);
    const next = options.find(
      (option) => option.componentId === nextComponentId,
    );
    if (!next?.isPublic) setPublicationMode("private");
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="admin-form"
      onSubmit={captureSubmissionTime}
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        defaultValue={String(preparedAt)}
        name="effectiveAt"
        ref={effectiveAtRef}
        type="hidden"
      />
      <input
        name="expectedComponentVersion"
        type="hidden"
        value={selected?.componentVersion ?? 0}
      />
      <input
        name="expectedComponentMetadataPublicationVersion"
        type="hidden"
        value={selected?.metadataPublicationVersion ?? 0}
      />
      <input name="startsAt" type="hidden" value={startsAt} />
      <input name="endsAt" type="hidden" value={endsAt} />
      <input name="timezone" type="hidden" value={timezone} />
      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.affectedItem")}</span>
            <select
              className={fieldClassName}
              name="componentId"
              onChange={(event) => handleComponentChange(event.target.value)}
              required
              value={componentId}
            >
              {options.map((option) => (
                <option key={option.componentId} value={option.componentId}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>{t("field.publication")}</span>
            <select
              className={fieldClassName}
              name="publicationMode"
              onChange={(event) =>
                setPublicationMode(event.target.value as "private" | "public")
              }
              value={publicationMode}
            >
              <option value="private">{t("option.ownerOnly")}</option>
              {selected?.isPublic ? (
                <option value="public">{t("option.publishMaintenance")}</option>
              ) : null}
            </select>
          </label>
        </div>
        {!selected?.isPublic ? (
          <div className="form-prerequisite">
            <p>{t("maintenance.privateComponent")}</p>
            {selected ? (
              <Link href={`/admin?view=component&item=${selected.componentId}`}>
                {t("maintenance.openWorkspace")}
              </Link>
            ) : null}
          </div>
        ) : null}
        <label className="form-field">
          <span>{t("field.ownerTitle")}</span>
          <input
            className={fieldClassName}
            maxLength={120}
            name="title"
            required
          />
        </label>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.starts")}</span>
            <input
              className={fieldClassName}
              name="startsAtLocal"
              onChange={(event) => setStartsAt(toEpoch(event.target.value))}
              required
              type="datetime-local"
            />
          </label>
          <label className="form-field">
            <span>{t("field.ends")}</span>
            <input
              className={fieldClassName}
              name="endsAtLocal"
              onChange={(event) => setEndsAt(toEpoch(event.target.value))}
              required
              type="datetime-local"
            />
          </label>
        </div>
        <p className="form-help">{t("maintenance.timezone", { timezone })}</p>
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={280}
            name="ownerSummary"
          />
        </label>
        <label className="form-field">
          <span>{t("field.privateNote")}</span>
          <textarea
            className={fieldClassName}
            maxLength={2000}
            name="privateNote"
          />
        </label>
        {publicationMode === "public" ? (
          <section
            className="form-section"
            aria-labelledby="maintenance-public-title"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="maintenance-public-title">
                {t("maintenance.visitorNotice")}
              </h3>
              <p className="form-section-copy">
                {t("maintenance.visitorNoticeDescription")}
              </p>
            </div>
            <label className="form-field">
              <span>{t("field.publicTitle")}</span>
              <input
                className={fieldClassName}
                maxLength={120}
                name="publicTitle"
                required
              />
            </label>
            <label className="form-field">
              <span>{t("field.publicSummary")}</span>
              <textarea
                className={fieldClassName}
                maxLength={280}
                name="publicSummary"
              />
            </label>
          </section>
        ) : null}
        <div className="form-actions">
          <button className="form-submit" type="submit">
            {isPending
              ? t("action.scheduling")
              : t("action.scheduleMaintenance")}
          </button>
        </div>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}

export function UpdateMaintenanceForm({
  components,
  idempotencyKey,
  maintenanceWindowId,
  maintenanceVersion,
  publicationVersion,
  isPublic,
  phase,
  preparedAt,
}: UpdateMaintenanceFormProps) {
  const t = useTranslations("AdminForms");
  const [operation, setOperation] = useState<MaintenanceOperation>("note");
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    "private",
  );
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [state, formAction, isPending] = useActionState(
    updateMaintenanceAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const timezone = useBrowserTimezone();
  const requiresPublic = isPublic && operation !== "note";
  const requiresConfirmation = ["start", "complete", "cancel"].includes(
    operation,
  );
  const componentGuards = components.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.componentVersion,
    expectedComponentMetadataPublicationVersion:
      component.metadataPublicationVersion,
  }));

  const handleOperationChange = (nextOperation: MaintenanceOperation) => {
    setOperation(nextOperation);
    if (isPublic && nextOperation !== "note") setPublicationMode("public");
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="admin-form"
      onSubmit={captureSubmissionTime}
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        defaultValue={String(preparedAt)}
        name="effectiveAt"
        ref={effectiveAtRef}
        type="hidden"
      />
      <input
        name="maintenanceWindowId"
        type="hidden"
        value={maintenanceWindowId}
      />
      <input
        name="componentGuards"
        type="hidden"
        value={JSON.stringify(componentGuards)}
      />
      <input
        name="expectedMaintenanceVersion"
        type="hidden"
        value={maintenanceVersion}
      />
      <input
        name="expectedPublicationVersion"
        type="hidden"
        value={publicationVersion}
      />
      <input name="startsAt" type="hidden" value={startsAt} />
      <input name="endsAt" type="hidden" value={endsAt} />
      <input name="timezone" type="hidden" value={timezone} />
      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.operation")}</span>
            <select
              className={fieldClassName}
              name="operation"
              onChange={(event) =>
                handleOperationChange(
                  event.target.value as MaintenanceOperation,
                )
              }
              value={operation}
            >
              <option value="note">{t("option.appendNote")}</option>
              {phase === "scheduled" ? (
                <>
                  <option value="reschedule">{t("option.reschedule")}</option>
                  <option value="start">{t("option.start")}</option>
                  <option value="cancel">{t("option.cancel")}</option>
                </>
              ) : null}
              {phase === "in_progress" ? (
                <>
                  <option value="complete">{t("option.complete")}</option>
                  <option value="cancel">{t("option.cancel")}</option>
                </>
              ) : null}
            </select>
          </label>
          {requiresPublic ? (
            <div className="form-prerequisite">
              <input name="publicationMode" type="hidden" value="public" />
              <p>{t("maintenance.publicLifecycle")}</p>
            </div>
          ) : isPublic ? (
            <label className="form-field">
              <span>{t("field.publication")}</span>
              <select
                className={fieldClassName}
                name="publicationMode"
                onChange={(event) =>
                  setPublicationMode(event.target.value as "private" | "public")
                }
                value={publicationMode}
              >
                <option value="private">{t("option.ownerOnly")}</option>
                <option value="public">
                  {t("option.publishIncidentUpdate")}
                </option>
              </select>
            </label>
          ) : (
            <div className="form-prerequisite">
              <input name="publicationMode" type="hidden" value="private" />
              <p>{t("maintenance.ownerOnlyUpdate")}</p>
            </div>
          )}
        </div>
        {operation === "reschedule" ? (
          <div className="form-grid form-grid-two">
            <label className="form-field">
              <span>{t("field.newStart")}</span>
              <input
                className={fieldClassName}
                name="startsAtLocal"
                onChange={(event) => setStartsAt(toEpoch(event.target.value))}
                required
                type="datetime-local"
              />
            </label>
            <label className="form-field">
              <span>{t("field.newEnd")}</span>
              <input
                className={fieldClassName}
                name="endsAtLocal"
                onChange={(event) => setEndsAt(toEpoch(event.target.value))}
                required
                type="datetime-local"
              />
            </label>
          </div>
        ) : null}
        <noscript>
          <div className="space-y-3 border border-[var(--border)] p-3">
            <p className="text-xs leading-5 text-[var(--muted)]">
              {t("maintenance.noScriptReschedule")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t("field.newStart")}</span>
                <input
                  className={fieldClassName}
                  name="startsAtLocal"
                  type="datetime-local"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("field.newEnd")}</span>
                <input
                  className={fieldClassName}
                  name="endsAtLocal"
                  type="datetime-local"
                />
              </label>
            </div>
          </div>
        </noscript>
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={280}
            name="ownerSummary"
          />
        </label>
        <label className="form-field">
          <span>{t("field.privateNote")}</span>
          <textarea
            className={fieldClassName}
            maxLength={2000}
            name="privateNote"
          />
        </label>
        {publicationMode === "public" ? (
          <section
            className="form-section"
            aria-labelledby="maintenance-update-public"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="maintenance-update-public">
                {t("maintenance.visitorUpdate")}
              </h3>
              <p className="form-section-copy">
                {t("maintenance.visitorUpdateDescription")}
              </p>
            </div>
            <label className="form-field">
              <span>{t("field.publicSummary")}</span>
              <textarea
                className={fieldClassName}
                maxLength={280}
                name="publicSummary"
              />
            </label>
          </section>
        ) : null}
        {operation === "start" || operation === "complete" ? (
          <ComponentStatusOutcomeEditor
            components={components}
            defaultCondition={
              operation === "complete" ? "available" : "limited"
            }
            description={
              operation === "complete"
                ? t("maintenance.recoveryDescription")
                : t("maintenance.startDescription")
            }
            fieldName="componentStatusChoices"
            title={
              operation === "complete"
                ? t("maintenance.recoveryTitle")
                : t("maintenance.startTitle")
            }
          />
        ) : (
          <input name="componentStatusChoices" type="hidden" value="[]" />
        )}
        {requiresConfirmation ? (
          <label className="form-choice">
            <input
              className="mt-1"
              name="confirmation"
              required
              type="checkbox"
              value="confirmed"
            />
            <span>{t("maintenance.lifecycleConfirmation")}</span>
          </label>
        ) : (
          <input name="confirmation" type="hidden" value="" />
        )}
        <div className="form-actions">
          <button className="form-submit" type="submit">
            {isPending ? t("action.saving") : t("action.saveMaintenanceUpdate")}
          </button>
        </div>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}

export function CloseMaintenancePublicationForm({
  affectedComponents,
  idempotencyKey,
  maintenanceWindowId,
  maintenanceVersion,
  publicationVersion,
  lastAction,
}: CloseMaintenancePublicationFormProps) {
  const t = useTranslations("AdminForms");
  const initialAction =
    lastAction === "publish"
      ? "withdraw"
      : lastAction === "withdraw"
        ? "redact"
        : "suppress";
  const [action, setAction] = useState<MaintenanceClosureAction>(initialAction);
  const [confirmedAction, setConfirmedAction] =
    useState<MaintenanceClosureAction | null>(null);
  const [state, formAction, isPending] = useActionState(
    closeMaintenancePublicationAction,
    initialAdminActionState,
  );
  const isConfirmed = confirmedAction === action;

  const selectAction = (nextAction: MaintenanceClosureAction) => {
    setAction(nextAction);
    setConfirmedAction(null);
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="mt-4 space-y-3 border-l border-[var(--border)] pl-4"
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        name="maintenanceWindowId"
        type="hidden"
        value={maintenanceWindowId}
      />
      <input
        name="affectedComponents"
        type="hidden"
        value={JSON.stringify(affectedComponents)}
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
      <fieldset className="space-y-3" disabled={isPending}>
        <legend className="sr-only">{t("maintenance.close")}</legend>
        <label className="block space-y-1 text-sm">
          <span>{t("maintenance.close")}</span>
          <select
            className={fieldClassName}
            name="action"
            onChange={(event) =>
              selectAction(event.target.value as MaintenanceClosureAction)
            }
            value={action}
          >
            {lastAction === "publish" ? (
              <option value="withdraw">
                {t("option.withdrawMaintenance")}
              </option>
            ) : null}
            {lastAction !== "redact" ? (
              <option value="redact">{t("option.redactSnapshots")}</option>
            ) : null}
            <option value="suppress">{t("option.emergencySuppression")}</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-[var(--muted)]">
          {t(`maintenance.${action}Description`)}
        </p>
        <label className="flex items-start gap-3 border border-[var(--border)] p-3 text-sm">
          <input
            checked={isConfirmed}
            className="mt-1"
            name="confirmation"
            onChange={(event) =>
              setConfirmedAction(event.target.checked ? action : null)
            }
            required
            type="checkbox"
            value="confirmed"
          />
          <span>
            {t("maintenance.closureConfirmation", {
              action: t(`maintenance.closureAction.${action}`),
            })}
          </span>
        </label>
        <button
          className="border border-[var(--foreground)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConfirmed || isPending}
          type="submit"
        >
          {isPending ? t("action.applying") : t(`maintenance.${action}Submit`)}
        </button>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
