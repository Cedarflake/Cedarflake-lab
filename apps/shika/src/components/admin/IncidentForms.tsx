"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import {
  closeIncidentPublicationAction,
  createIncidentAction,
  updateIncidentAction,
} from "@/app/admin/incident-actions";
import type { IncidentPhase } from "@/domain/incidents";
import type { AdminComponentOption } from "@/lib/forms/admin-component-option";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";
import { ComponentStatusOutcomeEditor } from "./ComponentStatusOutcomeEditor";

interface CreateIncidentFormProps {
  idempotencyKey: string;
  options: readonly AdminComponentOption[];
  preparedAt: number;
}

interface UpdateIncidentFormProps {
  components: readonly AdminComponentOption[];
  idempotencyKey: string;
  incidentId: string;
  incidentVersion: number;
  publicationVersion: number;
  isPublic: boolean;
  phase: IncidentPhase;
  preparedAt: number;
}

interface CloseIncidentPublicationFormProps {
  affectedComponents: readonly PublicComponentGuard[];
  idempotencyKey: string;
  incidentId: string;
  incidentVersion: number;
  publicationVersion: number;
  lastAction: "publish" | "withdraw" | "redact";
}

interface ComponentGuard {
  componentId: string;
  expectedComponentVersion: number;
}

interface PublicComponentGuard extends ComponentGuard {
  expectedComponentMetadataPublicationVersion: number;
}

type IncidentOperation = "note" | "phase_update" | "resolve" | "reopen";
type IncidentClosureAction = "withdraw" | "redact" | "suppress";

const fieldClassName = "text-sm";

export function CreateIncidentForm({
  idempotencyKey,
  options,
  preparedAt,
}: CreateIncidentFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [selectedComponentIds, setSelectedComponentIds] = useState(
    () => new Set(options[0] ? [options[0].componentId] : []),
  );
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    "private",
  );
  const [state, formAction, isPending] = useActionState(
    createIncidentAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const selectedOptions = options.filter((option) =>
    selectedComponentIds.has(option.componentId),
  );
  const canPublish =
    selectedOptions.length > 0 &&
    selectedOptions.every((option) => option.isPublic);
  const affectedComponents = selectedOptions.map((option) => ({
    componentId: option.componentId,
    expectedComponentVersion: option.componentVersion,
    expectedComponentMetadataPublicationVersion:
      option.metadataPublicationVersion,
  }));

  const toggleComponent = (componentId: string) => {
    const nextIds = new Set(selectedComponentIds);
    if (nextIds.has(componentId)) {
      nextIds.delete(componentId);
    } else {
      nextIds.add(componentId);
    }

    const nextOptions = options.filter((option) =>
      nextIds.has(option.componentId),
    );
    if (
      nextOptions.length === 0 ||
      nextOptions.some((option) => !option.isPublic)
    ) {
      setPublicationMode("private");
    }
    setSelectedComponentIds(nextIds);
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
        name="affectedComponents"
        type="hidden"
        value={JSON.stringify(affectedComponents)}
      />
      <fieldset disabled={isPending}>
        <fieldset className="form-section">
          <legend className="form-section-title px-2">
            {t("field.affectedItems")}
          </legend>
          <div className="form-grid form-grid-two">
            {options.map((option) => (
              <label className="form-choice" key={option.componentId}>
                <input
                  checked={selectedComponentIds.has(option.componentId)}
                  className="mt-1"
                  onChange={() => toggleComponent(option.componentId)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium">{option.name}</span>
                  <span className="block text-[var(--muted)]">
                    {option.isPublic
                      ? t("incident.public")
                      : t("incident.ownerOnly")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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
            {canPublish ? (
              <option value="public">{t("option.publishIncident")}</option>
            ) : null}
          </select>
        </label>
        {!canPublish ? (
          <div className="form-prerequisite">
            <p>{t("incident.publicRequirement")}</p>
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
            <span>{t("field.severity")}</span>
            <select className={fieldClassName} name="severity">
              <option value="minor">{common("severity.minor")}</option>
              <option value="major">{common("severity.major")}</option>
              <option value="critical">{common("severity.critical")}</option>
            </select>
          </label>
          <label className="form-field">
            <span>{t("field.initialPhase")}</span>
            <select className={fieldClassName} name="initialPhase">
              <option value="investigating">
                {common("phase.investigating")}
              </option>
              <option value="identified">{common("phase.identified")}</option>
              <option value="monitoring">{common("phase.monitoring")}</option>
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={1000}
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
            aria-labelledby="incident-public-title"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="incident-public-title">
                {t("incident.visitorIncident")}
              </h3>
              <p className="form-section-copy">
                {t("incident.visitorIncidentDescription")}
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
                maxLength={1000}
                name="publicSummary"
              />
            </label>
          </section>
        ) : null}
        <div className="form-actions">
          <button
            className="form-submit"
            disabled={selectedOptions.length === 0}
            type="submit"
          >
            {isPending ? t("action.creating") : t("action.createIncident")}
          </button>
        </div>
      </fieldset>
      {selectedOptions.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {t("incident.selectAffected")}
        </p>
      ) : null}
      <AdminActionFeedback state={state} />
    </form>
  );
}

export function UpdateIncidentForm({
  components,
  idempotencyKey,
  incidentId,
  incidentVersion,
  publicationVersion,
  isPublic,
  phase,
  preparedAt,
}: UpdateIncidentFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const initialOperation: IncidentOperation =
    phase === "resolved" ? "reopen" : "note";
  const [operation, setOperation] =
    useState<IncidentOperation>(initialOperation);
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    isPublic && initialOperation !== "note" ? "public" : "private",
  );
  const [state, formAction, isPending] = useActionState(
    updateIncidentAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const requiresPublic = isPublic && operation !== "note";
  const requiresConfirmation =
    operation === "resolve" || operation === "reopen";
  const componentGuards = components.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.componentVersion,
  }));

  const handleOperationChange = (nextOperation: IncidentOperation) => {
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
      <input name="incidentId" type="hidden" value={incidentId} />
      <input
        name="componentGuards"
        type="hidden"
        value={JSON.stringify(componentGuards)}
      />
      <input
        name="expectedIncidentVersion"
        type="hidden"
        value={incidentVersion}
      />
      <input
        name="expectedPublicationVersion"
        type="hidden"
        value={publicationVersion}
      />
      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.operation")}</span>
            <select
              className={fieldClassName}
              name="operation"
              onChange={(event) =>
                handleOperationChange(event.target.value as IncidentOperation)
              }
              value={operation}
            >
              <option value="note">{t("option.appendNote")}</option>
              {phase === "resolved" ? (
                <option value="reopen">{t("option.reopen")}</option>
              ) : (
                <>
                  <option value="phase_update">
                    {t("option.changePhase")}
                  </option>
                  <option value="resolve">{t("option.resolve")}</option>
                </>
              )}
            </select>
          </label>
          {requiresPublic ? (
            <div className="form-prerequisite">
              <input name="publicationMode" type="hidden" value="public" />
              <p>{t("incident.publicLifecycle")}</p>
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
              <p>{t("incident.ownerOnlyUpdate")}</p>
            </div>
          )}
        </div>
        {operation === "phase_update" ? (
          <label className="form-field">
            <span>{t("field.nextPhase")}</span>
            <select className={fieldClassName} name="to" required>
              {(["investigating", "identified", "monitoring"] as const)
                .filter((candidate) => candidate !== phase)
                .map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {common(`phase.${candidate}`)}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <input name="to" type="hidden" value="" />
        )}
        {operation !== "note" ? (
          <label className="form-field">
            <span>{t("field.reason")}</span>
            <textarea
              className={fieldClassName}
              maxLength={1000}
              name="reason"
              required
            />
          </label>
        ) : (
          <input name="reason" type="hidden" value="" />
        )}
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={1000}
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
            aria-labelledby="incident-update-public"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="incident-update-public">
                {t("incident.visitorUpdate")}
              </h3>
              <p className="form-section-copy">
                {t("incident.visitorUpdateDescription")}
              </p>
            </div>
            <label className="form-field">
              <span>{t("field.publicSummary")}</span>
              <textarea
                className={fieldClassName}
                maxLength={1000}
                name="publicSummary"
              />
            </label>
          </section>
        ) : null}
        {operation === "resolve" ? (
          <ComponentStatusOutcomeEditor
            components={components}
            defaultCondition="available"
            description={t("incident.recoveryDescription")}
            fieldName="componentStatusChoices"
            title={t("incident.recoveryTitle")}
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
            <span>{t("incident.lifecycleConfirmation")}</span>
          </label>
        ) : (
          <input name="confirmation" type="hidden" value="" />
        )}
        <div className="form-actions">
          <button className="form-submit" type="submit">
            {isPending ? t("action.saving") : t("action.saveIncidentUpdate")}
          </button>
        </div>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}

export function CloseIncidentPublicationForm({
  affectedComponents,
  idempotencyKey,
  incidentId,
  incidentVersion,
  publicationVersion,
  lastAction,
}: CloseIncidentPublicationFormProps) {
  const t = useTranslations("AdminForms");
  const initialAction =
    lastAction === "publish"
      ? "withdraw"
      : lastAction === "withdraw"
        ? "redact"
        : "suppress";
  const [action, setAction] = useState<IncidentClosureAction>(initialAction);
  const [confirmedAction, setConfirmedAction] =
    useState<IncidentClosureAction | null>(null);
  const [state, formAction, isPending] = useActionState(
    closeIncidentPublicationAction,
    initialAdminActionState,
  );
  const isConfirmed = confirmedAction === action;

  const selectAction = (nextAction: IncidentClosureAction) => {
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
      <input name="incidentId" type="hidden" value={incidentId} />
      <input
        name="affectedComponents"
        type="hidden"
        value={JSON.stringify(affectedComponents)}
      />
      <input
        name="expectedIncidentVersion"
        type="hidden"
        value={incidentVersion}
      />
      <input
        name="expectedIncidentPublicationVersion"
        type="hidden"
        value={publicationVersion}
      />
      <fieldset className="space-y-3" disabled={isPending}>
        <legend className="sr-only">{t("incident.close")}</legend>
        <label className="block space-y-1 text-sm">
          <span>{t("incident.close")}</span>
          <select
            className={fieldClassName}
            name="action"
            onChange={(event) =>
              selectAction(event.target.value as IncidentClosureAction)
            }
            value={action}
          >
            {lastAction === "publish" ? (
              <option value="withdraw">{t("option.withdrawIncident")}</option>
            ) : null}
            {lastAction !== "redact" ? (
              <option value="redact">{t("option.redactSnapshots")}</option>
            ) : null}
            <option value="suppress">{t("option.emergencySuppression")}</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-[var(--muted)]">
          {t(`incident.${action}Description`)}
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
            {t("incident.closureConfirmation", {
              action: t(`incident.closureAction.${action}`),
            })}
          </span>
        </label>
        <button
          className="border border-[var(--foreground)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConfirmed || isPending}
          type="submit"
        >
          {isPending ? t("action.applying") : t(`incident.${action}Submit`)}
        </button>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
