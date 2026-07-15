"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { saveSiteProfileAction } from "@/app/admin/site-profile-actions";
import type { OwnerSiteProfileDto } from "@/lib/data/owner-site-profile-repository";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import {
  createSiteProfileAdminHref,
  type SaveSiteProfileFormPayload,
} from "@/lib/forms/site-profile";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface EditSiteProfileFormProps {
  idempotencyKey: string;
  profile: OwnerSiteProfileDto | null;
}

interface SiteProfileDraft {
  hasPublicDraft: boolean;
  ownerSummary: string;
  ownerTitle: string;
  privateNote: string;
  publicSummary: string;
  publicTitle: string;
}

const fieldClassName =
  "min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-transparent px-3 text-sm";
const textAreaClassName = `${fieldClassName} min-h-24 py-3`;

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function EditSiteProfileForm({
  idempotencyKey,
  profile,
}: EditSiteProfileFormProps) {
  const t = useTranslations("AdminForms");
  const revision = profile?.revision;
  const [draft, setDraft] = useState<SiteProfileDraft>({
    hasPublicDraft: revision?.publicDraft !== null && revision !== undefined,
    ownerSummary: revision?.ownerSummary ?? "",
    ownerTitle: revision?.ownerTitle ?? "",
    privateNote: revision?.privateNote ?? "",
    publicSummary: revision?.publicDraft?.summary ?? "",
    publicTitle: revision?.publicDraft?.title ?? revision?.ownerTitle ?? "",
  });
  const [state, formAction, isPending] = useActionState(
    saveSiteProfileAction,
    initialAdminActionState,
  );
  const currentHref = createSiteProfileAdminHref("edit");
  const payload: SaveSiteProfileFormPayload = {
    idempotencyKey,
    expectedSiteProfileVersion: profile?.version ?? 0,
    ownerTitle: draft.ownerTitle,
    ownerSummary: optionalText(draft.ownerSummary),
    publicDraft: draft.hasPublicDraft
      ? {
          title: draft.publicTitle,
          summary: optionalText(draft.publicSummary),
        }
      : null,
    timezone: "Asia/Shanghai",
    privateNote: optionalText(draft.privateNote),
  };

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-6">
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      <fieldset className="space-y-6" disabled={isPending}>
        <section className="space-y-4">
          <div>
            <p className="eyebrow">{t("siteProfile.ownerRecord")}</p>
            <h3 className="mt-2 text-lg font-semibold">
              {t("siteProfile.privateSource")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-strong)]">
              {t("siteProfile.privateSourceDescription")}
            </p>
          </div>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("field.ownerTitle")}</span>
            <input
              autoComplete="off"
              className={fieldClassName}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  ownerTitle: event.target.value,
                }))
              }
              required
              value={draft.ownerTitle}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("field.ownerSummary")}</span>
            <textarea
              className={textAreaClassName}
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
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("field.privateNote")}</span>
            <textarea
              className={textAreaClassName}
              maxLength={2_000}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  privateNote: event.target.value,
                }))
              }
              value={draft.privateNote}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("field.timezone")}</span>
            <input
              className={`${fieldClassName} cursor-not-allowed bg-[var(--surface)] text-[var(--muted-strong)]`}
              readOnly
              value="Asia/Shanghai"
            />
            <span className="block text-xs leading-5 text-[var(--muted)]">
              {t("siteProfile.timezoneDescription")}
            </span>
          </label>
        </section>

        <section className="space-y-4 border-t border-[var(--border)] pt-6">
          <div>
            <p className="eyebrow">{t("siteProfile.candidateEyebrow")}</p>
            <h3 className="mt-2 text-lg font-semibold">
              {t("siteProfile.publicDraft")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-strong)]">
              {t("siteProfile.publicDraftDescription")}
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm leading-6">
            <input
              checked={draft.hasPublicDraft}
              className="mt-1"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  hasPublicDraft: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span>{t("siteProfile.keepDraft")}</span>
          </label>
          {draft.hasPublicDraft ? (
            <div className="space-y-4">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{t("field.publicTitle")}</span>
                <input
                  className={fieldClassName}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      publicTitle: event.target.value,
                    }))
                  }
                  required
                  value={draft.publicTitle}
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{t("field.publicSummary")}</span>
                <textarea
                  className={textAreaClassName}
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
            </div>
          ) : null}
        </section>

        <button
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-45"
          type="submit"
        >
          {isPending ? t("action.saving") : t("action.saveProfile")}
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
