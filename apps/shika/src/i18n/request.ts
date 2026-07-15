import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { localeCookieName } from "./config";
import { resolveRequestLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveRequestLocale(
    cookieStore.get(localeCookieName)?.value ?? null,
    headerStore.get("accept-language"),
  );

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
