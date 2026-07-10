/**
 * Section layout configuration for the Tasks Waitlist page.
 *
 * Each section defines how it should be rendered: height multiplier
 * (relative to viewport), z-index stacking, scroll progress tracking,
 * and responsive overrides for narrow viewports and reduced motion.
 */

import type { SectionConfig } from "../types";

export const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "section-1",
    componentPath: "./sections/section-1",
    heightMultiplier: 2,
    zIndex: 5,
    ariaLabel: "tasks.waitList.section1.ariaLabel",
    narrowOverrides: { heightMultiplier: 0, sticky: false },
    reducedMotionOverrides: { heightMultiplier: 1 },
  },
  {
    id: "section-2",
    componentPath: "./sections/section-2",
    heightMultiplier: 6,
    overlapPrevious: true,
    zIndex: 4,
    enableScrollProgress: true,
    scrollTrackingEdge: ["top", "top"],
    ariaLabel: "tasks.waitList.section2.ariaLabel",
    narrowOverrides: {
      heightMultiplier: 0,
      sticky: false,
      overlapPrevious: false,
    },
  },
  {
    id: "section-3",
    componentPath: "./sections/section-3",
    heightMultiplier: 4,
    zIndex: 2,
    enableScrollProgress: true,
    scrollTrackingEdge: ["bottom", "bottom"],
    ariaLabel: "tasks.waitList.section3.ariaLabel",
    narrowOverrides: { heightMultiplier: 0, sticky: false },
  },
  {
    id: "section-4",
    componentPath: "./sections/section-4",
    heightMultiplier: 8,
    overlapPrevious: true,
    zIndex: 1,
    enableScrollProgress: true,
    scrollTrackingEdge: ["bottom", "bottom"],
    ariaLabel: "tasks.waitList.section4.ariaLabel",
    narrowOverrides: {
      heightMultiplier: 0,
      sticky: false,
      overlapPrevious: false,
    },
  },
  {
    id: "section-end",
    componentPath: "./sections/section-end",
    heightMultiplier: 0,
    ariaLabel: "tasks.waitList.sectionEnd.ariaLabel",
    narrowOverrides: { heightMultiplier: 0, sticky: false },
  },
];

/**
 * Recursively compute the effective height multiplier for a section,
 * summing in previous sections when `overlapPrevious` is true.
 */
export function getEffectiveHeightMultiplier(sectionIndex: number): number {
  if (sectionIndex < 0 || sectionIndex >= SECTION_CONFIGS.length) return 1;

  const multiplier = SECTION_CONFIGS[sectionIndex]?.heightMultiplier ?? 1;

  if (!(SECTION_CONFIGS[sectionIndex]?.overlapPrevious ?? false)) {
    return multiplier;
  }

  for (let i = sectionIndex - 1; i >= 0; i--) {
    if (!SECTION_CONFIGS[i]?.hidden) {
      const previousMultiplier = getEffectiveHeightMultiplier(i);
      return multiplier + previousMultiplier;
    }
  }

  return multiplier;
}
