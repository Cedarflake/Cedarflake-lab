"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { setLocaleAction } from "@/app/locale-actions";
import { localeLabels, locales, type AppLocale } from "@/i18n/config";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const selectLocale = (nextLocale: AppLocale) => {
    setIsOpen(false);
    if (nextLocale === locale) return;

    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  };

  return (
    <div className="locale-switcher" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t("label")}
        className="header-link locale-trigger"
        disabled={isPending}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Languages aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        <span>{locale === "zh-CN" ? "中" : "EN"}</span>
      </button>
      <div
        aria-hidden={!isOpen}
        aria-label={t("menuLabel")}
        className="locale-menu"
        data-open={isOpen ? "true" : "false"}
        id={menuId}
        role="group"
      >
        {locales.map((option) => {
          const isActive = option === locale;

          return (
            <button
              aria-pressed={isActive}
              className="locale-option"
              data-active={isActive ? "true" : "false"}
              disabled={!isOpen || isPending}
              key={option}
              onClick={() => selectLocale(option)}
              type="button"
            >
              <span>{localeLabels[option]}</span>
              {isActive ? (
                <Check
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
