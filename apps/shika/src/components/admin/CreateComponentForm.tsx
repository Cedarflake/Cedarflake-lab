"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { createComponentAction } from "@/app/admin/actions";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { useStableSubmissionTime } from "@/lib/forms/use-stable-submission-time";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface CreateComponentFormProps {
  idempotencyKey: string;
  preparedAt: number;
  suggestedSortOrder: number;
}

const fieldClassName = "text-sm";

export function CreateComponentForm({
  idempotencyKey,
  preparedAt,
  suggestedSortOrder,
}: CreateComponentFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [state, formAction, isPending] = useActionState(
    createComponentAction,
    initialAdminActionState,
  );
  const { effectiveAtRef, captureSubmissionTime } =
    useStableSubmissionTime(preparedAt);

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
      <fieldset disabled={isPending}>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.ownerName")}</span>
            <input
              className={fieldClassName}
              maxLength={80}
              name="ownerName"
              required
            />
          </label>
          <label className="form-field">
            <span>{t("field.exposure")}</span>
            <select
              className={fieldClassName}
              name="visibility"
              onChange={(event) =>
                setVisibility(event.target.value as "private" | "public")
              }
              value={visibility}
            >
              <option value="private">{t("option.private")}</option>
              <option value="public">
                {t("option.publishStartingReport")}
              </option>
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>{t("field.ownerSummary")}</span>
          <textarea
            className={fieldClassName}
            maxLength={280}
            name="ownerSummary"
          />
        </label>
        <div className="form-grid form-grid-two">
          <label className="form-field">
            <span>{t("field.ownerSortOrder")}</span>
            <input
              className={fieldClassName}
              defaultValue={suggestedSortOrder}
              min={0}
              name="ownerSortOrder"
              required
              type="number"
            />
          </label>
          <label className="form-field">
            <span>{t("field.defaultValidity")}</span>
            <input
              className={fieldClassName}
              min={1}
              name="defaultValidityMinutes"
              type="number"
            />
          </label>
        </div>
        <label className="form-field">
          <span>{t("field.privateComponentNote")}</span>
          <textarea
            className={fieldClassName}
            maxLength={2000}
            name="privateNote"
          />
        </label>
        {visibility === "public" ? (
          <section
            className="form-section"
            aria-labelledby="public-snapshot-title"
          >
            <div className="form-section-header">
              <h3 className="form-section-title" id="public-snapshot-title">
                {t("createComponent.publicSnapshot")}
              </h3>
              <p className="form-section-copy">
                {t("createComponent.publicSnapshotDescription")}
              </p>
            </div>
            <div className="form-grid form-grid-two">
              <label className="form-field">
                <span>{t("field.publicName")}</span>
                <input
                  className={fieldClassName}
                  maxLength={80}
                  name="publicName"
                  required
                />
              </label>
              <label className="form-field">
                <span>{t("field.publicSortOrder")}</span>
                <input
                  className={fieldClassName}
                  defaultValue={suggestedSortOrder}
                  min={0}
                  name="publicSortOrder"
                  required
                  type="number"
                />
              </label>
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
        ) : (
          <div className="form-prerequisite">
            <p>{t("createComponent.privateSnapshotHelp")}</p>
          </div>
        )}
        <section
          className="form-section"
          aria-labelledby="starting-report-title"
        >
          <div className="form-section-header">
            <h3 className="form-section-title" id="starting-report-title">
              {t("createComponent.startingReport")}
            </h3>
            <p className="form-section-copy">
              {t("createComponent.startingReportDescription")}
            </p>
          </div>
          <div className="form-grid form-grid-two">
            <label className="form-field">
              <span>{t("field.condition")}</span>
              <select
                className={fieldClassName}
                name="initialCondition"
                required={visibility === "public"}
              >
                <option value="">{t("option.noStartingReport")}</option>
                <option value="available">
                  {common("condition.available")}
                </option>
                <option value="limited">{common("condition.limited")}</option>
                <option value="degraded">{common("condition.degraded")}</option>
                <option value="unavailable">
                  {common("condition.unavailable")}
                </option>
              </select>
            </label>
            <label className="form-field">
              <span>{t("field.expiresMinutes")}</span>
              <input
                className={fieldClassName}
                min={1}
                name="initialExpiryMinutes"
                type="number"
              />
            </label>
          </div>
          <label className="form-field">
            <span>{t("field.ownerStatusSummary")}</span>
            <textarea
              className={fieldClassName}
              maxLength={280}
              name="initialOwnerSummary"
            />
          </label>
          {visibility === "public" ? (
            <label className="form-field">
              <span>{t("field.publicStatusSummary")}</span>
              <textarea
                className={fieldClassName}
                maxLength={280}
                name="initialPublicSummary"
              />
            </label>
          ) : null}
          <label className="form-field">
            <span>{t("field.privateStatusNote")}</span>
            <textarea
              className={fieldClassName}
              maxLength={2000}
              name="initialPrivateNote"
            />
          </label>
        </section>
        {visibility === "public" ? (
          <label className="form-choice">
            <input
              className="mt-1"
              name="confirmation"
              required
              type="checkbox"
              value="confirmed"
            />
            <span>{t("createComponent.confirmation")}</span>
          </label>
        ) : (
          <input name="confirmation" type="hidden" value="" />
        )}
        <div className="form-actions">
          <button className="form-submit" type="submit">
            {isPending ? t("action.creating") : t("action.createComponent")}
          </button>
        </div>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
