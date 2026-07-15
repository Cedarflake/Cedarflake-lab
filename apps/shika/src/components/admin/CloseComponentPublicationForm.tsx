"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { closeComponentPublicationAction } from "@/app/admin/component-actions";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import type {
  ComponentPrivacyActionReview,
  ComponentPrivacyParentGuard,
  OwnerComponentPrivacyReviewDto,
} from "@/lib/data/owner-component-privacy-repository";

import { AdminActionFeedback } from "./AdminActionFeedback";

type ClosureAction = "withdraw" | "redact" | "suppress";

export interface ComponentPrivacyParentLabel {
  meta: string;
  title: string;
}

interface CloseComponentPublicationFormProps {
  idempotencyKey: string;
  parentLabels: Readonly<Record<string, ComponentPrivacyParentLabel>>;
  review: OwnerComponentPrivacyReviewDto;
}

function parentKey(parent: ComponentPrivacyParentGuard) {
  return parent.kind === "incident"
    ? `incident:${parent.incidentId}`
    : `maintenance:${parent.maintenanceWindowId}`;
}

function defaultAction(review: OwnerComponentPrivacyReviewDto): ClosureAction {
  if (review.withdraw.isAvailable) return "withdraw";
  if (review.redact.isAvailable) return "redact";
  return "suppress";
}

function commandRelatedComponents(plan: ComponentPrivacyActionReview) {
  return plan.relatedComponents.map((component) => ({
    componentId: component.componentId,
    expectedComponentVersion: component.expectedComponentVersion,
    expectedComponentMetadataPublicationVersion:
      component.expectedComponentMetadataPublicationVersion,
  }));
}

export function CloseComponentPublicationForm({
  idempotencyKey,
  parentLabels,
  review,
}: CloseComponentPublicationFormProps) {
  const t = useTranslations("AdminForms");
  const [action, setAction] = useState<ClosureAction>(() =>
    defaultAction(review),
  );
  const [confirmationName, setConfirmationName] = useState("");
  const [externalCopiesAcknowledged, setExternalCopiesAcknowledged] =
    useState(false);
  const [state, formAction, isPending] = useActionState(
    closeComponentPublicationAction,
    initialAdminActionState,
  );
  const plans = {
    withdraw: review.withdraw,
    redact: review.redact,
    suppress: review.suppress,
  };
  const plan = plans[action];
  const requiresName = action === "redact" || action === "suppress";
  const hasAvailableAction = Object.values(plans).some(
    (candidate) => candidate.isAvailable,
  );
  const canSubmit =
    plan.isAvailable &&
    externalCopiesAcknowledged &&
    (!requiresName || confirmationName === review.target.ownerName) &&
    !isPending;
  const currentHref = `/admin?view=component&item=${encodeURIComponent(review.target.componentId)}&task=privacy`;
  const payload = {
    idempotencyKey,
    componentId: review.target.componentId,
    expectedComponentVersion: review.target.componentVersion,
    expectedMetadataPublicationVersion:
      review.target.metadataPublicationVersion,
    expectedStatusPublicationVersion: review.target.statusPublicationVersion,
    action,
    dependentParents: plan.isAvailable ? plan.dependentParents : [],
    relatedComponents: plan.isAvailable ? commandRelatedComponents(plan) : [],
    externalCopiesAcknowledged: externalCopiesAcknowledged ? "confirmed" : "",
    ownerName: review.target.ownerName,
    confirmationName: requiresName ? confirmationName : null,
  };
  const dependantCount = plan.dependentParents.length;
  const buttonLabel =
    action === "withdraw"
      ? t("componentPrivacy.withdrawButton")
      : action === "redact"
        ? t("componentPrivacy.redactButton", { count: dependantCount })
        : t("componentPrivacy.suppressButton", { count: dependantCount });

  const selectAction = (nextAction: ClosureAction) => {
    setAction(nextAction);
    setConfirmationName("");
    setExternalCopiesAcknowledged(false);
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="sr-only">{t("componentPrivacy.choose")}</legend>
        <div className="grid gap-3 lg:grid-cols-3">
          {(
            Object.entries(plans) as Array<
              [ClosureAction, ComponentPrivacyActionReview]
            >
          ).map(([candidateAction, candidate]) => (
            <label
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-colors has-[:checked]:border-[var(--foreground)] has-[:checked]:bg-[var(--accent-soft)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
              key={candidateAction}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <input
                  checked={action === candidateAction}
                  disabled={!candidate.isAvailable || isPending}
                  name="component-privacy-action"
                  onChange={() => selectAction(candidateAction)}
                  type="radio"
                  value={candidateAction}
                />
                {t(`componentPrivacy.${candidateAction}Label`)}
              </span>
              <span className="mt-2 block text-xs leading-5 text-[var(--muted-strong)]">
                {candidate.unavailableReason
                  ? t(
                      `componentPrivacy.unavailable.${candidate.unavailableReason}`,
                    )
                  : t(`componentPrivacy.${candidateAction}Description`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
        <p className="eyebrow">{t("componentPrivacy.reviewedImpact")}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--muted)]">
              {t("componentPrivacy.metadataSnapshots")}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {plan.metadataSourceCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">
              {t("componentPrivacy.statusSnapshots")}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {plan.statusSourceCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">
              {t("componentPrivacy.dependantRecords")}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {dependantCount}
            </dd>
          </div>
        </dl>

        {plan.dependentParents.length > 0 ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">
              {t("componentPrivacy.closedAtomically")}
            </h3>
            <ul className="mt-3 grid gap-2">
              {plan.dependentParents.map((parent) => {
                const key = parentKey(parent);
                const label = parentLabels[key];
                return (
                  <li
                    className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
                    key={key}
                  >
                    <span className="min-w-0 font-medium">
                      {label?.title ?? key}
                    </span>
                    <span className="shrink-0 text-xs capitalize text-[var(--muted)]">
                      {label?.meta ??
                        (parent.kind === "incident"
                          ? t("componentLifecycle.incident")
                          : t("componentLifecycle.maintenance"))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {plan.relatedComponents.length > 0 ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">
              {t("componentPrivacy.relatedComponents")}
            </h3>
            <ul className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
              {plan.relatedComponents.map((component) => (
                <li key={component.componentId}>
                  {t("componentPrivacy.relatedComponentMeta", {
                    name: component.ownerName,
                    count: component.parentCount,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {hasAvailableAction ? (
        <form action={formAction} aria-busy={isPending} className="space-y-4">
          <input name="payload" type="hidden" value={JSON.stringify(payload)} />

          <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm leading-6">
            <input
              checked={externalCopiesAcknowledged}
              className="mt-1"
              disabled={isPending}
              onChange={(event) =>
                setExternalCopiesAcknowledged(event.target.checked)
              }
              type="checkbox"
            />
            <span>{t("componentPrivacy.externalCopies")}</span>
          </label>

          {requiresName ? (
            <label className="block space-y-2 text-sm">
              <span className="font-semibold">
                {t("componentPrivacy.typeToConfirm", {
                  name: review.target.ownerName,
                })}
              </span>
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-transparent px-3"
                disabled={isPending}
                onChange={(event) => setConfirmationName(event.target.value)}
                spellCheck={false}
                value={confirmationName}
              />
            </label>
          ) : null}

          <button
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit}
            type="submit"
          >
            {isPending ? t("componentPrivacy.applying") : buttonLabel}
          </button>
          <AdminActionFeedback
            latestHref={currentHref}
            returnTo={currentHref}
            state={state}
          />
        </form>
      ) : (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm leading-6 text-[var(--muted-strong)]">
          {t("componentPrivacy.terminal")}
        </p>
      )}
    </div>
  );
}
