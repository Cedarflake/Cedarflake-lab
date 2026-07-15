"use client";

import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";

import { reviseIncidentMetadataAction } from "@/app/admin/incident-actions";
import type { IncidentSeverity } from "@/domain/incidents";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";

export interface IncidentMetadataComponentOption {
  componentId: string;
  componentVersion: number;
  isActive: boolean;
  isPublic: boolean;
  metadataPublicationVersion: number;
  name: string;
}

interface IncidentMetadataFormProps {
  components: readonly IncidentMetadataComponentOption[];
  currentAffectedComponents: readonly {
    componentId: string;
    expectedComponentVersion: number;
  }[];
  currentOwner: {
    title: string;
    severity: IncidentSeverity;
    summary: string | null;
    privateNote: string | null;
  };
  currentPublic: {
    title: string;
    severity: IncidentSeverity;
    summary: string | null;
  } | null;
  idempotencyKey: string;
  incidentId: string;
  incidentVersion: number;
  preparedAt: number;
  publicationVersion: number;
}

const fieldClassName = "text-sm";

export function IncidentMetadataForm({
  components,
  currentAffectedComponents,
  currentOwner,
  currentPublic,
  idempotencyKey,
  incidentId,
  incidentVersion,
  preparedAt,
  publicationVersion,
}: IncidentMetadataFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const currentHref =
    "/admin?" +
    new URLSearchParams({
      view: "incident",
      item: incidentId,
      task: "metadata",
    }).toString();
  const [selectedComponentIds, setSelectedComponentIds] = useState(
    () => new Set(currentAffectedComponents.map((guard) => guard.componentId)),
  );
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    "private",
  );
  const [state, formAction, isPending] = useActionState(
    reviseIncidentMetadataAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
  const selectedComponents = useMemo(
    () =>
      components.filter((component) =>
        selectedComponentIds.has(component.componentId),
      ),
    [components, selectedComponentIds],
  );
  const canPublish =
    selectedComponents.length > 0 &&
    selectedComponents.every(
      (component) => component.isActive && component.isPublic,
    );
  const affectedComponents = selectedComponents.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.componentVersion,
    expectedComponentMetadataPublicationVersion:
      component.metadataPublicationVersion,
  }));

  const toggleComponent = (componentId: string) => {
    const next = new Set(selectedComponentIds);
    if (next.has(componentId)) {
      next.delete(componentId);
    } else {
      next.add(componentId);
    }

    const nextComponents = components.filter((component) =>
      next.has(component.componentId),
    );
    if (
      nextComponents.length === 0 ||
      nextComponents.some(
        (component) => !component.isActive || !component.isPublic,
      )
    ) {
      setPublicationMode("private");
    }
    setSelectedComponentIds(next);
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="admin-form"
      onSubmit={captureSubmissionTime}
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="incidentId" type="hidden" value={incidentId} />
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
      <input
        defaultValue={String(preparedAt)}
        name="effectiveAt"
        ref={effectiveAtRef}
        type="hidden"
      />
      <input
        name="currentAffectedComponents"
        type="hidden"
        value={JSON.stringify(currentAffectedComponents)}
      />
      <input
        name="affectedComponents"
        type="hidden"
        value={JSON.stringify(affectedComponents)}
      />

      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.ownerTitle")}</span>
            <input
              className={fieldClassName}
              defaultValue={currentOwner.title}
              maxLength={120}
              name="title"
              required
            />
          </label>
          <label className="form-field">
            <span>{t("field.ownerSeverity")}</span>
            <select
              className={fieldClassName}
              defaultValue={currentOwner.severity}
              name="severity"
            >
              <option value="minor">{common("severity.minor")}</option>
              <option value="major">{common("severity.major")}</option>
              <option value="critical">{common("severity.critical")}</option>
            </select>
          </label>
        </div>

        <fieldset className="form-section">
          <legend className="form-section-title px-2">
            {t("field.affectedItems")}
          </legend>
          <p className="form-section-copy">
            {t("incident.metadataAffectedDescription")}
          </p>
          <div className="form-grid form-grid-two">
            {components.map((component) => {
              const isSelected = selectedComponentIds.has(
                component.componentId,
              );
              const isUnavailable = !component.isActive && !isSelected;

              return (
                <label
                  aria-disabled={isUnavailable || undefined}
                  className="form-choice"
                  key={component.componentId}
                >
                  <input
                    checked={isSelected}
                    className="mt-1"
                    disabled={isUnavailable}
                    onChange={() => toggleComponent(component.componentId)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-medium">{component.name}</span>
                    <span className="block text-[var(--muted)]">
                      {component.isActive
                        ? t("incident.active")
                        : isSelected
                          ? t("incident.archivedRetained")
                          : t("incident.archivedUnavailable")}
                      {component.isPublic
                        ? ` · ${t("incident.public")}`
                        : ` · ${t("incident.ownerOnly")}`}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {selectedComponents.length === 0 ? (
            <p className="text-sm text-[var(--danger)]">
              {t("incident.selectOneAffected")}
            </p>
          ) : null}
        </fieldset>

        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            defaultValue={currentOwner.summary ?? ""}
            maxLength={1000}
            name="ownerSummary"
          />
        </label>
        <label className="form-field">
          <span>{t("field.privateNote")}</span>
          <textarea
            className={fieldClassName}
            defaultValue={currentOwner.privateNote ?? ""}
            maxLength={2000}
            name="privateNote"
          />
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
            <option value="private">{t("option.saveOwnerRevision")}</option>
            {canPublish ? (
              <option value="public">{t("option.publishExactRevision")}</option>
            ) : null}
          </select>
        </label>
        {!canPublish ? (
          <div className="form-prerequisite">
            <p>{t("incident.metadataPublishRequirement")}</p>
          </div>
        ) : null}

        {publicationMode === "public" ? (
          <section
            className="form-section"
            aria-labelledby="metadata-public-title"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="metadata-public-title">
                {t("incident.visitorSnapshot")}
              </h3>
              <p className="form-section-copy">
                {t("incident.visitorSnapshotDescription")}
              </p>
            </div>
            <div className="form-grid form-grid-two">
              <label className="form-field">
                <span>{t("field.publicTitle")}</span>
                <input
                  className={fieldClassName}
                  defaultValue={currentPublic?.title ?? ""}
                  maxLength={120}
                  name="publicTitle"
                  required
                />
              </label>
              <label className="form-field">
                <span>{t("field.publicSeverity")}</span>
                <select
                  className={fieldClassName}
                  defaultValue={
                    currentPublic?.severity ?? currentOwner.severity
                  }
                  name="publicSeverity"
                >
                  <option value="minor">{common("severity.minor")}</option>
                  <option value="major">{common("severity.major")}</option>
                  <option value="critical">
                    {common("severity.critical")}
                  </option>
                </select>
              </label>
            </div>
            <label className="form-field">
              <span>{t("field.publicSummary")}</span>
              <textarea
                className={fieldClassName}
                defaultValue={currentPublic?.summary ?? ""}
                maxLength={1000}
                name="publicSummary"
              />
            </label>
          </section>
        ) : (
          <input
            name="publicSeverity"
            type="hidden"
            value={currentPublic?.severity ?? currentOwner.severity}
          />
        )}

        <div className="form-actions">
          <button
            className="form-submit"
            disabled={selectedComponents.length === 0}
            type="submit"
          >
            {isPending ? t("action.saving") : t("action.saveIncidentDetails")}
          </button>
        </div>
      </fieldset>

      <AdminActionFeedback
        latestHref={currentHref}
        returnTo={currentHref}
        state={state}
      />
    </form>
  );
}
