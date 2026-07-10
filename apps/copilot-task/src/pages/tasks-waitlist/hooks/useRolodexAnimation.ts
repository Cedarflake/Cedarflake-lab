/**
 * useRolodexAnimation - Time-based rolodex flip animation for narrow viewports.
 *
 * When the viewport is too narrow for scroll-driven animation, this hook
 * drives the rolodex progress with a time-based loop instead. It cycles
 * through: hold -> flip1 -> hold -> flip2 -> hold -> reset, repeating.
 */

import { useEffect, useRef } from "react";
import { useMotionValue } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { SCROLL_KEYFRAMES as K, STAGGER_CONFIG, ANIMATION_TIMING } from "../constants";

interface UseRolodexAnimationOptions {
  paused?: boolean;
}

export function useRolodexAnimation(options: UseRolodexAnimationOptions = {}): MotionValue<number> {
  const { paused = false } = options;
  const animationProgress = useMotionValue<number>(K.INTRO_END);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (paused) return;

    const { holdDurationMs, flipDurationMs, initialDelayMs } = ANIMATION_TIMING;
    const totalCycleDuration = holdDurationMs * 3 + flipDurationMs * 3;
    const maxStagger = STAGGER_CONFIG.maxStagger;
    const afterFlip2End = K.ROLODEX_2_END + maxStagger;
    const afterResetEnd = K.RESET_END + maxStagger;
    const holdMidpoint = (K.ROLODEX_1_END + maxStagger + K.ROLODEX_2_START) / 2;

    let cumulativeTime = 0;
    const timeline: [number, number][] = [];

    const addKeyframe = (durationMs: number, progressValue: number) => {
      cumulativeTime += durationMs;
      timeline.push([cumulativeTime, progressValue]);
    };

    // Start at INTRO_END
    timeline.push([0, K.INTRO_END]);

    // Hold -> Flip 1 Start
    addKeyframe(holdDurationMs, K.ROLODEX_1_START);
    // Flip 1 -> Hold midpoint
    addKeyframe(flipDurationMs, holdMidpoint);
    // Hold -> Flip 2 Start
    addKeyframe(holdDurationMs, K.ROLODEX_2_START);
    // Flip 2 -> After Flip 2 End
    addKeyframe(flipDurationMs, afterFlip2End);
    // Hold -> Reset Start
    addKeyframe(holdDurationMs, K.RESET_START);
    // Reset -> After Reset End
    addKeyframe(flipDurationMs, afterResetEnd);

    function getProgressAtTime(elapsedMs: number): number {
      const cycleTime = elapsedMs % totalCycleDuration;

      for (let i = 1; i < timeline.length; i++) {
        const [prevTime, prevProgress] = timeline[i - 1];
        const [currTime, currProgress] = timeline[i];

        if (cycleTime <= currTime) {
          const segmentRatio = (cycleTime - prevTime) / (currTime - prevTime);
          return prevProgress + segmentRatio * (currProgress - prevProgress);
        }
      }

      return timeline[timeline.length - 1][1];
    }

    let startTime: number | null = null;
    let rafId = 0;

    const tick = (timestamp: number) => {
      startTime ??= timestamp - elapsedRef.current;

      const elapsed = timestamp - startTime;
      elapsedRef.current = elapsed;

      animationProgress.set(getProgressAtTime(elapsed));
      rafId = requestAnimationFrame(tick);
    };

    const delayTimeout = setTimeout(() => {
      rafId = requestAnimationFrame(tick);
    }, initialDelayMs);

    return () => {
      clearTimeout(delayTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [animationProgress, paused]);

  return animationProgress;
}
