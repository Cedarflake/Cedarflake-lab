/**
 * ScrollIndicator - Animated scroll-down hint with bouncing chevrons.
 *
 * Displays two stacked chevron-down icons that animate in sequence
 * to indicate the user should scroll down. Respects reduced motion.
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks";
import { ChevronDownIcon } from "../icons";

interface ScrollIndicatorProps {
  className?: string;
  color?: string;
  size?: string;
  gap?: string;
  stagger?: number;
}

export function ScrollIndicator({
  className,
  color = "text-foreground-800/40",
  size = "size-10",
  gap = "-mt-6",
  stagger = 0.3,
}: ScrollIndicatorProps) {
  const shouldReduceMotion = useReducedMotion();
  const iconClass = cn(size, color);

  const loopTransition = {
    duration: 2,
    ease: "easeInOut" as const,
    repeat: Infinity,
  };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {/* First chevron */}
      <motion.div
        animate={{
          opacity: shouldReduceMotion ? 1 : [0.25, 1, 1, 0.25, 0.25],
        }}
        transition={shouldReduceMotion ? {} : { ...loopTransition, times: [0, 0.15, 0.3, 0.7, 1] }}
      >
        <ChevronDownIcon className={iconClass} />
      </motion.div>

      {/* Second chevron (staggered) */}
      <motion.div
        className={gap}
        animate={{
          opacity: shouldReduceMotion ? 1 : [0.25, 1, 1, 0.25, 0.25],
        }}
        transition={
          shouldReduceMotion
            ? {}
            : {
                ...loopTransition,
                times: [0, 0.15, 0.3, 0.7, 1],
                delay: stagger,
              }
        }
      >
        <ChevronDownIcon className={iconClass} />
      </motion.div>
    </div>
  );
}
