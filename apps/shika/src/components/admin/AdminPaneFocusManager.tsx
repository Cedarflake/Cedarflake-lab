"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

interface AdminPaneFocusManagerProps {
  targetId: string;
}

export function AdminPaneFocusManager({
  targetId,
}: AdminPaneFocusManagerProps) {
  const searchParams = useSearchParams();
  const navigationKey = searchParams.toString();
  const previousNavigationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousNavigationKey = previousNavigationKeyRef.current;
    previousNavigationKeyRef.current = navigationKey;

    if (
      previousNavigationKey === null ||
      previousNavigationKey === navigationKey
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [navigationKey, targetId]);

  return null;
}
