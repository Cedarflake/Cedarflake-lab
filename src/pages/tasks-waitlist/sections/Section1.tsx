/**
 * Section1 - Hero section.
 *
 * Full-viewport intro with a background photo, brand wordmark in the top-left,
 * headline and CTA at the bottom. On wide viewports, the background scales/blurs
 * and content fades as the user scrolls down.
 */

import React from "react";
import { motion, useMotionValue, useTransform, useMotionTemplate } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";
import { useThemeValue } from "@/lib/theme";
import { defaultEasing } from "@/lib/easing";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { useSectionContext } from "../context/SectionContext";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { useScrollProgress } from "../hooks/useScrollProgress";
import { StickyContainer } from "../components/StickyContainer";
import { CopilotWordmark } from "../icons";
import { WaitlistButton } from "../components/WaitlistButton";
import { ScrollIndicator } from "../components/ScrollIndicator";
import { ShimmerText } from "../components/ShimmerText";

interface Section1Props {
  sectionRef?: React.RefObject<HTMLElement | null>;
}

export function Section1({ sectionRef: externalSectionRef }: Section1Props) {
  const { sticky, sectionRef: contextSectionRef } = useSectionContext();
  const { isNarrow, lenisScroll } = useLenisScrollContext();
  const shouldReduceMotion = useReducedMotion() === true;
  const template = useTemplateConfig();
  const theme = useThemeValue();
  const sectionRef = externalSectionRef ?? contextSectionRef;
  const { scrollYProgress: progress } = useScrollProgress({
    target: sectionRef,
    offset: ["start start", "end start"],
    lenisScroll,
  });

  // Wide animations
  const outerOpacity = useTransform(progress, [0, 0.999, 1], [1, 1, 0], { ease: defaultEasing });
  const bgScale = useTransform(progress, [0, 1], [1, 1.5], { ease: defaultEasing });
  const bgOpacity = useTransform(progress, [0, 0.5, 1], [1, 1, 0], { ease: defaultEasing });
  const blurPx = useTransform(progress, [0, 1], [0, 10], { ease: defaultEasing });
  const bgFilter = useMotionTemplate`blur(${blurPx}px)`;
  const contentFadeOpacity = useTransform(progress, [0, 0.5, 1], [1, 0, 0], {
    ease: defaultEasing,
  });
  const contentDisplay = useTransform(progress, [0, 0.999, 1], ["flex", "flex", "none"], {
    ease: defaultEasing,
  });

  // Reduced motion / narrow fallbacks
  const rmOuterOpacity = useTransform(progress, [0, 0.999, 1], [1, 1, 0]);
  const rmContentOpacity = useTransform(progress, [0, 0.999, 1], [1, 1, 0]);
  const rmContentDisplay = useTransform(progress, [0, 0.999, 1], ["flex", "flex", "none"]);
  const staticOne = useMotionValue(1);
  const staticBlur = useMotionValue("blur(0px)");

  const isSimple = isNarrow || shouldReduceMotion;
  const outerOp = shouldReduceMotion ? rmOuterOpacity : outerOpacity;
  const bgSc = isSimple ? staticOne : bgScale;
  const bgOp = isSimple ? staticOne : bgOpacity;
  const bgFi = isSimple ? staticBlur : bgFilter;
  const contentOp = shouldReduceMotion ? rmContentOpacity : contentFadeOpacity;
  const contentDisp = shouldReduceMotion ? rmContentDisplay : contentDisplay;

  return (
    <StickyContainer sticky={sticky} className="relative">
      <div className={cn("size-full", sticky ? "fixed inset-0" : "relative")}>
        <motion.div
          className="dark:bg-background-150 @container/section-one absolute size-full overflow-hidden bg-[#423B3E] will-change-[opacity]"
          style={{ opacity: outerOp }}
        >
          {/* Background image layer */}
          <motion.div
            className="bg-background-250 dark:bg-background-250 absolute inset-0 isolate will-change-[transform,opacity]"
            style={{ scale: bgSc, opacity: bgOp, filter: bgFi }}
          >
            <img
              className="absolute inset-0 size-full object-cover object-right rtl:-scale-x-100"
              src={theme === "dark" ? template.hero.backgroundDark : template.hero.backgroundLight}
              alt="Background"
            />
            <div className="to-background-250 absolute bottom-0 h-32 w-full bg-gradient-to-b from-transparent" />
          </motion.div>

          {/* Content layer */}
          <motion.div
            className="text-foreground-800 absolute inset-0 flex flex-col items-start justify-between overflow-hidden will-change-[opacity]"
            style={{ opacity: contentOp, display: contentDisp }}
          >
            {/* Top: Copilot wordmark */}
            <div className="mt-16 p-5 @[768px]/section-one:mt-0 @[768px]/section-one:px-12 @[768px]/section-one:py-16">
              <CopilotWordmark
                className="h-[64px] w-[196px] origin-top-left scale-90 @[768px]/section-one:scale-100 rtl:origin-top-right"
                title={template.brand.wordmarkAlt}
              />
            </div>

            {/* Bottom: headline + description + CTA + scroll indicator */}
            <div className="absolute bottom-0 mb-0 flex w-full flex-col flex-wrap justify-between gap-x-10 gap-y-4 p-5 @[768px]/section-one:flex-row @[768px]/section-one:items-end @[768px]/section-one:gap-8 @[768px]/section-one:p-12 @[768px]/section-one:pe-6">
              {/* Headline */}
              <div className="text-3xl-medium @[768px]/section-one:text-4xl-medium inline-block max-w-[min(420px,75%)] shrink-0 grow @[768px]/section-one:flex @[768px]/section-one:max-w-full @[768px]/section-one:flex-col @[768px]/section-one:!text-[60px] @[768px]/section-one:!leading-[60px]">
                <span>{template.hero.headlineTop}</span>
                <span>{template.hero.headlineBottom}</span>
              </div>

              {/* Wide: centered scroll indicator */}
              <div className="mt-1 hidden grow self-end @[1280px]/section-one:flex">
                <ScrollHint stacked />
              </div>

              {/* Description + CTA */}
              <div className="text-md flex grow flex-col gap-4 md:gap-2.5 @[1024px]/section-one:max-w-[420px]">
                <div className="max-w-[420px] @[1024px]/section-one:max-w-full">
                  {template.hero.description}
                </div>
                <div className="pointer-events-auto flex min-h-14 items-center justify-between gap-5">
                  <WaitlistButton placement="home" />
                  <div className="flex @[1280px]/section-one:hidden @[1280px]/section-one:grow">
                    <ScrollHint />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </StickyContainer>
  );
}

function ScrollHint({ stacked = false }: { stacked?: boolean }) {
  const template = useTemplateConfig();

  return (
    <div className={stacked ? "flex flex-col items-center" : "flex items-center gap-3"}>
      <ShimmerText
        className={cn(
          "max-w-32 flex-1 shrink-0 opacity-60",
          stacked && "mb-1.5 text-center opacity-40",
        )}
        isActive={false}
      >
        <div className="text-base-dense">{template.hero.scrollIndicator}</div>
      </ShimmerText>
      <ScrollIndicator size={stacked ? "size-10" : "size-8"} gap={stacked ? "-mt-7" : "-mt-6"} />
    </div>
  );
}
