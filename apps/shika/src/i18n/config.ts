export const locales = ["en", "zh-CN"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
export const localeCookieName = "shika-locale";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}
