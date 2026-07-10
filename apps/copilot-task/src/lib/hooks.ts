/**
 * Mock: Common hooks.
 */

import { useEffect, useReducer, useRef } from "react";

/**
 * Returns true if the user prefers reduced motion.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useReducer(
    (_: boolean, next: boolean) => next,
    false,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}

/**
 * Media query hook. Returns true when the query matches.
 * Supports Tailwind breakpoint names like "md", "lg", etc.
 */
const BREAKPOINT_MAP: Record<string, string> = {
  sm: "(max-width: 639px)",
  md: "(max-width: 767px)",
  lg: "(max-width: 1023px)",
  xl: "(max-width: 1279px)",
};

export function useMediaQuery(query: string): boolean {
  const resolved = BREAKPOINT_MAP[query] ?? query;
  const [matches, setMatches] = useReducer(
    (_: boolean, next: boolean) => next,
    typeof window !== "undefined" ? window.matchMedia(resolved).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(resolved);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [resolved]);

  return matches;
}

/**
 * Simplified ResizeObserver hook.
 */
export function useResizeObserver(
  callback: () => void,
  options?: { initialize?: boolean },
  element?: HTMLElement | null,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const target = element ?? document.documentElement;
    if (!target) return;

    if (options?.initialize !== false) {
      callbackRef.current();
    }

    const observer = new ResizeObserver(() => {
      callbackRef.current();
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
}
