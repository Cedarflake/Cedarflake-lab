/**
 * RolodexImage - Animated image cell in the rolodex grid.
 *
 * Uses vertical slide animation to transition between 3 images
 * based on scroll progress. Container uses squircle shape with
 * a slight y offset for visual alignment.
 */

import React from "react";
import { motion, useTransform } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { defaultEasing } from "@/lib/easing";
import { SCROLL_KEYFRAMES as K } from "../constants";

interface RolodexImageProps {
  content1: string;
  content2: string;
  content3: string;
  scrollProgress: MotionValue<number>;
  staggerOffset: number;
  isNarrow: boolean;
  contentIndex?: number;
  rolodex1Start?: number;
  rolodex1End?: number;
  rolodex2Start?: number;
  rolodex2End?: number;
}

export function RolodexImage({
  content1,
  content2,
  content3,
  scrollProgress,
  staggerOffset,
  isNarrow,
  contentIndex,
  rolodex1Start,
  rolodex1End,
  rolodex2Start,
  rolodex2End,
}: RolodexImageProps) {
  const r1Start = (rolodex1Start ?? K.ROLODEX_1_START) + staggerOffset;
  const r1End = (rolodex1End ?? K.ROLODEX_1_END) + staggerOffset;
  const r2Start = (rolodex2Start ?? K.ROLODEX_2_START) + staggerOffset;
  const r2End = (rolodex2End ?? K.ROLODEX_2_END) + staggerOffset;
  const resetStart = K.RESET_START + staggerOffset;
  const resetEnd = K.RESET_END + staggerOffset;

  const images = isNarrow
    ? [content1, content2, content3, content1]
    : [content1, content2, content3];

  const transitions = [
    { images: [0, 1], range: [r1Start, r1End] },
    { images: [1, 2], range: [r2Start, r2End] },
    ...(isNarrow ? [{ images: [2, 3], range: [resetStart, resetEnd] }] : []),
  ];

  const scrollKeyframes: number[] = [0];
  const yValues: string[] = ["0%"];
  for (const t of transitions) {
    const targetPercent = `${(-(t.images[1] / images.length) * 100).toFixed(3)}%`;
    scrollKeyframes.push(t.range[0], t.range[1]);
    yValues.push(yValues[yValues.length - 1]!, targetPercent);
  }
  scrollKeyframes.push(1);
  yValues.push(yValues[yValues.length - 1]!);

  const yOffset = useTransform(scrollProgress, scrollKeyframes, yValues, {
    clamp: true,
    ease: defaultEasing,
  });

  if (isNarrow && contentIndex !== undefined) {
    const allImages = [content1, content2, content3];
    return (
      <span className="inline-block">
        <motion.div
          key={contentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="image-theme-tint squircle-16 lg:squircle-24 [@media(max-height:720px)]:squircle-16 inline-block size-12 overflow-hidden lg:size-20 [@media(max-height:720px)]:size-12"
          style={{ y: 12 }}
        >
          <img src={allImages[contentIndex]} alt="" className="size-full object-contain" />
        </motion.div>
      </span>
    );
  }

  const imageEntries = (() => {
    const seen = new Map<string, number>();
    return images.map((src) => {
      const n = seen.get(src) ?? 0;
      seen.set(src, n + 1);
      return { src, key: `${src}__${n}` };
    });
  })();

  return (
    <span className="inline-block">
      <motion.div
        className="image-theme-tint squircle-16 lg:squircle-24 [@media(max-height:720px)]:squircle-16 inline-block size-12 overflow-hidden lg:size-20 [@media(max-height:720px)]:size-12"
        style={{ y: 12 }}
      >
        <div className="relative size-full transform-gpu overflow-hidden">
          <motion.div
            className="flex transform-gpu flex-col will-change-transform"
            style={{
              height: `${images.length * 100}%`,
              y: yOffset,
            }}
          >
            {imageEntries.map(({ src, key }, i) => (
              <img
                key={key}
                src={src}
                alt={`Rolodex image ${i + 1}`}
                className="size-full shrink-0 transform-gpu object-contain"
                style={{ height: `${100 / images.length}%` }}
                loading="eager"
                decoding="sync"
              />
            ))}
          </motion.div>
        </div>
      </motion.div>
    </span>
  );
}
