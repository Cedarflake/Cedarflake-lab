/**
 * Copilot Tasks Waitlist Page - Constants
 *
 * All magic numbers, keyframes, and configuration values used across the page.
 */

// ===================== Layout =====================

export const BREAKPOINT = "md";

/** Viewport inset offset (in pixels) used by section height/overlap math.**/
export const HEADER_HEIGHT_OFFSET = 0;

/** Max width class for main content areas */
export const CONTENT_MAX_WIDTH = "max-w-[920px]";

/** Max width class for the wide carousel grid */
export const WIDE_MAX_WIDTH = "max-w-[1840px]";

/** Whether to show legacy content blocks */
export const SHOW_LEGACY_CONTENT = false;

/** Whether to show the logo icon next to the wordmark */
export const SHOW_LOGO_ICON = false;

// ===================== Assets =====================

/** Base path for static assets (with trailing slash removed) */
export const STATIC_ASSET_PREFIX = "/static/cmc".replace(/\/$/, "");

// ===================== Section 2 - Rolodex Scroll Keyframes =====================

/**
 * Scroll progress keyframes for the rolodex animation (Section 2).
 * Values from 0 to 1 represent normalized scroll progress through the section.
 */
export const SCROLL_KEYFRAMES = {
  /** Intro fade-in starts */
  INTRO_START: 0,
  /** Intro fade-in ends */
  INTRO_END: 0.1,

  /** First rolodex flip starts */
  ROLODEX_1_START: 0.15,
  /** First rolodex flip ends */
  ROLODEX_1_END: 0.25,

  /** Second rolodex flip starts */
  ROLODEX_2_START: 0.4,
  /** Second rolodex flip ends */
  ROLODEX_2_END: 0.5,

  /** Hold on third content starts */
  HOLD_3_START: 0.5,
  /** Hold on third content ends */
  HOLD_3_END: 0.65,

  /** Preparation for scale-down transition */
  SCALE_PREP_END: 0.7,
  /** Scale transition starts */
  SCALE_START: 0.8,
  /** Scale transition ends */
  SCALE_END: 1,

  /** Reset animation starts (narrow mode only) */
  RESET_START: 0.7,
  /** Reset animation ends (narrow mode only) */
  RESET_END: 0.85,
} as const;

// ===================== Section 2 - Stagger & Layout =====================

/** Configuration for diagonal stagger timing */
export const STAGGER_CONFIG = {
  /** Maximum stagger delay offset for rolodex items */
  maxStagger: 0.1,
} as const;

/** Configuration for layout switching */
export const LAYOUT_CONFIG = {
  /** Container fill threshold to switch from 3-line to 5-line layout */
  layoutSwitchThreshold: 0.9,
} as const;

/** Timing for narrow-mode auto-playing rolodex animation */
export const ANIMATION_TIMING = {
  /** How long to hold each content state (milliseconds) */
  holdDurationMs: 1400,
  /** Duration of each flip transition (milliseconds) */
  flipDurationMs: 800,
  /** Initial delay before animation starts (milliseconds) */
  initialDelayMs: 200,
} as const;

// ===================== Section 4 - Carousel Keyframes =====================

/**
 * Scroll progress keyframes for the image carousel (Section 4).
 * Defines timing for three images transitioning through grid positions.
 */
export const CAROUSEL_KEYFRAMES = {
  PART_1_IMAGE_1_INTRO_START: 0,
  PART_1_IMAGE_1_INTRO_END: 0.08,
  PART_1_IMAGE_2_INTRO_START: 0.03,
  PART_1_IMAGE_2_INTRO_END: 0.08,
  PART_1_HOLD_START: 0.08,
  PART_1_HOLD_END: 0.25,
  PART_2_TRANSITION_START: 0.35,
  PART_2_TRANSITION_END: 0.45,
  PART_2_IMAGE_3_APPEAR_START: 0.45,
  PART_2_IMAGE_3_APPEAR_END: 0.49,
  PART_3_TRANSITION_START: 0.66,
  PART_3_TRANSITION_END: 0.76,
  PART_3_HOLD_END: 0.92,
  EXIT_START: 0.92,
  EXIT_END: 1,
} as const;

// ===================== Image Overlay =====================

/** Default border radius for carousel image cards */
export const IMAGE_BORDER_RADIUS = 24;

// ===================== Easing =====================

/**
 * The default easing function used across all scroll-driven animations.
 * Imported from the app's shared utilities; re-exported here for clarity.
 *
 * In the original codebase this is `sT` from entry-ssr, likely a custom
 * cubic-bezier or spring easing applied to framer-motion's useTransform.
 */
export { defaultEasing } from "@/lib/easing";
