import type { Metadata } from "next";

import { defaultLocale, type AppLocale } from "@/i18n/config";

import type { SiteProfilePublicSnapshot } from "./site-profile-snapshots";

export function createProductSiteProfileFallback(
  locale: AppLocale,
): SiteProfilePublicSnapshot {
  return {
    schemaVersion: 1,
    title: "Shika",
    summary: locale === "zh-CN" ? "个人状态信号" : "A personal status signal",
    timezone: "Asia/Shanghai",
  };
}

export const productSiteProfileFallback =
  createProductSiteProfileFallback(defaultLocale);

export function resolvePublicSiteProfile(
  snapshot: SiteProfilePublicSnapshot | null,
  locale: AppLocale = defaultLocale,
) {
  return (
    snapshot ??
    (locale === defaultLocale
      ? productSiteProfileFallback
      : createProductSiteProfileFallback(locale))
  );
}

export function createPublicSiteProfileMetadata(
  snapshot: SiteProfilePublicSnapshot,
  sectionTitle?: string,
): Metadata {
  return {
    title: {
      absolute: sectionTitle
        ? `${sectionTitle} — ${snapshot.title}`
        : snapshot.title,
    },
    description: snapshot.summary,
  };
}

export function siteProfileBrandMark(snapshot: SiteProfilePublicSnapshot) {
  return Array.from(snapshot.title)[0]?.toLocaleUpperCase("en") ?? "S";
}
