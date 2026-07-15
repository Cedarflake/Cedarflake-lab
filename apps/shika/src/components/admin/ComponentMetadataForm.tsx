"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { saveComponentMetadataAction } from "@/app/admin/component-actions";
import { initialAdminActionState } from "@/lib/forms/admin-action-state";
import type { SaveComponentMetadataFormPayload } from "@/lib/forms/component-management";
import type { ComponentPublicSnapshot } from "@/lib/public/snapshots";

import { AdminActionFeedback } from "./AdminActionFeedback";

interface ComponentMetadataFormProps {
  componentId: string;
  componentVersion: number;
  idempotencyKey: string;
  metadataPublicationVersion: number;
  metadata: {
    ownerName: string;
    ownerSummary: string | null;
    ownerSortOrder: number;
    defaultValidityMs: number | null;
    privateNote: string | null;
    publicDraft: {
      name: string;
      summary: string | null;
      sortOrder: number;
    } | null;
  };
  visitorSnapshot: ComponentPublicSnapshot | null;
}

interface MetadataDraft {
  ownerName: string;
  ownerSummary: string;
  ownerSortOrder: string;
  defaultValidityMinutes: string;
  privateNote: string;
  hasPublicDraft: boolean;
  publicName: string;
  publicSummary: string;
  publicSortOrder: string;
}

const fieldClassName =
  "w-full border border-[var(--border)] bg-transparent px-3 py-2 text-sm";

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validityMilliseconds(value: string) {
  if (value === "") return null;
  return Math.round(Number(value) * 60_000);
}

export function ComponentMetadataForm({
  componentId,
  componentVersion,
  idempotencyKey,
  metadataPublicationVersion,
  metadata,
  visitorSnapshot,
}: ComponentMetadataFormProps) {
  const t = useTranslations("AdminForms");
  const [draft, setDraft] = useState<MetadataDraft>({
    ownerName: metadata.ownerName,
    ownerSummary: metadata.ownerSummary ?? "",
    ownerSortOrder: String(metadata.ownerSortOrder),
    defaultValidityMinutes:
      metadata.defaultValidityMs === null
        ? ""
        : String(metadata.defaultValidityMs / 60_000),
    privateNote: metadata.privateNote ?? "",
    hasPublicDraft: metadata.publicDraft !== null,
    publicName: metadata.publicDraft?.name ?? metadata.ownerName,
    publicSummary: metadata.publicDraft?.summary ?? metadata.ownerSummary ?? "",
    publicSortOrder: String(
      metadata.publicDraft?.sortOrder ?? metadata.ownerSortOrder,
    ),
  });
  const [state, formAction, isPending] = useActionState(
    saveComponentMetadataAction,
    initialAdminActionState,
  );
  const payload: SaveComponentMetadataFormPayload = {
    idempotencyKey,
    componentId,
    expectedComponentVersion: componentVersion,
    expectedMetadataPublicationVersion: metadataPublicationVersion,
    ownerName: draft.ownerName,
    ownerSummary: optionalText(draft.ownerSummary),
    ownerSortOrder: Number(draft.ownerSortOrder),
    defaultValidityMs: validityMilliseconds(draft.defaultValidityMinutes),
    privateNote: optionalText(draft.privateNote),
    publicDraft: draft.hasPublicDraft
      ? {
          name: draft.publicName,
          summary: optionalText(draft.publicSummary),
          sortOrder: Number(draft.publicSortOrder),
        }
      : null,
  };

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-5">
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      <fieldset className="space-y-5" disabled={isPending}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t("field.ownerName")}</span>
            <input
              className={fieldClassName}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  ownerName: event.target.value,
                }))
              }
              required
              value={draft.ownerName}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t("field.ownerOrder")}</span>
            <input
              className={fieldClassName}
              min={0}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  ownerSortOrder: event.target.value,
                }))
              }
              required
              type="number"
              value={draft.ownerSortOrder}
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
          <span>{t("field.defaultReportValidity")}</span>
          <input
            className={fieldClassName}
            min={0.000_001}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                defaultValidityMinutes: event.target.value,
              }))
            }
            placeholder={t("option.noDefaultExpiry")}
            step="any"
            type="number"
            value={draft.defaultValidityMinutes}
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

        <section className="space-y-4 border-t border-[var(--border)] pt-5">
          <div>
            <h3 className="text-sm font-semibold">
              {t("componentMetadata.publicDraft")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {t("componentMetadata.publicDraftDescription")}
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm">
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
            <span>{t("componentMetadata.keepPublicDraft")}</span>
          </label>
          {draft.hasPublicDraft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t("field.publicName")}</span>
                  <input
                    className={fieldClassName}
                    maxLength={80}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        publicName: event.target.value,
                      }))
                    }
                    required
                    value={draft.publicName}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("field.publicOrder")}</span>
                  <input
                    className={fieldClassName}
                    min={0}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        publicSortOrder: event.target.value,
                      }))
                    }
                    required
                    type="number"
                    value={draft.publicSortOrder}
                  />
                </label>
              </div>
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
            </div>
          ) : null}
        </section>

        <section className="border border-[var(--border)] p-4 text-sm">
          <h3 className="font-semibold">
            {t("componentMetadata.visitorSnapshot")}
          </h3>
          {visitorSnapshot ? (
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-[var(--muted)]">{t("field.name")}</dt>
                <dd className="mt-1 font-medium">{visitorSnapshot.name}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t("field.order")}</dt>
                <dd className="mt-1 font-medium">
                  {visitorSnapshot.sortOrder}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t("field.summary")}</dt>
                <dd className="mt-1 font-medium">
                  {visitorSnapshot.summary ??
                    t("componentMetadata.noPublicSummary")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {t("componentMetadata.noVisitorMetadata")}
            </p>
          )}
        </section>

        <button
          className="border border-[var(--foreground)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
        >
          {isPending ? t("action.saving") : t("action.saveOwnerDraft")}
        </button>
      </fieldset>
      <AdminActionFeedback state={state} />
    </form>
  );
}
