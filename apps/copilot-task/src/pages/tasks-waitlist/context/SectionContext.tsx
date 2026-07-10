/**
 * Section Context
 *
 * Provides scroll progress and sticky state for the current section.
 * Each <Section> wraps its children in this context so inner components
 * can access section-level scroll progress.
 */

import { createContext, use } from "react";
import type { RefObject } from "react";
import type { SectionContextValue } from "../types";

const defaultRef: RefObject<HTMLElement | null> = { current: null };

export const SectionContext = createContext<SectionContextValue>({
  scrollYProgress: null,
  sticky: true,
  sectionRef: defaultRef,
});

/**
 * Access the scroll progress and sticky state of the enclosing section.
 */
export function useSectionContext(): SectionContextValue {
  return use(SectionContext);
}
