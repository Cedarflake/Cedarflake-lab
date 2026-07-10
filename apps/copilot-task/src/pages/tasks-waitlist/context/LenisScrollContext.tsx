/**
 * Lenis Scroll Context
 *
 * Provides smooth scrolling state (Lenis instance, scroll position,
 * progress, direction) and viewport dimensions to all child components.
 */

import React, { useMemo } from "react";
import type { MotionValue } from "framer-motion";
import type { LenisInstance } from "../types";

import { LenisScrollContext } from "./lenisScrollContextInternal";

// ===================== Provider =====================

interface LenisScrollProviderProps {
  lenisScroll: MotionValue<number>;
  lenisProgress: MotionValue<number>;
  lenis: LenisInstance | null;
  lenisDirection: MotionValue<number>;
  viewportHeight: number;
  viewportWidth: number;
  isNarrow: boolean;
  children: React.ReactNode;
}

export function LenisScrollProvider({
  lenisScroll,
  lenisProgress,
  lenis,
  lenisDirection,
  viewportHeight,
  viewportWidth,
  isNarrow,
  children,
}: LenisScrollProviderProps) {
  const value = useMemo(
    () => ({
      lenisScroll,
      lenisProgress,
      lenis,
      lenisDirection,
      viewportHeight,
      viewportWidth,
      isNarrow,
    }),
    [lenisScroll, lenisProgress, lenis, lenisDirection, viewportHeight, viewportWidth, isNarrow],
  );

  return <LenisScrollContext value={value}>{children}</LenisScrollContext>;
}
