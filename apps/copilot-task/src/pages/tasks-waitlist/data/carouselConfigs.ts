/**
 * Carousel image data and animation configurations for Section 4.
 *
 * Three images animate between grid positions as the user scrolls:
 * - Each image starts small, moves to center (hero position), then shrinks away
 * - Transitions are orchestrated so one image is always in the center
 */

import { CAROUSEL_KEYFRAMES as K } from "../constants";
import type { CarouselImage, ImageAnimationConfig } from "../types";

const ASSET_BASE = "";

// ===================== Image Sources =====================

export const CAROUSEL_IMAGES: CarouselImage[] = [
  {
    id: "image-1",
    srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-light.jpg`,
    srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-dark.jpg`,
    alt: "",
  },
  {
    id: "image-2",
    srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-light.jpg`,
    srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-dark.jpg`,
    alt: "",
  },
  {
    id: "image-3",
    srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-light.jpg`,
    srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-dark.jpg`,
    alt: "",
  },
];

// ===================== Animation Configs =====================

/**
 * Each config describes how one image moves through grid positions
 * across the scroll progress range. The phases array defines
 * the sequence of grid positions the image occupies.
 *
 * Grid: 16 columns x 4 rows
 * - Center position: columns 5-13, row 2 (the main "hero" slot)
 * - Top-left position: columns 3-5, row 1 (small thumbnail)
 * - Bottom-right position: columns 13-15, row 3 (small thumbnail)
 */
export const IMAGE_ANIMATION_CONFIGS: ImageAnimationConfig[] = [
  // --- Image 1: Starts center, moves to top-left ---
  {
    imageId: "image-1",
    phases: [
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_1_IMAGE_1_INTRO_START,
        endProgress: K.PART_1_IMAGE_1_INTRO_START,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_1_IMAGE_1_INTRO_START,
        endProgress: K.PART_1_IMAGE_1_INTRO_END,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_1_IMAGE_1_INTRO_END,
        endProgress: K.PART_1_HOLD_END,
      },
      {
        gridPosition: { columnStart: 3, columnEnd: 5, rowStart: 1, rowEnd: 2 },
        startProgress: K.PART_2_TRANSITION_START,
        endProgress: K.PART_2_TRANSITION_END,
      },
    ],
    opacityRange: [
      K.PART_1_IMAGE_1_INTRO_START,
      K.PART_1_IMAGE_1_INTRO_END,
      K.PART_3_HOLD_END,
      K.EXIT_END,
    ],
    innerScaleRange: [K.PART_1_IMAGE_1_INTRO_START, K.PART_1_IMAGE_1_INTRO_END],
    exitScaleRange: [K.PART_3_TRANSITION_START, K.PART_3_TRANSITION_END],
    zIndexRange: [30, 20],
    zIndexProgress: [K.PART_2_TRANSITION_START - 0.01, K.PART_2_TRANSITION_START],
  },

  // --- Image 2: Starts bottom-right, moves to center, then top-left ---
  {
    imageId: "image-2",
    phases: [
      {
        gridPosition: {
          columnStart: 13,
          columnEnd: 15,
          rowStart: 3,
          rowEnd: 4,
        },
        startProgress: K.PART_1_IMAGE_2_INTRO_START,
        endProgress: K.PART_2_TRANSITION_START,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_2_TRANSITION_START,
        endProgress: K.PART_2_TRANSITION_END,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_2_TRANSITION_END,
        endProgress: K.PART_3_TRANSITION_START,
      },
      {
        gridPosition: { columnStart: 3, columnEnd: 5, rowStart: 1, rowEnd: 2 },
        startProgress: K.PART_3_TRANSITION_START,
        endProgress: K.PART_3_TRANSITION_END,
      },
    ],
    opacityRange: [
      K.PART_1_IMAGE_2_INTRO_START,
      K.PART_1_IMAGE_2_INTRO_END,
      K.PART_3_HOLD_END,
      K.EXIT_END,
    ],
    innerScaleRange: [K.PART_1_IMAGE_2_INTRO_START, K.PART_1_IMAGE_2_INTRO_END],
    zIndexRange: [0, 20, 20, 30, 30, 20],
    zIndexProgress: [
      K.PART_1_IMAGE_2_INTRO_START - 0.01,
      K.PART_1_IMAGE_2_INTRO_START,
      K.PART_2_TRANSITION_START - 0.01,
      K.PART_2_TRANSITION_START,
      K.PART_3_TRANSITION_START - 0.01,
      K.PART_3_TRANSITION_START,
    ],
  },

  // --- Image 3: Appears bottom-right, moves to center ---
  {
    imageId: "image-3",
    phases: [
      {
        gridPosition: {
          columnStart: 13,
          columnEnd: 15,
          rowStart: 3,
          rowEnd: 4,
        },
        startProgress: K.PART_2_IMAGE_3_APPEAR_START,
        endProgress: K.PART_3_TRANSITION_START,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_3_TRANSITION_START,
        endProgress: K.PART_3_TRANSITION_END,
      },
      {
        gridPosition: { columnStart: 5, columnEnd: 13, rowStart: 2, rowEnd: 3 },
        startProgress: K.PART_3_TRANSITION_END,
        endProgress: K.PART_3_HOLD_END,
      },
    ],
    opacityRange: [
      K.PART_2_IMAGE_3_APPEAR_START,
      K.PART_2_IMAGE_3_APPEAR_END,
      K.EXIT_START,
      K.EXIT_END,
    ],
    innerScaleRange: [K.PART_2_TRANSITION_START, K.PART_2_TRANSITION_END],
    zIndexRange: [0, 20, 20, 30],
    zIndexProgress: [
      K.PART_2_IMAGE_3_APPEAR_START - 0.01,
      K.PART_2_IMAGE_3_APPEAR_START,
      K.PART_3_TRANSITION_START - 0.01,
      K.PART_3_TRANSITION_START,
    ],
  },
];
