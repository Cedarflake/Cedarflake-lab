"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { closeSiteProfilePublicationAction } from "@/app/admin/site-profile-actions";
import type { OwnerSiteProfileDto } from "@/lib/data/owner-site-profile-repository";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import {
  createSiteProfileAdminHref,
  selectSiteProfilePrivacyAction,
  type SiteProfilePrivacyAction,
} from "@/lib/forms/site-profile";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface CloseSiteProfilePublicationFormProps {
  idempotencyKey: string;
  profile: OwnerSiteProfileDto | null;
}

function availableActions(
  profile: OwnerSiteProfileDto | null,
): readonly SiteProfilePrivacyAction[] {
  if (!profile || profile.publication.version === 0) return [];

  switch (profile.publication.lastAction) {
    case "publish":
      return ["withdraw", "redact", "suppress"];
    case "withdraw":
      return ["redact", "suppress"];
    case "redact":
      return ["suppress"];
    case "suppress":
    case null:
      return [];
  }
}

export function CloseSiteProfilePublicationForm({
  idempotencyKey,
  profile,
}: CloseSiteProfilePublicationFormProps) {
  const t = useTranslations("AdminForms");
  const actions = availableActions(profile);
  const [action, setAction] = useState<SiteProfilePrivacyAction>(
    actions[0] ?? "withdraw",
  );
  const [confirmationKey, setConfirmationKey] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    closeSiteProfilePublicationAction,
    initialAdminActionState,
  );
  const currentHref = createSiteProfileAdminHref("privacy");

  if (!profile || actions.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-sm leading-6 text-[var(--muted-strong)]">
        {profile?.publication.lastAction === "suppress"
          ? t("siteProfile.terminalSuppression")
          : t("siteProfile.noHistory")}
      </p>
    );
  }

  const activeAction = actions.includes(action) ? action : actions[0];
  if (!activeAction) return null;

  const currentConfirmationKey = `${profile.publication.version}:${activeAction}`;
  const isConfirmed = confirmationKey === currentConfirmationKey;
  const payload = {
    idempotencyKey,
    expectedSiteProfileVersion: profile.version,
    expectedPublicationVersion: profile.publication.version,
    action: activeAction,
    confirmation: isConfirmed ? "confirmed" : "",
  };
  const selectAction = (nextAction: SiteProfilePrivacyAction) => {
    const selection = selectSiteProfilePrivacyAction(nextAction);
    setAction(selection.action);
    setConfirmationKey(selection.isConfirmed ? currentConfirmationKey : null);
  };

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-6">
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      <fieldset className="space-y-6" disabled={isPending}>
        <legend className="sr-only">{t("siteProfile.closeLegend")}</legend>
        <fieldset>
          <legend className="sr-only">{t("siteProfile.chooseClosure")}</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {actions.map((candidateAction) => (
              <label
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 transition-colors has-[:checked]:border-[var(--foreground)] has-[:checked]:bg-[var(--accent-soft)]"
                key={candidateAction}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    checked={activeAction === candidateAction}
                    name="site-profile-privacy-action"
                    onChange={() => selectAction(candidateAction)}
                    type="radio"
                    value={candidateAction}
                  />
                  {t(`siteProfile.action.${candidateAction}Label`)}
                </span>
                <span className="mt-2 block text-xs leading-5 text-[var(--muted-strong)]">
                  {t(`siteProfile.action.${candidateAction}Description`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="eyebrow">{t("siteProfile.currentPublicState")}</p>
          {profile.publication.currentSource ? (
            <>
              <h3 className="mt-3 text-xl font-semibold">
                {profile.publication.currentSource.snapshot.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                {profile.publication.currentSource.snapshot.summary ??
                  t("siteProfile.noPublicSummary")}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
              {t("siteProfile.noVisibleProfile")}
            </p>
          )}
        </section>

        <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm leading-6">
          <input
            checked={isConfirmed}
            className="mt-1"
            onChange={(event) =>
              setConfirmationKey(
                event.target.checked ? currentConfirmationKey : null,
              )
            }
            required
            type="checkbox"
          />
          <span>
            {t("siteProfile.closureConfirmation", {
              action: t(`siteProfile.action.${activeAction}Label`),
            })}
          </span>
        </label>

        <button
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!isConfirmed || isPending}
          type="submit"
        >
          {isPending
            ? t("action.applying")
            : t(`siteProfile.action.${activeAction}Submit`)}
        </button>
      </fieldset>
      <AdminActionFeedback
        latestHref={currentHref}
        returnTo={currentHref}
        state={state}
      />
    </form>
  );
}
