/**
 * Section2 - Rolodex sentence animation.
 *
 * The core visual experience: a sentence like "I want to [create] a
 * [presentation] for my [report]" where the bracketed words flip through
 * three variations in a split-flap / rolodex style.
 *
 * Wide viewports: scroll-driven animation that flips on scroll.
 * Narrow viewports: auto-playing timer-based animation with pause/play.
 *
 * At the end of the scroll range the dark background shrinks into a
 * squircle card and the content scales/blurs to transition into Section 3.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";
import { defaultEasing } from "@/lib/easing";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { SCROLL_KEYFRAMES as K, CONTENT_MAX_WIDTH, LAYOUT_CONFIG } from "../constants";
import { useSectionContext } from "../context/SectionContext";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { RolodexItem } from "../components/RolodexItem";
import { getDiagonalIndex, getMaxDiagonalIndex } from "../data/rolodexItems";
import { useRolodexAnimation } from "../hooks/useRolodexAnimation";
import { useOverflowDetection } from "../hooks/useOverflowDetection";
import { useScrollProgress } from "../hooks/useScrollProgress";
import type { RolodexItem as RolodexItemData, RolodexLayout, RolodexItemWithStagger } from "../types";

const CONTENT_TEXT_CLASSES = cn(
  "font-display-revaea",
  "!text-[52px] !leading-[52px] text-4xl-medium",
  "lg:!text-[80px] lg:!leading-[80px]",
  "lg:p-12",
  "[@media(max-height:720px)]:!text-[52px] [@media(max-height:720px)]:!leading-[52px]",
  "[@media(max-height:720px)]:p-6 [@media(max-height:720px)]:py-14",
);

// ===================== Main Component =====================

interface Section2Props {
  sectionRef?: React.RefObject<HTMLElement | null>;
}

export function Section2({ sectionRef: externalSectionRef }: Section2Props) {
  const { scrollYProgress, sticky, sectionRef: contextSectionRef } = useSectionContext();
  const { isNarrow, lenisScroll } = useLenisScrollContext();
  const shouldReduceMotion = useReducedMotion() === true;
  const template = useTemplateConfig();
  const sectionRef = externalSectionRef ?? contextSectionRef;

  const [isPaused, setIsPaused] = useState(() => shouldReduceMotion);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const squircleRef = useRef<HTMLDivElement>(null);
  const refContentRef = useRef<HTMLDivElement>(null);
  const autoProgress = useRolodexAnimation({ paused: isPaused });
  const sectionProgress = scrollYProgress ?? lenisScroll;
  const progress = isNarrow ? autoProgress : sectionProgress;
  const exitOffset = useMemo<[string, string]>(() => ["end start", "end end"], []);
  const { scrollYProgress: exitProgress } = useScrollProgress({
    target: sectionRef,
    offset: exitOffset,
    lenisScroll,
  });
  const isOverflowing = useOverflowDetection({
    containerRef,
    childRef: refContentRef,
    threshold: LAYOUT_CONFIG.layoutSwitchThreshold,
  });
  const layout: RolodexLayout = isNarrow ? "6-line" : isOverflowing ? "5-line" : "3-line";
  const layoutItems =
    layout === "6-line"
      ? template.rolodex.layouts.sixLine
      : layout === "5-line"
        ? template.rolodex.layouts.fiveLine
        : template.rolodex.layouts.threeLine;
  const items = useMemo(() => prepareItems(layoutItems), [layoutItems]);
  const referenceItems = useMemo(
    () => prepareItems(template.rolodex.layouts.threeLine),
    [template.rolodex.layouts.threeLine],
  );
  const rowCount = layout === "6-line" ? 6 : layout === "5-line" ? 5 : 3;
  const rows = useMemo(
    () => Array.from({ length: rowCount }, (_, i) => items.filter((item) => item.row === i)),
    [rowCount, items],
  );
  const referenceRows = useMemo(
    () => Array.from({ length: 3 }, (_, i) => referenceItems.filter((item) => item.row === i)),
    [referenceItems],
  );

  const useStatic = isNarrow || shouldReduceMotion;

  const scaleAnim = useTransform(
    progress,
    [K.INTRO_START, K.ROLODEX_1_START, K.HOLD_3_END, K.SCALE_START],
    [0.95, 1, 1, 0.95],
    { clamp: true, ease: defaultEasing },
  );
  const yOffsetAnim = useTransform(progress, [K.INTRO_START, K.ROLODEX_1_START], [10, 0], {
    clamp: true,
    ease: defaultEasing,
  });
  const opacityAnim = useTransform(
    progress,
    [K.INTRO_START, K.INTRO_END, K.SCALE_PREP_END, K.SCALE_END],
    [0, 1, 1, 1],
    { clamp: true, ease: defaultEasing },
  );
  const blurAnim = useTransform(
    progress,
    [K.INTRO_START, K.INTRO_END, K.SCALE_PREP_END, K.SCALE_END],
    ["blur(10px)", "blur(0px)", "blur(0px)", "blur(0px)"],
    { clamp: false, ease: defaultEasing },
  );
  const introOpacityAnim = useTransform(progress, [K.HOLD_3_START, K.HOLD_3_END], [1, 0], {
    clamp: true,
    ease: defaultEasing,
  });
  const introVisibilityAnim = useTransform(
    progress,
    [K.HOLD_3_END - 0.001, K.HOLD_3_END],
    ["visible", "hidden"] as const,
    { clamp: true },
  );

  const staticOne = useMotionValue(1);
  const staticZero = useMotionValue(0);
  const staticBlur = useMotionValue("blur(0px)");
  const staticVisible = useMotionValue<"visible" | "hidden">("visible");

  const contentScale = useStatic ? staticOne : scaleAnim;
  const contentY = useStatic ? staticZero : yOffsetAnim;
  const contentOpacity = useStatic ? staticOne : opacityAnim;
  const contentBlur = useStatic ? staticBlur : blurAnim;
  const introOpacity = useStatic ? staticOne : introOpacityAnim;
  const introVisibility = useStatic ? staticVisible : introVisibilityAnim;

  // --- Background squircle dynamic scale ---
  const [bgScale, setBgScale] = useState(2.5);

  useEffect(() => {
    const compute = () => {
      if (!containerRef.current || !contentRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const sRect = contentRef.current.getBoundingClientRect();
      if (cRect.width <= 0 || cRect.height <= 0) return;
      if (sRect.width <= 0 || sRect.height <= 0) return;
      const scaleX = cRect.width / sRect.width;
      const scaleY = cRect.height / sRect.height;
      const next = Math.max(scaleX, scaleY) * 1.05;
      if (!Number.isFinite(next) || next <= 0) return;
      setBgScale(next);
    };
    const timeout = setTimeout(compute, 100);
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        compute();
        resizeTimer = null;
      }, 400);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timeout);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const [centerOffset, setCenterOffset] = useState(0);

  useLayoutEffect(() => {
    const compute = () => {
      if (!containerRef.current || !contentRef.current) return;
      const cH = containerRef.current.getBoundingClientRect().height;
      const sH = contentRef.current.getBoundingClientRect().height;
      setCenterOffset((cH - sH) / 2);
    };
    const timeout = setTimeout(compute, 300);
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        compute();
        resizeTimer = null;
      }, 400);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timeout);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [bgScale]);

  const bgSquircleScaleAnim = useTransform(
    sectionProgress,
    [K.HOLD_3_END, K.SCALE_START],
    [bgScale, 1],
    { clamp: true, ease: defaultEasing },
  );
  const bgSquircleOpacityAnim = useTransform(
    sectionProgress,
    [K.HOLD_3_END - 0.01, K.HOLD_3_END],
    [0, 1],
    { clamp: true, ease: defaultEasing },
  );
  const darkLayerOpacityAnim = useTransform(
    sectionProgress,
    [K.HOLD_3_END, K.HOLD_3_END + 0.01],
    [1, 0],
    { clamp: true, ease: defaultEasing },
  );
  const exitYAnim = useTransform(exitProgress, [0, 1], [0, centerOffset / 2], {
    clamp: true,
    ease: defaultEasing,
  });

  const finalBgScale = shouldReduceMotion ? staticOne : bgSquircleScaleAnim;
  const finalBgOpacity = shouldReduceMotion ? staticOne : bgSquircleOpacityAnim;
  const finalDarkOpacity = shouldReduceMotion ? staticOne : darkLayerOpacityAnim;
  const finalExitY = shouldReduceMotion ? staticZero : exitYAnim;

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "bg-background-250 mb-24 flex items-center justify-center px-4 pt-12 sm:bg-transparent sm:px-8 md:py-0",
        sticky ? "sticky top-0" : "relative",
      )}
      style={{
        height: isNarrow ? undefined : "100dvh",
      }}
    >
      {/* Dark background layer - only when NOT narrow */}
      {!isNarrow && (
        <motion.div
          className="theme-panel-bg absolute inset-0 will-change-[opacity]"
          style={{ opacity: finalDarkOpacity }}
        />
      )}

      {/* Content wrapper */}
      <motion.div
        className="relative flex w-full flex-col items-center justify-center text-white/80"
        style={{ y: isNarrow ? 0 : finalExitY }}
      >
        {/* Squircle background panel */}
        <motion.div
          ref={squircleRef}
          className={cn(
            "theme-panel-bg squircle-24 md:squircle-48 pointer-events-none absolute size-full will-change-[transform,opacity]",
            CONTENT_MAX_WIDTH,
          )}
          style={{
            scale: isNarrow ? 1 : finalBgScale,
            opacity: isNarrow ? 1 : finalBgOpacity,
          }}
        />

        {/* Text content */}
        <motion.div
          ref={contentRef}
          className={cn(
            "relative max-w-full p-6 pt-16 pb-20 will-change-[transform,opacity,filter] md:py-14",
            CONTENT_TEXT_CLASSES,
          )}
          style={{
            y: contentY,
            opacity: contentOpacity,
            scale: contentScale,
            filter: contentBlur,
            contain: "layout style paint",
          }}
        >
          {/* Intro text */}
          <motion.div
            className={cn(
              "text-md mb-10 flex justify-start ps-1 md:mb-0 md:h-0 lg:ps-2 lg:text-lg",
              "[@media(max-height:720px)]:text-md [@media(max-height:720px)]:ps-1",
            )}
            style={{
              opacity: introOpacity,
              visibility: introVisibility,
            }}
          >
            <div className="relative md:bottom-12">{template.rolodex.introText}</div>
          </motion.div>

          {/* Row-based items */}
          {rows.map((row) => (
            <div key={row.map((item) => item.id).join("|")} className="mb-2">
              {row.map((item, itemIdx) => (
                <span key={item.id}>
                  <RolodexItem
                    item={item}
                    scrollProgress={progress}
                    rolodex1Start={K.ROLODEX_1_START}
                    rolodex1End={K.ROLODEX_1_END}
                    rolodex2Start={K.ROLODEX_2_START}
                    rolodex2End={K.ROLODEX_2_END}
                    diagonalStagger={item.diagonalStagger}
                    isNarrow={isNarrow}
                  />
                  {itemIdx < row.length - 1 && " "}
                </span>
              ))}
            </div>
          ))}
        </motion.div>

        {/* Narrow pause/play button */}
        {isNarrow && (
          <button
            type="button"
            aria-label={isPaused ? template.rolodex.playLabel : template.rolodex.pauseLabel}
            aria-pressed={isPaused}
            onClick={() => setIsPaused((p) => !p)}
            className={cn(
              "pointer-events-auto absolute end-4 bottom-4 flex size-8 items-center justify-center rounded-full",
              "bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            )}
          >
            {isPaused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
          </button>
        )}
      </motion.div>

      {/* Hidden reference div for 3-line measurement (used for scale calc) */}
      <div
        className="pointer-events-none invisible absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div ref={refContentRef} className={cn("max-w-full p-6 py-14", CONTENT_TEXT_CLASSES)}>
          {referenceRows.map((row) => (
            <div key={row.map((item) => item.id).join("|")} className="mb-2">
              {row.map((item, itemIdx) => (
                <span key={item.id}>
                  <span className="inline-block">
                    {item.type === "image" ? (
                      <span className="inline-block size-24" />
                    ) : (
                      item.content1
                    )}
                  </span>
                  {itemIdx < row.length - 1 && " "}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Helpers
function prepareItems(rawItems: RolodexItemData[]): RolodexItemWithStagger[] {
  const maxDiagonal = getMaxDiagonalIndex(rawItems);

  return rawItems.map((item) => ({
    ...item,
    diagonalStagger: maxDiagonal > 0 ? getDiagonalIndex(item.row, item.col) / maxDiagonal : 0,
  }));
}

// Inline icons
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.74609 3C4.7796 3 3.99609 3.7835 3.99609 4.75V19.25C3.99609 20.2165 4.7796 21 5.74609 21H9.24609C10.2126 21 10.9961 20.2165 10.9961 19.25V4.75C10.9961 3.7835 10.2126 3 9.24609 3H5.74609ZM14.7461 3C13.7796 3 12.9961 3.7835 12.9961 4.75V19.25C12.9961 20.2165 13.7796 21 14.7461 21H18.2461C19.2126 21 19.9961 20.2165 19.9961 19.25V4.75C19.9961 3.7835 19.2126 3 18.2461 3H14.7461Z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 5.27368C5 3.56682 6.82609 2.48151 8.32538 3.2973L20.687 10.0235C22.2531 10.8756 22.2531 13.124 20.687 13.9762L8.32538 20.7024C6.82609 21.5181 5 20.4328 5 18.726V5.27368Z" />
    </svg>
  );
}
