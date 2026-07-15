"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { reportStatusAction } from "@/app/admin/actions";
import type { AdminComponentOption } from "@/lib/forms/admin-component-option";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface ReportStatusFormProps {
  idempotencyKey: string;
  options: readonly AdminComponentOption[];
  preparedAt: number;
}

const fieldClassName = "text-sm";

export function ReportStatusForm({
  idempotencyKey,
  options,
  preparedAt,
}: ReportStatusFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [componentId, setComponentId] = useState(options[0]?.componentId ?? "");
  const [publicationMode, setPublicationMode] = useState<"private" | "public">(
    "private",
  );
  const [state, formAction, isPending] = useActionState(
    reportStatusAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);
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
      <input
        name="expectedStatusPublicationVersion"
        type="hidden"
        value={selected?.statusPublicationVersion ?? 0}
      />
      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.component")}</span>
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
            <span>{t("field.condition")}</span>
            <select className={fieldClassName} name="condition" required>
              <option value="available">{common("condition.available")}</option>
              <option value="limited">{common("condition.limited")}</option>
              <option value="degraded">{common("condition.degraded")}</option>
              <option value="unavailable">
                {common("condition.unavailable")}
              </option>
            </select>
          </label>
        </div>
        <div className="form-grid form-grid-two">
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
                <option value="public">{t("option.publishUpdate")}</option>
              ) : null}
            </select>
          </label>
          <label className="form-field">
            <span>{t("field.expiresMinutes")}</span>
            <input
              className={fieldClassName}
              min={1}
              name="expiryMinutes"
              type="number"
            />
          </label>
        </div>
        {!selected?.isPublic ? (
          <div className="form-prerequisite">
            <p>{t("reportStatus.privateComponent")}</p>
            {selected ? (
              <Link href={`/admin?view=component&item=${selected.componentId}`}>
                {t("reportStatus.openWorkspace")}
              </Link>
            ) : null}
          </div>
        ) : null}
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={280}
            name="ownerSummary"
          />
        </label>
        {publicationMode === "public" ? (
          <section
            className="form-section"
            aria-labelledby="status-public-title"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="status-public-title">
                {t("reportStatus.visitorUpdate")}
              </h3>
              <p className="form-section-copy">
                {t("reportStatus.visitorUpdateDescription")}
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
        <label className="form-field">
          <span>{t("field.privateNote")}</span>
          <textarea
            className={fieldClassName}
            maxLength={2000}
            name="privateNote"
          />
        </label>
        <div className="form-actions">
          <button className="form-submit" type="submit">
            {isPending ? t("action.saving") : t("action.saveStatus")}
          </button>
        </div>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
