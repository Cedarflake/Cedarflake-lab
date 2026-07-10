/**
 * FloatingBar - Fixed bottom pill with the brand logo and CTA button.
 *
 * Appears when section-2 scrolls past the viewport bottom and hides
 * when the SectionEnd card is sufficiently inside the viewport. Uses element-based scroll
 * tracking for precise show/hide logic.
 */

import React, { useReducer, useEffect, useMemo } from "react";
import { motion, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { defaultEasing } from "@/lib/easing";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { SHOW_LOGO_ICON } from "../constants";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { useScrollProgress } from "../hooks/useScrollProgress";
import { WaitlistButton } from "./WaitlistButton";

export function FloatingBar({ className }: { className?: string }) {
  const template = useTemplateConfig();
  const { lenisScroll } = useLenisScrollContext();

  const debug = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debugFloatingBar") === "1";
  }, []);

  const EPS = 0.001;
  const isPositive = (v: number) => v > EPS;
  const isZeroish = (v: number) => v <= EPS;
  // `endProgress` runs 0->1 as the end-card top moves from viewport bottom -> viewport top.
  // Hide once we're "inside" the card (not immediately at first contact).
  const END_HIDE_THRESHOLD = 0.24;
  const [section2El, setSection2El] = useReducer(
    (_: Element | null, next: Element | null) => next,
    null,
  );
  const section2Ref = useMemo(() => ({ current: section2El }), [section2El]);

  const [sectionEndEl, setSectionEndEl] = useReducer(
    (_: Element | null, next: Element | null) => next,
    null,
  );
  const sectionEndRef = useMemo(() => ({ current: sectionEndEl }), [sectionEndEl]);

  useEffect(() => {
    const s2 = document.querySelector('[data-section-id="section-2"]');
    const se =
      document.querySelector('[data-section-end-card]') ??
      document.querySelector('[data-section-id="section-end"]');
    setSection2El(s2);
    setSectionEndEl(se);
  }, []);

  const { scrollYProgress: s2Progress } = useScrollProgress({
    target: section2Ref as React.RefObject<HTMLElement>,
    offset: ["end end", "end center"],
    lenisScroll,
  });

  const { scrollYProgress: endProgress } = useScrollProgress({
    target: sectionEndRef as React.RefObject<HTMLElement>,
    offset: ["start end", "start start"],
    lenisScroll,
  });

  const [visible, setVisible] = useReducer((_: boolean, next: boolean) => next, false);

  useEffect(() => {
    const update = () => {
      const s2 = s2Progress.get();
      const end = endProgress.get();
      const shouldShow = isPositive(s2) && (isZeroish(end) || end < END_HIDE_THRESHOLD);
      setVisible(shouldShow);

      if (debug) {
        console.log("[FloatingBar]", {
          section2Found: Boolean(section2El),
          sectionEndFound: Boolean(sectionEndEl),
          s2Progress: s2,
          endProgress: end,
          visible: shouldShow,
          END_HIDE_THRESHOLD,
        });
      }
    };

    update();

    const updateTwice = () => {
      update();
      requestAnimationFrame(update);
    };

    const unsub1 = s2Progress.on("change", updateTwice);
    const unsub2 = endProgress.on("change", updateTwice);
    return () => {
      unsub1();
      unsub2();
    };
  }, [s2Progress, endProgress]);

  const translateY = useTransform(s2Progress, [0, 0.5], [200, 0], {
    ease: defaultEasing,
  });

  if (!visible) return null;

  return (
    <motion.div
      className={cn(
        "fixed bottom-0 z-50 flex w-full items-center justify-center px-4",
        "pointer-events-none",
        className,
      )}
      style={{ y: translateY }}
    >
      <div
        className={cn(
          "shadow-tinted-lg pointer-events-auto relative flex flex-col rounded-full p-1.5",
          "mb-5 sm:mb-8",
          "bg-background-100 text-foreground-900 dark:bg-background-150",
        )}
      >
        <div className="flex items-center justify-center gap-2">
          <div className="flex shrink-0 items-center justify-center gap-1 px-2.5">
            {SHOW_LOGO_ICON}
            <div className="ms-1 shrink-0 text-base-dense-medium leading-none">
              {template.brand.name}
            </div>
          </div>
          <WaitlistButton placement="floating" />
        </div>
      </div>
    </motion.div>
  );
}
