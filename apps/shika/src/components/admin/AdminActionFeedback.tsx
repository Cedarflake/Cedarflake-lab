"use client";

import { useTranslations } from "next-intl";

import type { AdminActionState } from "@/lib/forms/admin-action-state";

interface AdminActionFeedbackProps {
  latestHref?: string;
  returnTo?: string;
  state: AdminActionState;
}

export function AdminActionFeedback({
  latestHref = "/admin",
  returnTo = "/admin",
  state,
}: AdminActionFeedbackProps) {
  const t = useTranslations("AdminFeedback");
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="text-sm leading-6 text-[var(--muted)]"
    >
      {state.kind === "error" ? <p>{t("error")}</p> : null}
      {state.kind === "reauth_required" ? (
        <p>
          {t("reauth")}{" "}
          <a
            className="underline underline-offset-4"
            href={loginHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("reauthLink")}
          </a>
          {t("reauthSuffix")}
        </p>
      ) : null}
      {state.kind === "conflict" ? (
        <p>
          {t("conflict")} {t("conflictWarning")}{" "}
          <a
            className="underline underline-offset-4"
            href={latestHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("conflictLink")}
          </a>{" "}
          {t("conflictSuffix")}
        </p>
      ) : null}
    </div>
  );
}
