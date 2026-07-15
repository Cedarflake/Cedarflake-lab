"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { changeComponentLifecycleAction } from "@/app/admin/component-actions";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import type { ComponentArchiveBlocker } from "@/lib/forms/component-archive-blockers";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface ComponentLifecycleFormProps {
  blockers: readonly ComponentArchiveBlocker[];
  componentId: string;
  componentVersion: number;
  hasCurrentPublicStatus: boolean;
  idempotencyKey: string;
  isComponentPublic: boolean;
  lifecycle: "active" | "archived";
  metadataPublicationVersion: number;
  statusPublicationVersion: number;
}

export function ComponentLifecycleForm({
  blockers,
  componentId,
  componentVersion,
  hasCurrentPublicStatus,
  idempotencyKey,
  isComponentPublic,
  lifecycle,
  metadataPublicationVersion,
  statusPublicationVersion,
}: ComponentLifecycleFormProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [state, formAction, isPending] = useActionState(
    changeComponentLifecycleAction,
    initialAdminActionState,
  );
  const operation = lifecycle === "active" ? "archive" : "unarchive";
  const hasBlockers = operation === "archive" && blockers.length > 0;
  const payload = {
    idempotencyKey,
    componentId,
    expectedComponentVersion: componentVersion,
    expectedMetadataPublicationVersion: metadataPublicationVersion,
    expectedStatusPublicationVersion: statusPublicationVersion,
    operation,
    confirmation: operation === "archive" && isConfirmed ? "confirmed" : null,
  };

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-4">
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      {operation === "archive" ? (
        <>
          <div>
            <h3 className="text-sm font-semibold">
              {t("componentLifecycle.archiveTitle")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {t("componentLifecycle.archiveDescription")}
            </p>
          </div>
          {isComponentPublic || hasCurrentPublicStatus ? (
            <p className="border border-[var(--border)] p-4 text-xs leading-5">
              {t("componentLifecycle.visitorImpactCurrent", {
                status: hasCurrentPublicStatus ? "true" : "false",
              })}
            </p>
          ) : (
            <p className="border border-[var(--border)] p-4 text-xs leading-5 text-[var(--muted)]">
              {t("componentLifecycle.visitorImpactNone")}
            </p>
          )}
          {hasBlockers ? (
            <section
              aria-labelledby={`archive-blockers-${componentId}`}
              className="border border-[var(--border)] p-4"
            >
              <h4
                className="text-sm font-semibold"
                id={`archive-blockers-${componentId}`}
              >
                {t("componentLifecycle.blockersTitle")}
              </h4>
              <ul className="mt-3 space-y-2 text-xs">
                {blockers.map((blocker) => (
                  <li key={`${blocker.kind}:${blocker.sourceId}`}>
                    <span className="font-semibold capitalize">
                      {blocker.kind === "incident"
                        ? t("componentLifecycle.incident")
                        : t("componentLifecycle.maintenance")}
                    </span>
                    {": "}
                    {blocker.title} ({common(`phase.${blocker.phase}`)})
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                {t("componentLifecycle.blockersDescription")}
              </p>
            </section>
          ) : (
            <label className="flex items-start gap-3 border border-[var(--border)] p-4 text-sm">
              <input
                checked={isConfirmed}
                className="mt-1"
                disabled={isPending}
                onChange={(event) => setIsConfirmed(event.target.checked)}
                required
                type="checkbox"
              />
              <span>{t("componentLifecycle.confirmation")}</span>
            </label>
          )}
        </>
      ) : (
        <div>
          <h3 className="text-sm font-semibold">
            {t("componentLifecycle.restoreTitle")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {t("componentLifecycle.restoreDescription")}
          </p>
        </div>
      )}
      <button
        className="border border-[var(--foreground)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          isPending || hasBlockers || (operation === "archive" && !isConfirmed)
        }
        type="submit"
      >
        {isPending
          ? t("action.applying")
          : operation === "archive"
            ? t("componentLifecycle.archiveTitle")
            : t("componentLifecycle.restorePrivate")}
      </button>
      <AdminActionFeedback state={state} />
    </form>
  );
}
