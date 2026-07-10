/**
 * Section - A scroll-tracked page section wrapper.
 *
 * Each major block of the waitlist page is wrapped in a <Section>.
 * It handles:
 * - Dynamic height based on viewport (heightMultiplier)
 * - Negative margins for overlapping sections
 * - z-index stacking
 * - Scroll progress tracking via useScrollProgress
 * - Providing SectionContext to children
 */

import React, { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { HEADER_HEIGHT_OFFSET } from "../constants";
import { SECTION_CONFIGS, getEffectiveHeightMultiplier } from "../data/sectionConfigs";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { SectionContext } from "../context/SectionContext";
import { useScrollProgress } from "../hooks/useScrollProgress";

interface SectionProps {
  children: React.ReactNode;
  heightMultiplier?: number;
  className?: string;
  sectionId?: string;
  enableScrollProgress?: boolean;
  scrollTrackingEdge?: [string, string];
  ref?: React.Ref<HTMLElement>;
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    ref.current = value;
  }
}

export function Section({
  children,
  heightMultiplier = 1,
  className,
  sectionId,
  enableScrollProgress = false,
  scrollTrackingEdge = ["top", "top"],
  ref: forwardedRef,
}: SectionProps) {
  const internalRef = useRef<HTMLElement>(null);

  const setSectionRef = useCallback(
    (node: HTMLElement | null) => {
      internalRef.current = node;
      setRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const { lenisScroll, isNarrow } = useLenisScrollContext();
  const shouldReduceMotion = useReducedMotion() === true;
  const template = useTemplateConfig();
  const sectionConfig = sectionId ? SECTION_CONFIGS.find((s) => s.id === sectionId) : undefined;

  const narrowOverrides = isNarrow ? sectionConfig?.narrowOverrides : undefined;
  const reducedMotionOverrides = shouldReduceMotion
    ? sectionConfig?.reducedMotionOverrides
    : undefined;

  const effectiveMultiplier =
    reducedMotionOverrides?.heightMultiplier ??
    narrowOverrides?.heightMultiplier ??
    heightMultiplier;

  const overlapPrevious = sectionConfig?.overlapPrevious;
  const effectiveOverlap = narrowOverrides?.overlapPrevious ?? overlapPrevious;
  const stickyEnabled = narrowOverrides?.sticky ?? true;

  let previousSectionMultiplier = 1;
  let totalMultiplier = effectiveMultiplier;

  if (effectiveOverlap && sectionId) {
    const sectionIndex = SECTION_CONFIGS.findIndex((s) => s.id === sectionId);
    if (sectionIndex > 0) {
      for (let i = sectionIndex - 1; i >= 0; i--) {
        if (!SECTION_CONFIGS[i]?.hidden) {
          previousSectionMultiplier = getEffectiveHeightMultiplier(i);
          break;
        }
      }
      totalMultiplier = effectiveMultiplier + previousSectionMultiplier;
    }
  } else {
    totalMultiplier = effectiveMultiplier;
  }

  const isZeroHeight = effectiveMultiplier === 0;

  let minHeightStyle: string | undefined;
  if (!isZeroHeight && totalMultiplier !== 1) {
    minHeightStyle = `calc((100dvh - ${HEADER_HEIGHT_OFFSET}px) * ${totalMultiplier})`;
  }
  const minHeightClass =
    !isZeroHeight && totalMultiplier === 1 ? "min-h-[100dvh] md:min-h-lenis-wrapper" : undefined;

  const marginTopStyle = effectiveOverlap
    ? `calc((100dvh - ${HEADER_HEIGHT_OFFSET}px) * -${previousSectionMultiplier})`
    : undefined;

  const zIndex = sectionConfig?.zIndex;
  const ariaLabelText = sectionId ? template.accessibility.sectionLabels[sectionId] : undefined;

  const overlapFraction = effectiveOverlap ? previousSectionMultiplier / totalMultiplier : 0;
  const [startEdge, endEdge] = scrollTrackingEdge;

  const startEdgeName = startEdge === "top" ? "start" : "end";
  const endEdgeName = endEdge === "top" ? "start" : "end";

  const overlapPercent = overlapFraction * 100;
  const startOffset =
    effectiveOverlap && overlapFraction > 0
      ? `${overlapPercent}% ${startEdgeName}`
      : `start ${startEdgeName}`;
  const endOffset = `${(overlapFraction + (isZeroHeight ? 1 : effectiveMultiplier) / (totalMultiplier || 1)) * 100}% ${endEdgeName}`;

  const scrollOffset = useMemo<[string, string]>(
    () => [startOffset, endOffset],
    [startOffset, endOffset],
  );

  const { scrollYProgress } = useScrollProgress({
    target: internalRef,
    offset: scrollOffset,
    lenisScroll,
  });

  const sectionProgress = enableScrollProgress ? scrollYProgress : null;

  const contextValue = useMemo(
    () => ({ scrollYProgress: sectionProgress, sticky: stickyEnabled, sectionRef: internalRef }),
    [sectionProgress, stickyEnabled],
  );

  return (
    <SectionContext value={contextValue}>
      <section
        ref={setSectionRef}
        aria-label={ariaLabelText}
        tabIndex={-1}
        className={cn(
          "pointer-events-none relative outline-none select-text",
          minHeightClass,
          className,
        )}
        data-section-id={sectionId}
        style={{
          ...(marginTopStyle && { marginTop: marginTopStyle }),
          ...(minHeightStyle && { minHeight: minHeightStyle }),
          ...(zIndex !== undefined && { zIndex }),
        }}
      >
        {children}
      </section>
    </SectionContext>
  );
}
