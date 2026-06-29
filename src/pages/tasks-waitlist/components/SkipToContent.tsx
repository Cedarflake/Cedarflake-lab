/**
 * SkipToContent - Accessibility skip navigation link.
 *
 * Allows keyboard users to skip past the hero section directly
 * to the main storyboard content (Section 2). Visible only when
 * the hero section is in view and focused via keyboard.
 */

import React, { useState, useEffect, useMemo, useReducer } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { useMotionValueEvent } from "framer-motion";
import { HEADER_HEIGHT_OFFSET, SCROLL_KEYFRAMES } from "../constants";
import { SECTION_CONFIGS } from "../data/sectionConfigs";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { useScrollProgress } from "../hooks/useScrollProgress";

export function SkipToContent() {
  const template = useTemplateConfig();
  const { lenisScroll, lenis, isNarrow } = useLenisScrollContext();
  const shouldReduceMotion = useReducedMotion();
  const [section1Element, setSection1Element] = useReducer(
    (_: HTMLElement | null, next: HTMLElement | null) => next,
    null,
  );
  const section1Ref = useMemo(() => ({ current: section1Element }), [section1Element]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-section-id="section-1"]');
    setSection1Element(el);
  }, []);

  const { scrollYProgress } = useScrollProgress({
    target: section1Ref,
    offset: ["start start", "end start"],
    lenisScroll,
  });

  const [isVisible, setIsVisible] = useState(true);
  useMotionValueEvent(scrollYProgress, "change", (progress: number) => {
    setIsVisible(progress < 1);
  });

  function scrollToContent() {
    const section2 = document.querySelector<HTMLElement>('[data-section-id="section-2"]');
    if (!section2) return;

    let targetScroll: number;

    if (isNarrow) {
      targetScroll = section2.getBoundingClientRect().top + window.scrollY;
    } else {
      const viewportHeight = window.innerHeight - HEADER_HEIGHT_OFFSET;
      const section1Multiplier =
        SECTION_CONFIGS.find((s) => s.id === "section-1")?.heightMultiplier ?? 1;
      const section2Multiplier =
        SECTION_CONFIGS.find((s) => s.id === "section-2")?.heightMultiplier ?? 1;
      const section1Height = section1Multiplier * viewportHeight;
      const introOffset = shouldReduceMotion
        ? 0
        : SCROLL_KEYFRAMES.INTRO_END * section2Multiplier * viewportHeight;

      targetScroll = section1Height + introOffset;
    }

    lenis?.scrollTo(targetScroll, { immediate: shouldReduceMotion === true });
    section2.focus();
  }

  return (
    <a
      href="https://story.revaea.com"
      tabIndex={isVisible ? 0 : -1}
      aria-hidden={!isVisible}
      className={cn(
        "sr-only focus:not-sr-only",
        "focus:absolute focus:start-6 focus:top-44 focus:z-50 md:focus:start-12 md:focus:top-40",
        "focus:bg-background-100 focus:text-foreground-900 focus:rounded-full focus:px-4 focus:py-2",
        "focus:outline-accent-100 focus:outline focus:outline-2 focus:outline-offset-2",
      )}
      onClick={(e) => {
        e.preventDefault();
        scrollToContent();
      }}
    >
      {template.accessibility.skipToContent}
    </a>
  );
}
