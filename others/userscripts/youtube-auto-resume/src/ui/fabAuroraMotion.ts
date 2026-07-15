interface AuroraKeyframe {
  offset: number
  value: number
}

export interface FabAuroraIntroFrame {
  blurPx: number
  focus: number
  gradientAngle: number
  maskAngle: number
  opacity: number
}

const INTRO_BLUR_KEYFRAMES: readonly AuroraKeyframe[] = [
  { offset: 0, value: 1 },
  { offset: 0.15, value: 5 },
  { offset: 0.25, value: 3 },
  { offset: 0.45, value: 5 },
  { offset: 1, value: 4 },
]

export function clampProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 1)
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

export function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

function interpolateKeyframes(
  progress: number,
  keyframes: readonly AuroraKeyframe[],
): number {
  const first = keyframes[0]

  if (!first) {
    return 0
  }

  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index]

    if (!next || progress > next.offset) {
      continue
    }

    const previous = keyframes[index - 1] ?? first
    const span = next.offset - previous.offset

    if (span <= 0) {
      return next.value
    }

    const localProgress = (progress - previous.offset) / span
    return previous.value + (next.value - previous.value) * localProgress
  }

  return keyframes[keyframes.length - 1]?.value ?? first.value
}

export function approachExponentially(
  current: number,
  target: number,
  response: number,
  deltaSeconds: number,
): number {
  const progress = 1 - Math.exp(-response * deltaSeconds)
  return current + (target - current) * progress
}

export function formatCssNumber(value: number): string {
  const normalizedValue = Math.abs(value) < 0.000_05 ? 0 : value
  return String(Number(normalizedValue.toFixed(4)))
}

export function shortestAngleDelta(from: number, to: number): number {
  const difference = to - from
  const delta = ((difference + 180) % 360 + 360) % 360 - 180
  return delta === -180 && difference < 0 ? 180 : delta
}

export function resolveFabAuroraIntroFrame(
  progress: number,
): FabAuroraIntroFrame {
  const clampedProgress = clampProgress(progress)
  const angleProgress = easeOutCubic(clampedProgress)
  const expansionProgress = clampProgress(
    (clampedProgress - 0.68) / 0.32,
  )
  const opacity = clampedProgress < 0.22
    ? easeOutCubic(clampedProgress / 0.22)
    : 1

  return {
    blurPx: interpolateKeyframes(clampedProgress, INTRO_BLUR_KEYFRAMES),
    focus: 1 - smoothstep(expansionProgress),
    gradientAngle: 170 + 55 * angleProgress,
    maskAngle: -90 + 290 * angleProgress,
    opacity,
  }
}
