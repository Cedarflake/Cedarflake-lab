type HapticPattern = number | number[]

function canUseHaptics() {
  if (typeof window === "undefined" || typeof navigator.vibrate !== "function") {
    return false
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function pulseHaptics(pattern: HapticPattern) {
  if (!canUseHaptics()) {
    return
  }

  navigator.vibrate(pattern)
}
