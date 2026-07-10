/**
 * RolodexItem - A single cell in the rolodex sentence grid.
 *
 * Three types of behavior:
 * - Static text (animate=false): Always shows content1, hardware-accelerated
 * - Animated text (animate=true): 3D card-flip between content1 -> content2 -> content3
 * - Image: Vertical slide between 3 images in a squircle container
 *
 * The 3D flip effect uses preserve-3d with backface-visibility hidden.
 * A visibility state machine controls which layer is shown at each point
 * during the scroll animation. Uses [0, 180] / [180, 360] rotation ranges.
 */

import { motion, useTransform } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { SCROLL_KEYFRAMES as K, STAGGER_CONFIG } from "../constants";
import type { RolodexItemWithStagger } from "../types";
import { RolodexImage } from "./RolodexImage";

interface RolodexItemProps {
  item: RolodexItemWithStagger;
  scrollProgress: MotionValue<number>;
  rolodex1Start?: number;
  rolodex1End?: number;
  rolodex2Start?: number;
  rolodex2End?: number;
  diagonalStagger?: number;
  isNarrow: boolean;
  contentIndex?: number;
}

export function RolodexItem({
  item,
  scrollProgress,
  rolodex1Start,
  rolodex1End,
  rolodex2Start,
  rolodex2End,
  diagonalStagger,
  isNarrow,
  contentIndex,
}: RolodexItemProps) {
  const { content1, content2, content3, type, animate } = item;
  const diag = diagonalStagger ?? item.diagonalStagger;
  const staggerOffset = diag * STAGGER_CONFIG.maxStagger;

  if (type === "text" && !animate) {
    return (
      <span className="inline-block whitespace-nowrap" style={{ transform: "translateZ(0)" }}>
        {content1}
      </span>
    );
  }

  if (type === "image") {
    return (
      <RolodexImage
        content1={content1}
        content2={content2}
        content3={content3}
        scrollProgress={scrollProgress}
        staggerOffset={staggerOffset}
        isNarrow={isNarrow}
        contentIndex={contentIndex}
        rolodex1Start={rolodex1Start}
        rolodex1End={rolodex1End}
        rolodex2Start={rolodex2Start}
        rolodex2End={rolodex2End}
      />
    );
  }

  if (isNarrow && contentIndex !== undefined) {
    const contents = [content1, content2, content3];
    return (
      <motion.span
        key={contentIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="inline-block whitespace-nowrap"
      >
        {contents[contentIndex]}
      </motion.span>
    );
  }

  return (
    <AnimatedFlipText
      content1={content1}
      content2={content2}
      content3={content3}
      scrollProgress={scrollProgress}
      staggerOffset={staggerOffset}
      isNarrow={isNarrow}
      rolodex1Start={rolodex1Start}
      rolodex1End={rolodex1End}
      rolodex2Start={rolodex2Start}
      rolodex2End={rolodex2End}
    />
  );
}

// ===================== Animated 3D Card Flip =====================
interface AnimatedFlipTextProps {
  content1: string;
  content2: string;
  content3: string;
  scrollProgress: MotionValue<number>;
  staggerOffset: number;
  isNarrow: boolean;
  rolodex1Start?: number;
  rolodex1End?: number;
  rolodex2Start?: number;
  rolodex2End?: number;
}

function AnimatedFlipText({
  content1,
  content2,
  content3,
  scrollProgress,
  staggerOffset,
  isNarrow,
  rolodex1Start,
  rolodex1End,
  rolodex2Start,
  rolodex2End,
}: AnimatedFlipTextProps) {
  const r1Start = (rolodex1Start ?? K.ROLODEX_1_START) + staggerOffset;
  const r1End = (rolodex1End ?? K.ROLODEX_1_END) + staggerOffset;
  const r2Start = (rolodex2Start ?? K.ROLODEX_2_START) + staggerOffset;
  const r2End = (rolodex2End ?? K.ROLODEX_2_END) + staggerOffset;
  const resetStart = K.RESET_START + staggerOffset;
  const resetEnd = K.RESET_END + staggerOffset;

  const rotate1 = useTransform(scrollProgress, [r1Start, r1End], [0, 180], {
    clamp: true,
  });

  const rotate2 = useTransform(scrollProgress, [r2Start, r2End], [180, 360], {
    clamp: true,
  });

  const rotateReset = useTransform(scrollProgress, [resetStart, resetEnd], [0, 180], {
    clamp: true,
  });

  const visState = useTransform(scrollProgress, (p: number) => {
    if (p < r1End) return 1;
    if (p < r2Start) return 2;
    if (p < r2End) return 3;
    if (!isNarrow || p < resetStart) return 4;
    return 5;
  });

  const vis1 = useTransform(visState, (s: number) => (s === 1 ? "visible" : "hidden"));
  const vis2 = useTransform(visState, (s: number) => (s === 2 ? "visible" : "hidden"));
  const vis3 = useTransform(visState, (s: number) => (s === 3 ? "visible" : "hidden"));
  const vis4 = useTransform(visState, (s: number) => (s === 4 ? "visible" : "hidden"));
  const vis5 = useTransform(visState, (s: number) => (s === 5 ? "visible" : "hidden"));

  return (
    <span
      className="relative inline-grid whitespace-nowrap align-baseline"
      style={{ perspective: "1000px" }}
    >
      {/* Invisible measurement layer reserves max one-line width and height. */}
      <span
        className="invisible inline-grid whitespace-nowrap"
        style={{ gridArea: "1 / 1" }}
        aria-hidden="true"
      >
        <span style={{ gridArea: "1 / 1" }}>{content1}</span>
        <span style={{ gridArea: "1 / 1" }}>{content2}</span>
        <span style={{ gridArea: "1 / 1" }}>{content3}</span>
      </span>

      <span className="absolute inset-0">
        {/* Layer 1: content1 front / content2 back (transition 1) */}
        <motion.span
          className="inline-block whitespace-nowrap"
          style={{
            transformStyle: "preserve-3d",
            rotateX: rotate1,
            visibility: vis1,
            pointerEvents: "none",
          }}
        >
          <motion.span
            className="inline-block whitespace-nowrap"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span>{content1}</span>
          </motion.span>
          <motion.span
            className="absolute start-0 top-0 inline-block whitespace-nowrap"
            style={{ backfaceVisibility: "hidden", rotateX: 180 }}
          >
            <span>{content2}</span>
          </motion.span>
        </motion.span>

        {/* Layer 2: static content2 (between flips) */}
        <motion.span
          className="absolute start-0 top-0 inline-block whitespace-nowrap"
          style={{ visibility: vis2, pointerEvents: "none" }}
        >
          <span>{content2}</span>
        </motion.span>

        {/* Layer 3: content2 front / content3 back (transition 2) */}
        <motion.span
          className="absolute start-0 top-0 inline-block whitespace-nowrap"
          style={{
            transformStyle: "preserve-3d",
            rotateX: rotate2,
            visibility: vis3,
            pointerEvents: "none",
          }}
        >
          <motion.span
            className="absolute start-0 top-0 inline-block whitespace-nowrap"
            style={{ backfaceVisibility: "hidden", rotateX: 180 }}
          >
            <span>{content2}</span>
          </motion.span>
          <motion.span
            className="inline-block whitespace-nowrap"
            style={{ backfaceVisibility: "hidden", rotateX: 360 }}
          >
            <span>{content3}</span>
          </motion.span>
        </motion.span>

        {/* Layer 4: static content3 */}
        <motion.span
          className="absolute start-0 top-0 inline-block whitespace-nowrap"
          style={{ visibility: vis4, pointerEvents: "none" }}
        >
          <span>{content3}</span>
        </motion.span>

        {/* Layer 5: content3 -> content1 reset (narrow only) */}
        {isNarrow && (
          <motion.span
            className="absolute start-0 top-0 inline-block whitespace-nowrap"
            style={{
              transformStyle: "preserve-3d",
              rotateX: rotateReset,
              visibility: vis5,
              pointerEvents: "none",
            }}
          >
            <motion.span
              className="inline-block whitespace-nowrap"
              style={{ backfaceVisibility: "hidden" }}
            >
              <span>{content3}</span>
            </motion.span>
            <motion.span
              className="absolute start-0 top-0 inline-block whitespace-nowrap"
              style={{ backfaceVisibility: "hidden", rotateX: 180 }}
            >
              <span>{content1}</span>
            </motion.span>
          </motion.span>
        )}
      </span>
    </span>
  );
}
