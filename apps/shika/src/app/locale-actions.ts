"use server";

import { cookies } from "next/headers";

import { isAppLocale, localeCookieName, type AppLocale } from "@/i18n/config";

const localeCookieMaxAge = 60 * 60 * 24 * 365;

export async function setLocaleAction(locale: AppLocale) {
  if (!isAppLocale(locale)) {
    throw new Error("Unsupported locale");
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: localeCookieMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
