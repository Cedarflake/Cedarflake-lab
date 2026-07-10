/**
 * Lenis scroll context (shared instance).
 *
 * Split out to keep Fast Refresh happy: component modules should only export components.
 */

import { createContext } from "react";
import type { LenisScrollContextValue } from "../types";

export const LenisScrollContext = createContext<LenisScrollContextValue | null>(null);
