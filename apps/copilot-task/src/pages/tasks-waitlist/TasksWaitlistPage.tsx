/**
 * TasksWaitlistPage - Main page component for /tasks/preview.
 *
 * Orchestrates:
 * - Lenis smooth scrolling
 * - LenisScrollProvider context for all children
 * - Section rendering from SECTION_CONFIGS
 * - FloatingBar (sticky CTA)
 * - SkipToContent accessibility
 * - Page view telemetry
 *
 * This is the default export of the module.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/hooks";
import { trackPageView } from "@/lib/telemetry";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { BREAKPOINT } from "./constants";
import { SECTION_CONFIGS } from "./data/sectionConfigs";
import { useLenisSetup } from "./hooks/useLenisSetup";
import { LenisScrollProvider } from "./context/LenisScrollContext";
import { Section } from "./components/Section";
import { SkipToContent } from "./components/SkipToContent";
import { FloatingBar } from "./components/FloatingBar";

import { Section1 } from "./sections/Section1";
import { Section2 } from "./sections/Section2";
import { Section3 } from "./sections/Section3";
import { Section4 } from "./sections/Section4";
import { SectionEnd } from "./sections/SectionEnd";

type SectionContentProps = {
  sectionRef?: React.RefObject<HTMLElement | null>;
};

const SECTION_COMPONENT_MAP: Record<string, React.ComponentType<SectionContentProps>> = {
  "section-1": Section1,
  "section-2": Section2,
  "section-3": Section3,
  "section-4": Section4,
  "section-end": SectionEnd,
};

// ===================== Main Page =====================

export default function TasksWaitlistPage() {
  const template = useTemplateConfig();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefsByIdRef = useRef<Record<string, React.RefObject<HTMLElement | null>>>({});
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

  const mediaIsNarrow = useMediaQuery(BREAKPOINT);
  const viewportOverride = useMemo<"wide" | "narrow" | null>(() => {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);
    const viewport = params.get("viewport");

    return viewport === "wide" || viewport === "narrow" ? viewport : null;
  }, []);

  const isNarrow =
    viewportOverride === "wide" ? false : viewportOverride === "narrow" ? true : mediaIsNarrow;

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { lenis, scroll, progress, direction } = useLenisSetup({
    wrapper: wrapperRef,
    content: contentRef,
  });

  useEffect(() => {
    trackPageView(template.meta.pageViewId);
  }, [template.meta.pageViewId]);

  const visibleSections = useMemo(() => SECTION_CONFIGS.filter((config) => !config.hidden), []);

  const getSectionRef = (sectionId: string) => {
    const existing = sectionRefsByIdRef.current[sectionId];
    if (existing) return existing;

    const created = { current: null } as React.RefObject<HTMLElement | null>;
    sectionRefsByIdRef.current[sectionId] = created;
    return created;
  };

  return (
    <div className="md:rounded-container relative size-full transform-gpu overflow-hidden">
      <div
        ref={wrapperRef}
        className="bg-background-250 absolute inset-0 overflow-x-hidden overflow-y-auto"
      >
        <LenisScrollProvider
          lenisScroll={scroll}
          lenisProgress={progress}
          lenis={lenis}
          lenisDirection={direction}
          viewportHeight={viewportSize.height}
          viewportWidth={viewportSize.width}
          isNarrow={isNarrow}
        >
          <main
            id="storyboard-main"
            ref={contentRef}
            tabIndex={-1}
            className="relative min-h-full min-w-full outline-none"
          >
            <SkipToContent />

            {visibleSections.map((config) => {
              const SectionContent = SECTION_COMPONENT_MAP[config.id];
              if (!SectionContent) return null;

              const sectionRef = getSectionRef(config.id);
              const sectionContentProps =
                config.id === "section-1" || config.id === "section-2" ? { sectionRef } : {};

              return (
                <Section
                  key={config.id}
                  ref={sectionRef}
                  sectionId={config.id}
                  heightMultiplier={config.heightMultiplier}
                  enableScrollProgress={config.enableScrollProgress}
                  scrollTrackingEdge={config.scrollTrackingEdge}
                  className={config.className}
                >
                  <SectionContent {...sectionContentProps} />
                </Section>
              );
            })}
          </main>

          <FloatingBar />
        </LenisScrollProvider>
      </div>
    </div>
  );
}
