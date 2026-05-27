"use client";

import {useParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import {useTransition} from "react";

import {usePathname, useRouter} from "@/i18n/navigation";
import {localeLabels, routing, type AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

export function LocaleSwitcher({className}: {className?: string}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const params = useParams<{incidentId?: string; componentSlug?: string}>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;

    startTransition(() => {
      if (pathname === "/components/[componentSlug]" && params.componentSlug) {
        router.replace(
          {
            pathname,
            params: {componentSlug: params.componentSlug},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      if (pathname === "/components") {
        router.replace("/components", {locale: nextLocale, scroll: false});

        return;
      }

      if (pathname === "/incidents/[incidentId]" && params.incidentId) {
        router.replace(
          {
            pathname,
            params: {incidentId: params.incidentId},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      router.replace("/", {locale: nextLocale, scroll: false});
    });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("label")}
      </span>
      <div className="surface-muted inline-flex gap-1 p-1">
        {routing.locales.map((option) => {
          const active = option === locale;

          return (
            <button
              key={option}
              type="button"
              onClick={() => switchLocale(option)}
              disabled={active || isPending}
              aria-pressed={active}
              aria-label={`${t("switchTo")} ${localeLabels[option]}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
                isPending && !active && "opacity-80",
              )}
            >
              {localeLabels[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
