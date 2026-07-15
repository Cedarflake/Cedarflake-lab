import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AuthPages");

  return {
    title: t("errorMetadata"),
    robots: { index: false, follow: false },
  };
}

export default async function AuthErrorPage() {
  const [t, common] = await Promise.all([
    getTranslations("AuthPages"),
    getTranslations("Common"),
  ]);

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
              {common("ownerAccess")}
            </span>
          </span>
        </div>
        <div className="public-nav">
          <LocaleSwitcher />
          <span className="eyebrow">{t("accessNotCompleted")}</span>
        </div>
      </header>

      <div className="flex flex-1 items-center py-8 sm:py-12">
        <section
          className="status-hero my-auto w-full"
          data-condition="unavailable"
          aria-labelledby="auth-error-heading"
        >
          <div className="hero-topline flex-wrap">
            <p className="eyebrow">{common("ownerAccess")}</p>
            <span className="live-indicator">{t("notCompleted")}</span>
          </div>
          <div className="hero-status-row">
            <h1 className="hero-status" id="auth-error-heading">
              {t("errorTitle")}
            </h1>
            <div className="hero-summary">
              <p className="hero-description">{t("errorDescription")}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--surface-strong)] no-underline transition-opacity hover:opacity-85"
                  href="/login?returnTo=%2Fadmin"
                >
                  {common("tryAgain")}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                </Link>
                <Link
                  className="inline-flex min-h-11 items-center rounded-full border border-[var(--muted-strong)] bg-[var(--surface-strong)] px-5 text-sm font-semibold no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  href="/"
                >
                  {t("returnToPublic")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
