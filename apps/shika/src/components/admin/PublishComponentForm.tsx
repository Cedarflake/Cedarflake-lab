"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";

import { publishComponentAction } from "@/app/admin/component-actions";
import { statusConditions, type StatusCondition } from "@/domain/status";
import type { PublicComponentStatusDto } from "@/lib/data/public-status-repository";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface PublishComponentFormProps {
  componentId: string;
  componentVersion: number;
  currentVisitorSnapshot: PublicComponentStatusDto | null;
  defaultValidityMs: number | null;
  idempotencyKey: string;
  metadataPublicationVersion: number;
  preparedAt: number;
  publicDraft: {
    name: string;
    summary: string | null;
    sortOrder: number;
  };
  statusPublicationVersion: number;
  suggestedCondition?: StatusCondition;
}

interface StartingReportDraft {
  condition: StatusCondition;
  expiryMinutes: string;
  ownerSummary: string;
  publicSummary: string;
  privateNote: string;
}

const fieldClassName =
  "w-full border border-[var(--border)] bg-transparent px-3 py-2 text-sm";

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function PublishComponentForm({
  componentId,
  componentVersion,
  currentVisitorSnapshot,
  defaultValidityMs,
  idempotencyKey,
  metadataPublicationVersion,
  preparedAt,
  publicDraft,
  statusPublicationVersion,
  suggestedCondition = "available",
}: PublishComponentFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [draft, setDraft] = useState<StartingReportDraft>({
    condition: suggestedCondition,
    expiryMinutes:
      defaultValidityMs === null ? "" : String(defaultValidityMs / 60_000),
    ownerSummary: "",
    publicSummary: "",
    privateNote: "",
  });
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [state, formAction, isPending] = useActionState(
    publishComponentAction,
    initialAdminActionState,
  );
  const payloadRef = useRef<HTMLInputElement>(null);
  const submittedAtRef = useRef<number | null>(null);

  const createPayload = (effectiveAt: number) => ({
    idempotencyKey,
    componentId,
    expectedComponentVersion: componentVersion,
    expectedMetadataPublicationVersion: metadataPublicationVersion,
    expectedStatusPublicationVersion: statusPublicationVersion,
    startingReport: {
      condition: draft.condition,
      effectiveAt,
      validUntil:
        draft.expiryMinutes === ""
          ? null
          : effectiveAt + Math.round(Number(draft.expiryMinutes) * 60_000),
      ownerSummary: optionalText(draft.ownerSummary),
      publicSummary: optionalText(draft.publicSummary),
      privateNote: optionalText(draft.privateNote),
    },
    confirmation: isConfirmed ? "confirmed" : "",
  });

  const captureSubmissionPayload = () => {
    submittedAtRef.current ??= Date.now();
    if (payloadRef.current) {
      payloadRef.current.value = JSON.stringify(
        createPayload(submittedAtRef.current),
      );
    }
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-5"
      onSubmit={captureSubmissionPayload}
    >
      <input
        name="payload"
        ref={payloadRef}
        type="hidden"
        value={JSON.stringify(createPayload(preparedAt))}
      />
      <fieldset className="space-y-5" disabled={isPending}>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="border border-[var(--border)] p-4 text-sm">
            <h3 className="font-semibold">
              {t("publishComponent.selectedDraft")}
            </h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <dt className="text-[var(--muted)]">{t("field.name")}</dt>
                <dd className="mt-1 font-medium">{publicDraft.name}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t("field.order")}</dt>
                <dd className="mt-1 font-medium">{publicDraft.sortOrder}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t("field.summary")}</dt>
                <dd className="mt-1 font-medium">
                  {publicDraft.summary ?? t("publishComponent.noPublicSummary")}
                </dd>
              </div>
            </dl>
          </div>
          <div className="border border-[var(--border)] p-4 text-sm">
            <h3 className="font-semibold">
              {t("publishComponent.visitorSnapshot")}
            </h3>
            {currentVisitorSnapshot ? (
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="text-[var(--muted)]">{t("field.name")}</dt>
                  <dd className="mt-1 font-medium">
                    {currentVisitorSnapshot.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">
                    {t("field.condition")}
                  </dt>
                  <dd className="mt-1 font-medium capitalize">
                    {common(
                      `condition.${currentVisitorSnapshot.status.condition}`,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">
                    {t("field.statusSummary")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {currentVisitorSnapshot.statusSummary ??
                      t("publishComponent.noPublicSummary")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {t("publishComponent.privateNow")}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 border-t border-[var(--border)] pt-5">
          <div>
            <h3 className="text-sm font-semibold">
              {t("publishComponent.startingReport")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {t("publishComponent.startingReportDescription")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t("field.condition")}</span>
              <select
                className={fieldClassName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    condition: event.target.value as StatusCondition,
                  }))
                }
                value={draft.condition}
              >
                {statusConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {common(`condition.${condition}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t("field.expiresMinutes")}</span>
              <input
                className={fieldClassName}
                min={0.000_001}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expiryMinutes: event.target.value,
                  }))
                }
                placeholder={t("option.noExpiry")}
                step="any"
                type="number"
                value={draft.expiryMinutes}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span>{t("field.ownerSummary")}</span>
            <textarea
              className={fieldClassName}
              maxLength={280}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  ownerSummary: event.target.value,
                }))
              }
              value={draft.ownerSummary}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("field.publicSummary")}</span>
            <textarea
              className={fieldClassName}
              maxLength={280}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  publicSummary: event.target.value,
                }))
              }
              value={draft.publicSummary}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("field.privateNote")}</span>
            <textarea
              className={fieldClassName}
              maxLength={2000}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  privateNote: event.target.value,
                }))
              }
              value={draft.privateNote}
            />
          </label>
        </section>

        <label className="flex items-start gap-3 border border-[var(--border)] p-4 text-sm">
          <input
            checked={isConfirmed}
            className="mt-1"
            onChange={(event) => setIsConfirmed(event.target.checked)}
            required
            type="checkbox"
          />
          <span>{t("publishComponent.confirmation")}</span>
        </label>
        <button
          className="border border-[var(--foreground)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConfirmed}
          type="submit"
        >
          {isPending ? t("action.publishing") : t("action.publishComponent")}
        </button>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
