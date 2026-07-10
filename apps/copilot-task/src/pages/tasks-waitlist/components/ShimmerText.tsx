/**
 * ShimmerText - Text wrapper that can optionally show a shimmer loading effect.
 * When isActive is true, shows a gradient shimmer animation over the text.
 * When false, renders children as-is.
 */

import React from "react";
import { cn } from "@/lib/utils";

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  isActive?: boolean;
}

export function ShimmerText({ children, className, isActive = false }: ShimmerTextProps) {
  return <div className={cn(className, isActive && "animate-pulse")}>{children}</div>;
}
