import type { MotionValue } from "framer-motion";

// ===================== Lenis Scroll =====================

export interface LenisScrollContextValue {
  lenisScroll: MotionValue<number>;
  lenisProgress: MotionValue<number>;
  lenis: LenisInstance | null;
  lenisDirection: MotionValue<number>;
  viewportHeight: number;
  viewportWidth: number;
  isNarrow: boolean;
}

export type LenisInstance = import("lenis").default;

// ===================== Section Config =====================

export interface SectionConfig {
  id: string;
  componentPath: string;
  heightMultiplier: number;
  zIndex?: number;
  overlapPrevious?: boolean;
  enableScrollProgress?: boolean;
  scrollTrackingEdge?: [string, string];
  ariaLabel?: string;
  hidden?: boolean;
  className?: string;
  narrowOverrides?: {
    heightMultiplier?: number;
    sticky?: boolean;
    overlapPrevious?: boolean;
  };
  reducedMotionOverrides?: {
    heightMultiplier?: number;
  };
}

export interface SectionContextValue {
  scrollYProgress: MotionValue<number> | null;
  sticky: boolean;
  sectionRef: React.RefObject<HTMLElement | null>;
}

// ===================== Rolodex =====================

export interface RolodexItem {
  id: string;
  type: "text" | "image";
  content1: string;
  content2: string;
  content3: string;
  row: number;
  col: number;
  animate?: boolean;
}

export interface RolodexItemWithStagger extends RolodexItem {
  diagonalStagger: number;
}

export type RolodexLayout = "3-line" | "5-line" | "6-line";

export interface TransitionRange {
  images: [number, number];
  range: [number, number];
}

// ===================== Features =====================

export interface FeatureActionItem {
  labelKey: string;
  icon?: string;
}

export interface FeatureItem {
  titleKey: string;
  descriptionKey: string;
  actionItems: FeatureActionItem[];
}

// ===================== Carousel =====================

export interface CarouselImage {
  id: string;
  srcLight: string;
  srcDark: string;
  alt: string;
}

export interface GridPosition {
  columnStart: number;
  columnEnd: number;
  rowStart: number;
  rowEnd: number;
}

export interface ImageAnimationPhase {
  gridPosition: GridPosition;
  startProgress: number;
  endProgress: number;
}

export interface ImageAnimationConfig {
  imageId: string;
  phases: ImageAnimationPhase[];
  opacityRange: [number, number, number, number];
  innerScaleRange: [number, number];
  exitScaleRange?: [number, number];
  zIndexRange: number[];
  zIndexProgress: number[];
}

export interface ImageTransform {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
}

// ===================== Scroll Progress =====================

export interface ScrollProgressOptions {
  target: React.RefObject<HTMLElement | null>;
  offset: [string, string];
  lenisScroll: MotionValue<number>;
  orientation?: "vertical" | "horizontal";
  debug?: boolean;
  negativeMarginOffset?: number;
}

// ===================== CTA Button =====================

export type ButtonPlacement = "home" | "floating" | "footer";
