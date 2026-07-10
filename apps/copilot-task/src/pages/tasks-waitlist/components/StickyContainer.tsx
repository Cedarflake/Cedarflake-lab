/**
 * StickyContainer - A viewport-height container that optionally sticks.
 *
 * Used inside Section to create the "sticky scroll" effect where content
 * stays fixed while the user scrolls through the section's tall outer div.
 */

import React from "react";
import { cn } from "@/lib/utils";

interface StickyContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Whether this container should be sticky (default: true) */
  sticky?: boolean;
  /** Sticky position class (default: "top-0") */
  stickyPosition?: string;
  /** Container height mode (default: "viewport") */
  height?: "viewport" | "auto";
}

export function StickyContainer({
  children,
  className,
  sticky = true,
  stickyPosition = "top-0",
  height = "viewport",
}: StickyContainerProps) {
  const heightClass = height === "auto" ? "h-auto" : "h-[100dvh] sm:h-lenis-wrapper";

  return (
    <div className={cn(heightClass, sticky && "sticky", sticky && stickyPosition, className)}>
      {children}
    </div>
  );
}
