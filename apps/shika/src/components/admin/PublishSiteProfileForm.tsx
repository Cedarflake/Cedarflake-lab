"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { publishSiteProfileAction } from "@/app/admin/site-profile-actions";
import type { OwnerSiteProfileDto } from "@/lib/data/owner-site-profile-repository";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import { createSiteProfileAdminHref } from "@/lib/forms/site-profile";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface PublishSiteProfileFormProps {
  idempotencyKey: string;
  profile: OwnerSiteProfileDto | null;
}

export function PublishSiteProfileForm({
  idempotencyKey,
  profile,
}: PublishSiteProfileFormProps) {
  const t = useTranslations("AdminForms");
  const [confirmedRevisionId, setConfirmedRevisionId] = useState<string | null>(
    null,
  );
  const [state, formAction, isPending] = useActionState(
    publishSiteProfileAction,
    initialAdminActionState,
  );
  const currentHref = createSiteProfileAdminHref("publish");
  const editHref = createSiteProfileAdminHref("edit");
  const publicDraft = profile?.revision.publicDraft;
  const currentSource = profile?.publication.currentSource;
  const isCurrentRevision = Boolean(
    profile &&
    currentSource &&
    currentSource.sourceId === profile.revision.revisionId &&
    currentSource.sourceRevision === profile.revision.siteProfileVersion,
  );
  const isConfirmed = confirmedRevisionId === profile?.revision.revisionId;

  if (!profile || !publicDraft) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-sm leading-6 text-[var(--muted-strong)]">
          {t("siteProfile.createDraftFirst")}
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] px-5 text-sm font-semibold no-underline"
          href={editHref}
        >
          {t("siteProfile.openEditor")}
        </Link>
      </div>
    );
  }

  if (isCurrentRevision) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-5 text-sm leading-6 text-[var(--accent-strong)]">
          {t("siteProfile.alreadyCurrent")}
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] px-5 text-sm font-semibold no-underline"
          href={editHref}
        >
          {t("siteProfile.editProfile")}
        </Link>
      </div>
    );
  }

  const payload = {
    idempotencyKey,
    expectedSiteProfileVersion: profile.version,
    expectedPublicationVersion: profile.publication.version,
    revisionId: profile.revision.revisionId,
    expectedRevisionVersion: profile.revision.siteProfileVersion,
    confirmation: isConfirmed ? "confirmed" : "",
  };

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-6">
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      <fieldset className="space-y-6" disabled={isPending}>
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-strong)] p-5">
            <p className="eyebrow">{t("siteProfile.candidate")}</p>
            <h3 className="mt-3 text-xl font-semibold">{publicDraft.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
              {publicDraft.summary ?? t("siteProfile.noPublicSummary")}
            </p>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Asia/Shanghai ·{" "}
              {t("siteProfile.revision", {
                revision: profile.revision.siteProfileVersion,
              })}
            </p>
          </article>
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="eyebrow">{t("siteProfile.visitorsNow")}</p>
            {currentSource ? (
              <>
                <h3 className="mt-3 text-xl font-semibold">
                  {currentSource.snapshot.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
                  {currentSource.snapshot.summary ??
                    t("siteProfile.noPublicSummary")}
                </p>
                <p className="mt-4 text-xs text-[var(--muted)]">
                  {currentSource.snapshot.timezone} ·{" "}
                  {t("siteProfile.sourceRevision", {
                    revision: currentSource.sourceRevision,
                  })}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
                {t("siteProfile.currentlyPrivate")}
              </p>
            )}
          </article>
        </section>

        <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm leading-6">
          <input
            checked={isConfirmed}
            className="mt-1"
            onChange={(event) =>
              setConfirmedRevisionId(
                event.target.checked ? profile.revision.revisionId : null,
              )
            }
            required
            type="checkbox"
          />
          <span>{t("siteProfile.publishConfirmation")}</span>
        </label>

        <button
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--foreground)] bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!isConfirmed || isPending}
          type="submit"
        >
          {isPending ? t("action.publishing") : t("action.publishProfile")}
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
