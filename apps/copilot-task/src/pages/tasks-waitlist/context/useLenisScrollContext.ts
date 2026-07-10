/**
 * Access the Lenis scroll context. Must be used within a LenisScrollProvider.
 */

import { use } from "react";
import type { LenisScrollContextValue } from "../types";
import { LenisScrollContext } from "./lenisScrollContextInternal";

export function useLenisScrollContext(): LenisScrollContextValue {
  const context = use(LenisScrollContext);
  if (!context) {
    throw new Error("useLenisScrollContext must be used within a LenisScrollProvider");
  }
  return context;
}
