/**
 * SectionEnd - Final CTA section.
 *
 * A dark-themed section with the Copilot Tasks logo,
 * a closing headline, and the final waitlist CTA button.
 */

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { CONTENT_MAX_WIDTH } from "../constants";
import { CopilotTasksLogo } from "../icons";
import { WaitlistButton } from "../components/WaitlistButton";
import { useLenisScrollContext } from "../context/useLenisScrollContext";
import { useScrollProgress } from "../hooks/useScrollProgress";
import { useMotionValueEvent } from "framer-motion";

export function SectionEnd() {
  const template = useTemplateConfig();
  const ref = useRef<HTMLDivElement>(null);
  const { lenisScroll } = useLenisScrollContext();

  const { scrollYProgress } = useScrollProgress({
    target: ref,
    offset: ["start end", "start start"],
    lenisScroll,
  });

  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setVisible(v > 0);
  });

  return (
    <div
      ref={ref}
      className="bg-background-150 dark:bg-background-250 flex justify-center px-4 sm:px-8"
    >
      <div
        className={cn("flex w-full flex-col items-center gap-12 py-4 sm:pb-12", CONTENT_MAX_WIDTH)}
      >
        {/* Dark card */}
        <div
          id="waitlist"
          data-section-end-card
          className="bg-background-800 squircle-24 dark:bg-background-100 relative z-[60] mt-8 flex h-[max(50vh,500px)] w-full flex-col items-center px-4 sm:-mt-22 sm:px-8"
        >
          <div className="text-foreground-250 dark:text-foreground-650 relative flex size-full flex-col items-center justify-center gap-8 p-5 md:gap-10">
            {/* Headline */}
            <div className="font-display-agent px-8 text-center text-xl sm:text-3xl md:text-4xl">
              {template.finalCta.headline}
            </div>

            {/* Logo */}
            <div className="relative w-full px-4">
              <CopilotTasksLogo
                className="h-auto w-full"
                title={template.brand.name}
              />
            </div>

            {/* CTA */}
            <div className="pointer-events-auto relative mt-4 min-h-14">
              {visible && <WaitlistButton placement="footer" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
