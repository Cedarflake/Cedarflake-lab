"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

interface PublicErrorProps {
  reset: () => void;
}

export default function PublicError({ reset }: PublicErrorProps) {
  const t = useTranslations("PublicError");
  const common = useTranslations("Common");

  return (
    <main className="page-shell flex min-h-dvh flex-col">
      <header className="site-header">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span>
            <span className="block brand-name">Shika</span>
            <span className="block brand-description">
              {t("brandDescription")}
            </span>
          </span>
        </div>
        <div className="public-nav">
          <LocaleSwitcher />
          <span className="eyebrow">{common("publicStatus")}</span>
        </div>
      </header>

      <div className="flex flex-1 items-center py-8 sm:py-12">
        <section
          className="status-hero my-auto w-full"
          data-condition="unavailable"
          aria-labelledby="public-error-heading"
        >
          <div className="hero-topline flex-wrap">
            <p className="eyebrow">{t("eyebrow")}</p>
            <span className="live-indicator">{t("indicator")}</span>
          </div>
          <div className="hero-status-row">
            <h1 className="hero-status" id="public-error-heading">
              {t("title")}
            </h1>
            <div className="hero-summary">
              <div aria-labelledby="public-error-heading" role="alert">
                <p className="hero-description">{t("description")}</p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] transition-opacity hover:opacity-85"
                  onClick={reset}
                  type="button"
                >
                  {common("tryAgain")}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                </button>
                <button
                  className="inline-flex min-h-11 items-center rounded-full border border-[var(--muted-strong)] bg-[var(--surface-strong)] px-5 text-sm font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  onClick={() => window.location.reload()}
                  type="button"
                >
                  {common("reloadPage")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
