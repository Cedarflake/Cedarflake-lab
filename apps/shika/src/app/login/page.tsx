import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { GitHubSignInButton } from "@/components/auth/GitHubSignInButton";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { getOwnerAccessState } from "@/lib/auth/require-owner";
import { normalizeOwnerReturnPath } from "@/lib/navigation/owner-return-path";

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AuthPages");

  return {
    title: t("signInMetadata"),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await connection();
  const parameters = await searchParams;
  const returnTo = normalizeOwnerReturnPath(parameters.returnTo);
  const [t, common] = await Promise.all([
    getTranslations("AuthPages"),
    getTranslations("Common"),
  ]);

  const access = await getOwnerAccessState();
  if (access.kind === "owner") redirect(returnTo);
  if (access.kind === "denied") redirect("/auth-error");

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
        <nav className="public-nav">
          <LocaleSwitcher />
          <Link className="header-link" href="/">
            {common("publicStatus")}
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 items-center py-8 sm:py-12">
        <section
          className="status-hero my-auto w-full"
          data-condition="unknown"
          aria-labelledby="login-heading"
        >
          <div className="hero-topline flex-wrap">
            <p className="eyebrow">{t("privateOperations")}</p>
            <span className="live-indicator">{t("configuredOwnerOnly")}</span>
          </div>
          <div className="hero-status-row">
            <div>
              <p className="eyebrow text-[var(--accent-strong)]">
                {common("ownerAccess")}
              </p>
              <h1
                className="mt-3 text-[clamp(2.8rem,8vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.065em]"
                id="login-heading"
              >
                {t("adminTitle")}
              </h1>
            </div>
            <div className="hero-summary">
              <p className="hero-description">{t("signInDescription")}</p>
              <div className="mt-8">
                <GitHubSignInButton returnTo={returnTo} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
