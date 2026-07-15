import Link from "next/link";
import { Activity, History } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import type { SiteProfilePublicSnapshot } from "@/lib/public/site-profile-snapshots";
import { siteProfileBrandMark } from "@/lib/public/site-profile-fallback";

import { OwnerAccessLink } from "./OwnerAccessLink";

interface PublicHeaderProps {
  currentPage: "history" | "incident" | "status";
  siteProfile: SiteProfilePublicSnapshot;
}

export function PublicHeader({ currentPage, siteProfile }: PublicHeaderProps) {
  const t = useTranslations("PublicHeader");

  return (
    <header className="site-header">
      <Link className="brand-lockup" href="/">
        <span aria-hidden="true" className="brand-mark">
          {siteProfileBrandMark(siteProfile)}
        </span>
        <span>
          <span className="block brand-name">{siteProfile.title}</span>
          {siteProfile.summary ? (
            <span className="block brand-description">
              {siteProfile.summary}
            </span>
          ) : null}
        </span>
      </Link>
      <nav aria-label={t("navigation")} className="public-nav">
        {currentPage !== "status" ? (
          <Link className="header-link" href="/">
            <Activity
              aria-hidden="true"
              className="size-3.5 shrink-0"
              strokeWidth={1.75}
            />
            {t("status")}
          </Link>
        ) : null}
        {currentPage !== "history" ? (
          <Link className="header-link" href="/history">
            <History
              aria-hidden="true"
              className="size-3.5 shrink-0"
              strokeWidth={1.75}
            />
            {t("history")}
          </Link>
        ) : null}
        <LocaleSwitcher />
        <OwnerAccessLink />
      </nav>
    </header>
  );
}
