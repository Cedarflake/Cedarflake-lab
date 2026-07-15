import { defaultLocale, type AppLocale } from "./config";

interface LanguagePreference {
  language: string;
  quality: number;
  position: number;
}

function mapLanguageToLocale(language: string): AppLocale | null {
  const normalized = language.trim().toLowerCase();

  if (normalized === "en" || normalized.startsWith("en-")) return "en";

  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-sg" ||
    normalized.startsWith("zh-hans")
  ) {
    return "zh-CN";
  }

  return null;
}

function parseLanguagePreference(
  entry: string,
  position: number,
): LanguagePreference | null {
  const [languagePart, ...parameters] = entry.split(";");
  const language = languagePart?.trim();

  if (!language || language === "*") return null;

  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith("q="),
  );
  const quality = qualityParameter
    ? Number.parseFloat(qualityParameter.split("=")[1] ?? "")
    : 1;

  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return null;

  return { language, quality, position };
}

export function resolveRequestLocale(
  cookieLocale: string | null,
  acceptLanguage: string | null,
): AppLocale {
  if (cookieLocale === "en" || cookieLocale === "zh-CN") {
    return cookieLocale;
  }

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map(parseLanguagePreference)
    .filter(
      (preference): preference is LanguagePreference => preference !== null,
    )
    .sort(
      (left, right) =>
        right.quality - left.quality || left.position - right.position,
    );

  for (const preference of preferences) {
    const locale = mapLanguageToLocale(preference.language);
    if (locale) return locale;
  }

  return defaultLocale;
}
