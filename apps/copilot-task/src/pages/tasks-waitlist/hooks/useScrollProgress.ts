/**
 * useScrollProgress - Scroll-driven animation progress
 *
 * Calculates a normalized 0-1 progress value based on scroll position,
 * using Lenis scroll values and customizable offset anchors.
 *
 * Supports both vertical and horizontal orientations, percentage-based
 * offsets, and named edges (start/center/end).
 */

import { useCallback, useEffect } from "react";
import { useMotionValue } from "framer-motion";
import type { MotionValue } from "framer-motion";
import type { ScrollProgressOptions } from "../types";

type Edge = "start" | "center" | "end" | string;
type ParsedEdge = [Edge, Edge];

export function useScrollProgress({
  target,
  offset,
  lenisScroll,
  orientation = "vertical",
  debug = false,
  negativeMarginOffset = 0,
}: ScrollProgressOptions): { scrollYProgress: MotionValue<number> } {
  const scrollYProgress = useMotionValue(0);
  const parseOffset = useCallback((offsetStr: string): ParsedEdge => {
    const parts = offsetStr.trim().split(/\s+/);

    const isValidEdge = (edge?: string): boolean => {
      if (edge === undefined) return false;
      if (["start", "end", "center"].includes(edge)) return true;
      return /^\d+(\.\d+)?%$/.test(edge);
    };

    if (parts.length !== 2 || !isValidEdge(parts[0]) || !isValidEdge(parts[1])) {
      console.warn(
        `Invalid offset format: "${offsetStr}". Expected "edge edge" where edge is start|center|end|N%`,
      );
      return ["start", "start"];
    }

    return [parts[0], parts[1]] as ParsedEdge;
  }, []);
  const computeProgress = useCallback(
    (currentScroll: number) => {
      const element = target.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const [startOffsetStr, endOffsetStr] = offset;
      const [startElementEdge, startViewportEdge] = parseOffset(startOffsetStr);
      const [endElementEdge, endViewportEdge] = parseOffset(endOffsetStr);

      if (debug) {
        console.group(
          `[useScrollProgress ${orientation.toUpperCase()}] Offset: ${JSON.stringify(offset)}`,
        );
        console.log("Parsed Start:", {
          elementEdge: startElementEdge,
          viewportEdge: startViewportEdge,
        });
        console.log("Parsed End:", {
          elementEdge: endElementEdge,
          viewportEdge: endViewportEdge,
        });
      }

      const resolveElementEdge = (edge: Edge): number => {
        let position: number;

        if (edge.endsWith("%")) {
          const percent = parseFloat(edge);
          if (Number.isNaN(percent)) {
            console.warn(`Invalid percentage value: "${edge}"`);
            position = orientation === "vertical" ? rect.top : rect.left;
          } else {
            const dimension = orientation === "vertical" ? rect.height : rect.width;
            position =
              (orientation === "vertical" ? rect.top : rect.left) + (dimension * percent) / 100;
          }
        } else {
          switch (edge) {
            case "start":
              position = orientation === "vertical" ? rect.top : rect.left;
              break;
            case "end":
              position = orientation === "vertical" ? rect.bottom : rect.right;
              break;
            case "center":
              position =
                orientation === "vertical"
                  ? rect.top + rect.height / 2
                  : rect.left + rect.width / 2;
              break;
            default:
              position = orientation === "vertical" ? rect.top : rect.left;
          }
        }

        return position + negativeMarginOffset;
      };

      const resolveViewportEdge = (edge: Edge): number => {
        const viewportSize = orientation === "vertical" ? window.innerHeight : window.innerWidth;

        if (edge.endsWith("%")) {
          const percent = parseFloat(edge);
          if (Number.isNaN(percent)) {
            console.warn(`Invalid percentage value: "${edge}"`);
            return 0;
          }
          return (viewportSize * percent) / 100;
        }

        switch (edge) {
          case "start":
            return 0;
          case "end":
            return viewportSize;
          case "center":
            return viewportSize / 2;
          default:
            return 0;
        }
      };

      const elementStartPixel = resolveElementEdge(startElementEdge);
      const elementStartInScrollSpace = currentScroll + elementStartPixel;
      const viewportStartPixel = resolveViewportEdge(startViewportEdge);
      const startScrollPosition = elementStartInScrollSpace - viewportStartPixel;
      const elementEndPixel = resolveElementEdge(endElementEdge);
      const elementEndInScrollSpace = currentScroll + elementEndPixel;
      const viewportEndPixel = resolveViewportEdge(endViewportEdge);
      const endScrollPosition = elementEndInScrollSpace - viewportEndPixel;

      if (debug) {
        console.log("=== MEASUREMENT DEBUG ===");
        console.log("rect:", {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
        });
        console.log("window:", {
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        });
        console.log("negativeMarginOffset applied:", negativeMarginOffset);
        console.log("Element Edge Start (corrected rect.top):", elementStartPixel);
        console.log("Element Edge Start (in scroll space):", elementStartInScrollSpace);
        console.log("Viewport Edge Start:", viewportStartPixel);
        console.log("Start Scroll Position:", startScrollPosition);
        console.log("Element Edge End (corrected):", elementEndPixel);
        console.log("End Scroll Position:", endScrollPosition);
        console.log("Current Scroll:", currentScroll);
        console.log("======================");
      }

      const scrollRange = endScrollPosition - startScrollPosition;
      let rawProgress: number;

      if (debug) {
        console.log("Range:", scrollRange);
        if (scrollRange === 0) console.log("Animation Type: INSTANT");
        else if (scrollRange < 0) console.log("Animation Type: REVERSE (normalized to 0->1)");
        else console.log("Animation Type: NORMAL");
      }

      if (scrollRange !== 0) {
        const linearProgress = (currentScroll - startScrollPosition) / scrollRange;
        rawProgress = scrollRange < 0 ? 1 - linearProgress : linearProgress;

        if (debug) {
          console.log("Raw Progress:", linearProgress);
          console.log("Normalized Progress:", rawProgress);
        }
      } else {
        rawProgress = currentScroll >= startScrollPosition ? 1 : 0;
        if (debug) console.log("Instant Progress:", rawProgress);
      }

      const clampedProgress = Math.max(0, Math.min(1, rawProgress));

      if (debug) {
        console.log("Clamped Progress:", clampedProgress);
        console.groupEnd();
      }

      scrollYProgress.set(clampedProgress);
    },
    [target, offset, parseOffset, orientation, debug, scrollYProgress, negativeMarginOffset],
  );

  useEffect(() => {
    scrollYProgress.set(-1);
    computeProgress(lenisScroll.get());
    requestAnimationFrame(() => {
      computeProgress(lenisScroll.get());
    });
  }, [computeProgress, lenisScroll, scrollYProgress]);

  useEffect(() => {
    let lastScroll = lenisScroll.get();
    return lenisScroll.on("change", (newScroll: number) => {
      if (Math.abs(newScroll - lastScroll) >= 1) {
        computeProgress(newScroll);
        lastScroll = newScroll;
      }
    });
  }, [lenisScroll, computeProgress]);

  useEffect(() => {
    const handleResize = () => {
      computeProgress(lenisScroll.get());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [lenisScroll, computeProgress]);

  return { scrollYProgress };
}
