import {getRequestConfig} from "next-intl/server";

import {isValidLocale, routing, type AppLocale} from "@/i18n/routing";

const timeZones: Record<AppLocale, string> = {
  "zh-CN": "Asia/Shanghai",
  en: "UTC",
};

async function loadMessages(locale: AppLocale) {
  return (await import(`@/messages/${locale}.json`)).default;
}

export default getRequestConfig(async ({requestLocale}) => {
  const requestedLocale = await requestLocale;
  const locale =
    requestedLocale && isValidLocale(requestedLocale)
      ? requestedLocale
      : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: timeZones[locale],
    now: new Date(),
  };
});
