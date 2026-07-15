"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import type { StatusProjection } from "@/domain/status";
import type { AdminComponentOption } from "@/lib/forms/admin-component-option";

type ReportableCondition = Exclude<StatusProjection["condition"], "unknown">;
type OutcomeMode = "unchanged" | "transition";
type PublicationMode = "private" | "public";

interface ComponentStatusOutcomeEditorProps {
  components: readonly AdminComponentOption[];
  defaultCondition: ReportableCondition;
  description: string;
  fieldName: string;
  title: string;
}

interface OutcomeDraft {
  mode: OutcomeMode;
  condition: ReportableCondition;
  validityMinutes: string;
  ownerSummary: string;
  privateNote: string;
  publicationMode: PublicationMode;
  publicSummary: string;
}

const conditions: readonly ReportableCondition[] = [
  "available",
  "limited",
  "degraded",
  "unavailable",
];

function createDraft(defaultCondition: ReportableCondition): OutcomeDraft {
  return {
    mode: "unchanged",
    condition: defaultCondition,
    validityMinutes: "",
    ownerSummary: "",
    privateNote: "",
    publicationMode: "private",
    publicSummary: "",
  };
}

export function ComponentStatusOutcomeEditor({
  components,
  defaultCondition,
  description,
  fieldName,
  title,
}: ComponentStatusOutcomeEditorProps) {
  const t = useTranslations("AdminForms");
  const common = useTranslations("Common");
  const titleId = useId();
  const [drafts, setDrafts] = useState<Record<string, OutcomeDraft>>(() =>
    Object.fromEntries(
      components.map((component) => [
        component.componentId,
        createDraft(defaultCondition),
      ]),
    ),
  );

  const updateDraft = (componentId: string, update: Partial<OutcomeDraft>) => {
    setDrafts((current) => ({
      ...current,
      [componentId]: {
        ...(current[componentId] ?? createDraft(defaultCondition)),
        ...update,
      },
    }));
  };

  const choices = components.map((component) => {
    const draft =
      drafts[component.componentId] ?? createDraft(defaultCondition);
    const guard = {
      componentId: component.componentId,
      expectedComponentVersion: component.componentVersion,
      expectedComponentMetadataPublicationVersion:
        component.metadataPublicationVersion,
      expectedStatusPublicationVersion: component.statusPublicationVersion,
    };

    if (draft.mode === "unchanged") {
      return { ...guard, mode: "unchanged" as const };
    }

    return {
      ...guard,
      mode: "transition" as const,
      transition: {
        condition: draft.condition,
        validityMinutes: draft.validityMinutes,
        ownerSummary: draft.ownerSummary,
        privateNote: draft.privateNote,
        publicationMode: draft.publicationMode,
        publicSummary: draft.publicSummary,
      },
    };
  });

  return (
    <section className="form-section" aria-labelledby={titleId}>
      <input name={fieldName} type="hidden" value={JSON.stringify(choices)} />
      <div className="form-section-header">
        <h3 className="form-section-title" id={titleId}>
          {title}
        </h3>
        <p className="form-section-copy">{description}</p>
      </div>
      <div className="component-outcome-list">
        {components.map((component) => {
          const draft =
            drafts[component.componentId] ?? createDraft(defaultCondition);

          return (
            <fieldset className="component-outcome" key={component.componentId}>
              <legend className="component-outcome-header">
                <span className="component-outcome-name">{component.name}</span>
                <span className="component-outcome-meta">
                  {t("componentOutcome.current", {
                    condition: common(`condition.${component.condition}`),
                    exposure: component.isPublic
                      ? t("componentOutcome.public")
                      : t("componentOutcome.ownerOnly"),
                  })}
                </span>
              </legend>
              <label className="form-field">
                <span>{t("componentOutcome.afterOperation")}</span>
                <select
                  onChange={(event) =>
                    updateDraft(component.componentId, {
                      mode: event.target.value as OutcomeMode,
                    })
                  }
                  value={draft.mode}
                >
                  <option value="unchanged">
                    {t("option.keepCurrentStatus")}
                  </option>
                  <option value="transition">
                    {t("option.reportNewStatus")}
                  </option>
                </select>
              </label>
              {draft.mode === "transition" ? (
                <div className="component-outcome-fields">
                  <div className="form-grid form-grid-two">
                    <label className="form-field">
                      <span>{t("componentOutcome.newCondition")}</span>
                      <select
                        onChange={(event) =>
                          updateDraft(component.componentId, {
                            condition: event.target
                              .value as ReportableCondition,
                          })
                        }
                        value={draft.condition}
                      >
                        {conditions.map((condition) => (
                          <option key={condition} value={condition}>
                            {common(`condition.${condition}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>{t("field.expiresMinutes")}</span>
                      <input
                        max={525_600}
                        min={1}
                        onChange={(event) =>
                          updateDraft(component.componentId, {
                            validityMinutes: event.target.value,
                          })
                        }
                        placeholder={t("option.noExpiry")}
                        type="number"
                        value={draft.validityMinutes}
                      />
                    </label>
                  </div>
                  <label className="form-field">
                    <span>{t("field.ownerStatusSummary")}</span>
                    <textarea
                      maxLength={280}
                      onChange={(event) =>
                        updateDraft(component.componentId, {
                          ownerSummary: event.target.value,
                        })
                      }
                      value={draft.ownerSummary}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t("field.privateStatusNote")}</span>
                    <textarea
                      maxLength={2_000}
                      onChange={(event) =>
                        updateDraft(component.componentId, {
                          privateNote: event.target.value,
                        })
                      }
                      value={draft.privateNote}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t("componentOutcome.statusPublication")}</span>
                    <select
                      onChange={(event) =>
                        updateDraft(component.componentId, {
                          publicationMode: event.target
                            .value as PublicationMode,
                        })
                      }
                      value={draft.publicationMode}
                    >
                      <option value="private">{t("option.ownerOnly")}</option>
                      {component.isPublic ? (
                        <option value="public">
                          {t("option.publishStatus")}
                        </option>
                      ) : null}
                    </select>
                  </label>
                  {draft.publicationMode === "public" ? (
                    <label className="form-field">
                      <span>{t("field.publicStatusSummary")}</span>
                      <textarea
                        maxLength={280}
                        onChange={(event) =>
                          updateDraft(component.componentId, {
                            publicSummary: event.target.value,
                          })
                        }
                        value={draft.publicSummary}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
