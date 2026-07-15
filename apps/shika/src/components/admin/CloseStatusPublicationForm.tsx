"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { closeStatusPublicationAction } from "@/app/admin/actions";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface CloseStatusPublicationFormProps {
  idempotencyKey: string;
  componentId: string;
  componentVersion: number;
  statusTransitionId: string;
  statusPublicationVersion: number;
}

type ClosureAction = "withdraw" | "redact" | "suppress";

export function CloseStatusPublicationForm({
  idempotencyKey,
  componentId,
  componentVersion,
  statusTransitionId,
  statusPublicationVersion,
}: CloseStatusPublicationFormProps) {
  const t = useTranslations("AdminForms");
  const [action, setAction] = useState<ClosureAction>("withdraw");
  const [confirmedAction, setConfirmedAction] = useState<ClosureAction | null>(
    null,
  );
  const [state, formAction, isPending] = useActionState(
    closeStatusPublicationAction,
    initialAdminActionState,
  );
  const isConfirmed = confirmedAction === action;

  const selectAction = (nextAction: ClosureAction) => {
    setAction(nextAction);
    setConfirmedAction(null);
  };

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="mt-3 space-y-3 border-l border-[var(--border)] pl-4"
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="componentId" type="hidden" value={componentId} />
      <input
        name="expectedComponentVersion"
        type="hidden"
        value={componentVersion}
      />
      <input
        name="statusTransitionId"
        type="hidden"
        value={statusTransitionId}
      />
      <input
        name="expectedStatusPublicationVersion"
        type="hidden"
        value={statusPublicationVersion}
      />
      <fieldset className="space-y-3" disabled={isPending}>
        <legend className="sr-only">{t("statusClosure.close")}</legend>
        <label className="block space-y-1 text-sm">
          <span>{t("statusClosure.close")}</span>
          <select
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            name="action"
            onChange={(event) =>
              selectAction(event.target.value as ClosureAction)
            }
            value={action}
          >
            <option value="withdraw">{t("statusClosure.withdrawLabel")}</option>
            <option value="redact">{t("statusClosure.redactLabel")}</option>
            <option value="suppress">{t("statusClosure.suppressLabel")}</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-[var(--muted)]">
          {t(`statusClosure.${action}Description`)}
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
            {t("statusClosure.confirmation", {
              action: t(`statusClosure.${action}Label`),
            })}
          </span>
        </label>
        <button
          className="border border-[var(--foreground)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConfirmed || isPending}
          type="submit"
        >
          {isPending
            ? t("action.applying")
            : t(`statusClosure.${action}Submit`)}
        </button>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
