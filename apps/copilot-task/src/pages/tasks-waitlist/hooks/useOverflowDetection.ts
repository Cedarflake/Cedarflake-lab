/**
 * useOverflowDetection - Detect when content overflows its container.
 *
 * Compares the scrollWidth of childRef against the offsetWidth of
 * containerRef. Uses a threshold to trigger and hysteresis to prevent
 * rapid toggling near the boundary.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface UseOverflowDetectionOptions {
  containerRef: RefObject<HTMLElement | null>;
  childRef: RefObject<HTMLElement | null>;
  threshold?: number;
  hysteresis?: number;
}

export function useOverflowDetection({
  containerRef,
  childRef,
  threshold = 0.9,
  hysteresis = 0.05,
}: UseOverflowDetectionOptions): boolean {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const lastStateRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || !childRef.current) return;

    const container = containerRef.current;
    const child = childRef.current;

    const checkOverflow = () => {
      const containerWidth = container.offsetWidth;
      const childScrollWidth = child.scrollWidth;

      const triggerWidth = containerWidth * threshold;
      const resetWidth = containerWidth * (threshold + hysteresis);

      let shouldUpdate = false;
      let newState = lastStateRef.current;

      if (lastStateRef.current) {
        if (childScrollWidth < resetWidth) {
          shouldUpdate = true;
          newState = false;
        }
      } else {
        if (childScrollWidth >= triggerWidth) {
          shouldUpdate = true;
          newState = true;
        }
      }

      if (shouldUpdate) {
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(() => {
          lastStateRef.current = newState;
          setIsOverflowing(newState);
          debounceTimerRef.current = null;
        }, 25);
      }
    };

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(container);
    observer.observe(child);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      observer.disconnect();
    };
  }, [containerRef, childRef, threshold, hysteresis]);

  return isOverflowing;
}
