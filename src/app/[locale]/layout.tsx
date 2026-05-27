import type {Metadata, Viewport} from "next";
import {NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {AppProviders} from "@/components/providers/app-providers";
import {siteConfig} from "@/config/site";
import {fontVariables} from "@/styles/fonts";
import {getDirection, isValidLocale, routing, type AppLocale} from "@/i18n/routing";

import "../globals.css";

type LayoutParams = Promise<{
  locale: string;
}>;

async function getLocaleFromParams(params: LayoutParams): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({
  params,
}: {
  params: LayoutParams;
}): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const t = await getTranslations({locale, namespace: "Metadata"});

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: t("title"),
      template: `%s | ${siteConfig.name}`,
    },
    description: t("description"),
    applicationName: siteConfig.name,
    authors: [{name: siteConfig.author}],
    keywords: [...siteConfig.keywords],
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((item) => [item, `${siteConfig.url}/${item}`]),
      ),
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: `${siteConfig.url}/${locale}`,
      siteName: siteConfig.name,
      locale,
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [...siteConfig.themeColor],
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: LayoutParams;
}>) {
  const locale = await getLocaleFromParams(params);

  setRequestLocale(locale);

  const messages = await getMessages({locale});

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
