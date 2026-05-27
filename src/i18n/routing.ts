import {defineRouting} from "next-intl/routing";

export const locales = ["zh-CN", "en"] as const;
export const defaultLocale = "zh-CN" as const;

export type AppLocale = (typeof locales)[number];

export const localeLabels: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  pathnames: {
    "/": "/",
    "/components": "/components",
    "/components/[componentSlug]": "/components/[componentSlug]",
    "/incidents/[incidentId]": "/incidents/[incidentId]",
  },
});

export function isValidLocale(locale: string): locale is AppLocale {
  return locales.includes(locale as AppLocale);
}

export function getDirection(locale: AppLocale) {
  const rtlPrefixes = ["ar", "fa", "he", "ur"] as const;

  return rtlPrefixes.some((prefix) => locale.startsWith(prefix))
    ? ("rtl" as const)
    : ("ltr" as const);
}
