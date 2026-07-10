/**
 * useLenisSetup - Initialize and manage a Lenis smooth scroll instance.
 *
 * Creates a Lenis instance on the provided wrapper/content refs,
 * and exposes reactive motion values for scroll position, progress,
 * and direction. Handles raf loop management and cleanup.
 */

import { useEffect, useReducer } from "react";
import { useMotionValue } from "framer-motion";
import Lenis from "lenis";
import type { RefObject } from "react";

interface UseLenisSetupOptions {
  wrapper: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  orientation?: "vertical" | "horizontal";
}

export function useLenisSetup({
  wrapper,
  content,
  orientation = "vertical",
}: UseLenisSetupOptions) {
  const scroll = useMotionValue(0);
  const progress = useMotionValue(0);
  const direction = useMotionValue(0);
  const [lenis, setLenis] = useReducer((_: Lenis | null, next: Lenis | null) => next, null);

  useEffect(() => {
    if (!wrapper.current || !content.current) return;

    const gestureOrientation = orientation === "horizontal" ? "both" : "vertical";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const instance = new Lenis({
      wrapper: wrapper.current,
      content: content.current,
      lerp: prefersReducedMotion ? 1 : 0.4,
      duration: prefersReducedMotion ? 0 : 1,
      smoothWheel: !prefersReducedMotion,
      wheelMultiplier: 2,
      touchMultiplier: 1.2,
      orientation,
      gestureOrientation,
      infinite: false,
    });

    setLenis(instance);

    let lastScroll = instance.scroll;
    let lastProgress = instance.limit > 0 ? instance.scroll / instance.limit : 0;
    let lastDirection = instance.direction;

    scroll.set(lastScroll);
    progress.set(lastProgress);
    direction.set(lastDirection);

    let rafId: number;

    function onFrame(time: number) {
      instance.raf(time);

      const currentScroll = instance.scroll;
      const currentLimit = instance.limit;
      const currentProgress = currentLimit > 0 ? currentScroll / currentLimit : 0;
      const currentDirection = instance.direction;
      const scrollChanged = Math.abs(currentScroll - lastScroll) >= 0.5;
      const progressChanged = Math.abs(currentProgress - lastProgress) >= 1e-4;
      const directionChanged = currentDirection !== lastDirection;

      if (scrollChanged) {
        scroll.set(currentScroll);
        lastScroll = currentScroll;
      }
      if (progressChanged) {
        progress.set(currentProgress);
        lastProgress = currentProgress;
      }
      if (directionChanged) {
        direction.set(currentDirection);
        lastDirection = currentDirection;
      }

      rafId = requestAnimationFrame(onFrame);
    }

    rafId = requestAnimationFrame(onFrame);

    return () => {
      cancelAnimationFrame(rafId);
      instance.destroy();
      setLenis(null);
    };
  }, [wrapper, content, orientation]);

  return { lenis, scroll, progress, direction };
}
