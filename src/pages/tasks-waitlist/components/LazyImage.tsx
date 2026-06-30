/**
 * LazyImage - Image with loading skeleton and error fallback.
 *
 * Shows an animated pulse skeleton while loading, fades in the image
 * when loaded, and falls back to the skeleton on error.
 *
 * MotionImage variant wraps the image in a framer-motion component
 * for animated styles (opacity, scale, etc.).
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { MotionStyle } from "framer-motion";

// ===================== LazyImage (Static) =====================

interface LazyImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

export function LazyImage({ src, alt, className, style }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return <div className={cn(className, "bg-background-200 animate-pulse")} />;
  }

  return (
    <div className={cn(className, "image-theme-mask overflow-hidden")}>
      {/* Skeleton placeholder while loading */}
      {!isLoaded && <div className="bg-background-200 absolute inset-0 animate-pulse" />}

      <img
        src={src}
        alt={alt}
        className="size-full object-cover"
        style={{
          ...style,
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.3s ease-in-out",
        }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

// ===================== MotionImage (Animated) =====================
interface MotionImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  style?: MotionStyle;
}

export function MotionImage({ src, alt, className, style }: MotionImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return <div className={cn(className, "bg-background-200 animate-pulse")} />;
  }

  if (!isLoaded) {
    return (
      <>
        <div className={cn(className, "bg-background-200 animate-pulse")} />
        <motion.img
          src={src}
          alt={alt}
          className="sr-only"
          style={style}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      </>
    );
  }

  return (
    <motion.div className={cn(className, "image-theme-mask overflow-hidden")} style={style}>
      <img src={src} alt={alt} className="size-full object-cover" />
    </motion.div>
  );
}
