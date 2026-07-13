const INTRO_DURATION_MS = 1_100
const MASK_ANGLE_OFFSET = 167
const GRADIENT_ANGLE_OFFSET = 142
const MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const ANGLE_STIFFNESS = 140
const ANGLE_DAMPING = 20
const GRADIENT_RESPONSE = 8
const FOCUS_IN_STIFFNESS = 180
const FOCUS_IN_DAMPING = 27
const FOCUS_OUT_STIFFNESS = 120
const FOCUS_OUT_DAMPING = 22
const OPACITY_RESPONSE = 14

type MotionMode = "idle" | "intro" | "tracking"

interface AuroraKeyframe {
  offset: number
  value: number
}

export interface FabAuroraController {
  destroy(): void
  resetInteraction(): void
  setVisible(isVisible: boolean): void
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

function clampProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 1)
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

function smoothstep(progress: number): number {
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

function approachExponentially(
  current: number,
  target: number,
  response: number,
  deltaSeconds: number,
): number {
  const progress = 1 - Math.exp(-response * deltaSeconds)
  return current + (target - current) * progress
}

function formatCssNumber(value: number): string {
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

function createSpan(className: string): HTMLSpanElement {
  const element = document.createElement("span")
  element.className = className
  return element
}

function createAuroraClip(isSharp: boolean): HTMLSpanElement {
  const clip = createSpan("fab-aurora-clip")
  const mask = createSpan("fab-aurora-mask")
  const gradient = createSpan("fab-aurora-gradient")

  if (isSharp) {
    clip.classList.add("fab-aurora-clip-sharp")
  }

  mask.appendChild(gradient)
  clip.appendChild(mask)
  return clip
}

export function mountFabAurora(
  button: HTMLButtonElement,
  icon: SVGSVGElement,
): FabAuroraController {
  const shell = createSpan("fab-aurora")
  const motion = createSpan("fab-aurora-motion")
  const stack = createSpan("fab-aurora-stack")
  const softClip = createAuroraClip(false)
  const sharpClip = createAuroraClip(true)
  const surface = createSpan("fab-surface")
  const content = createSpan("fab-content")
  const motionPreference = window.matchMedia(MOTION_QUERY)

  shell.setAttribute("aria-hidden", "true")
  surface.setAttribute("aria-hidden", "true")
  stack.append(softClip, sharpClip)
  motion.appendChild(stack)
  shell.appendChild(motion)
  content.appendChild(icon)
  button.replaceChildren(shell, surface, content)

  let bounds: DOMRect | null = null
  let targetAngle = 0
  let maskAngle = 0
  let gradientAngle = 0
  let angularVelocity = 0
  let focus = 0
  let focusTarget = 0
  let focusVelocity = 0
  let motionOpacity = 0
  let frameId = 0
  let lastFrameAt: number | null = null
  let motionMode: MotionMode = "idle"
  let introStartedAt: number | null = null
  let isPointerInside = false
  let isVisible = false
  let hasPlayedIntro = false
  let isDestroyed = false

  function writePercentageProperty(property: string, value: number): void {
    motion.style.setProperty(property, `${formatCssNumber(value)}%`)
  }

  function writeFocus(nextFocus: number): void {
    const clampedFocus = clampProgress(nextFocus)
    const visualFocus = smoothstep(clampedFocus)

    motion.style.setProperty(
      "--ytar-fab-aurora-focus",
      formatCssNumber(visualFocus),
    )
    writePercentageProperty(
      "--ytar-fab-aurora-soft-fade-start",
      50 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-soft-solid-start",
      68 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-soft-solid-end",
      100 - 25 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-soft-fade-end",
      100 - 11 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-sharp-fade-start",
      62 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-sharp-solid-start",
      82 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-sharp-solid-end",
      100 - 18 * visualFocus,
    )
    writePercentageProperty(
      "--ytar-fab-aurora-sharp-fade-end",
      100 - 11 * visualFocus,
    )
  }

  function writeVisualState(): void {
    motion.style.opacity = formatCssNumber(motionOpacity)
    writeFocus(focus)
    motion.style.setProperty(
      "--ytar-fab-aurora-mask-angle",
      `${formatCssNumber(maskAngle + MASK_ANGLE_OFFSET)}deg`,
    )
    motion.style.setProperty(
      "--ytar-fab-aurora-gradient-angle",
      `${formatCssNumber(gradientAngle + GRADIENT_ANGLE_OFFSET)}deg`,
    )
  }

  function writeIntroFrame(frame: FabAuroraIntroFrame): void {
    focus = frame.focus
    focusTarget = 0
    motionOpacity = frame.opacity
    maskAngle = frame.maskAngle - MASK_ANGLE_OFFSET
    gradientAngle = frame.gradientAngle - GRADIENT_ANGLE_OFFSET
    motion.style.opacity = formatCssNumber(frame.opacity)
    writeFocus(frame.focus)
    motion.style.setProperty(
      "--ytar-fab-aurora-mask-angle",
      `${formatCssNumber(frame.maskAngle)}deg`,
    )
    motion.style.setProperty(
      "--ytar-fab-aurora-gradient-angle",
      `${formatCssNumber(frame.gradientAngle)}deg`,
    )
    softClip.style.filter = `blur(${formatCssNumber(frame.blurPx)}px)`
  }

  function cancelFrame(): void {
    if (frameId === 0) {
      return
    }

    cancelAnimationFrame(frameId)
    frameId = 0
  }

  function scheduleFrame(): void {
    if (frameId !== 0 || isDestroyed) {
      return
    }

    frameId = requestAnimationFrame(renderFrame)
  }

  function renderTrackingFrame(timestamp: number): void {
    const deltaSeconds = lastFrameAt === null
      ? 1 / 60
      : Math.min(Math.max((timestamp - lastFrameAt) / 1_000, 0), 0.05)
    lastFrameAt = timestamp

    angularVelocity += shortestAngleDelta(maskAngle, targetAngle)
      * ANGLE_STIFFNESS
      * deltaSeconds
    angularVelocity *= Math.exp(-ANGLE_DAMPING * deltaSeconds)
    maskAngle += angularVelocity * deltaSeconds
    gradientAngle = approachExponentially(
      gradientAngle,
      gradientAngle + shortestAngleDelta(gradientAngle, targetAngle),
      GRADIENT_RESPONSE,
      deltaSeconds,
    )
    const focusStiffness = focusTarget === 1
      ? FOCUS_IN_STIFFNESS
      : FOCUS_OUT_STIFFNESS
    const focusDamping = focusTarget === 1
      ? FOCUS_IN_DAMPING
      : FOCUS_OUT_DAMPING
    focusVelocity += (
      (focusTarget - focus) * focusStiffness -
      focusVelocity * focusDamping
    ) * deltaSeconds
    focus = clampProgress(focus + focusVelocity * deltaSeconds)
    motionOpacity = approachExponentially(
      motionOpacity,
      1,
      OPACITY_RESPONSE,
      deltaSeconds,
    )

    const maskDelta = Math.abs(shortestAngleDelta(maskAngle, targetAngle))
    const gradientDelta = Math.abs(
      shortestAngleDelta(gradientAngle, targetAngle),
    )
    const isAngleSettled =
      maskDelta < 0.05 &&
      gradientDelta < 0.05 &&
      Math.abs(angularVelocity) < 0.05
    const isFocusSettled =
      Math.abs(focusTarget - focus) < 0.001 &&
      Math.abs(focusVelocity) < 0.01
    const isOpacitySettled = Math.abs(1 - motionOpacity) < 0.001

    if (isAngleSettled) {
      maskAngle = targetAngle
      gradientAngle = targetAngle
      angularVelocity = 0
    }

    if (isFocusSettled) {
      focus = focusTarget
      focusVelocity = 0
    }

    if (isOpacitySettled) {
      motionOpacity = 1
    }

    writeVisualState()

    if (!isAngleSettled || !isFocusSettled || !isOpacitySettled) {
      scheduleFrame()
      return
    }

    lastFrameAt = null

    if (!isPointerInside && focus === 0) {
      motionMode = "idle"
    }
  }

  function renderFrame(timestamp: number): void {
    frameId = 0

    if (motionMode === "intro") {
      introStartedAt ??= timestamp
      const progress = (timestamp - introStartedAt) / INTRO_DURATION_MS
      writeIntroFrame(resolveFabAuroraIntroFrame(progress))

      if (progress < 1) {
        scheduleFrame()
        return
      }

      motionMode = "idle"
      introStartedAt = null
      lastFrameAt = null
      softClip.style.removeProperty("filter")
      writeVisualState()
      return
    }

    if (motionMode === "tracking") {
      renderTrackingFrame(timestamp)
    }
  }

  function updateTargetAngle(event: PointerEvent): void {
    if (!bounds) {
      return
    }

    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    targetAngle = Math.atan2(
      event.clientY - centerY,
      event.clientX - centerX,
    ) * 180 / Math.PI

    if (motionMode === "tracking") {
      scheduleFrame()
    }
  }

  function setIdleState(): void {
    motionMode = "idle"
    introStartedAt = null
    lastFrameAt = null
    angularVelocity = 0
    focus = 0
    focusTarget = 0
    focusVelocity = 0
    motionOpacity = 1
    bounds = null
    button.removeEventListener("pointermove", updateTargetAngle)
    cancelFrame()
    softClip.style.removeProperty("filter")
    writeVisualState()
  }

  function activateHover(): void {
    focusTarget = 1

    if (motionPreference.matches) {
      motionMode = "idle"
      focus = 1
      focusVelocity = 0
      motionOpacity = 1
      maskAngle = targetAngle
      gradientAngle = targetAngle
      angularVelocity = 0
      writeVisualState()
      return
    }

    motionMode = "tracking"
    lastFrameAt = null
    button.addEventListener("pointermove", updateTargetAngle)
    scheduleFrame()
  }

  function startIntro(): void {
    if (hasPlayedIntro || !isVisible || isDestroyed) {
      setIdleState()
      return
    }

    hasPlayedIntro = true

    if (motionPreference.matches) {
      setIdleState()
      return
    }

    motionMode = "intro"
    introStartedAt = null
    lastFrameAt = null
    angularVelocity = 0
    focusVelocity = 0
    writeIntroFrame(resolveFabAuroraIntroFrame(0))
    scheduleFrame()
  }

  function showAurora(event: PointerEvent): void {
    if (event.pointerType === "touch" || isDestroyed || !isVisible) {
      return
    }

    isPointerInside = true
    bounds = button.getBoundingClientRect()
    updateTargetAngle(event)
    button.removeEventListener("pointermove", updateTargetAngle)
    cancelFrame()
    introStartedAt = null
    lastFrameAt = null
    softClip.style.removeProperty("filter")
    activateHover()
  }

  function hideAurora(): void {
    if (!isPointerInside) {
      return
    }

    isPointerInside = false
    bounds = null
    button.removeEventListener("pointermove", updateTargetAngle)

    if (isDestroyed || !isVisible) {
      setIdleState()
      return
    }

    if (motionPreference.matches) {
      setIdleState()
      return
    }

    focusTarget = 0
    motionMode = "tracking"
    lastFrameAt = null
    scheduleFrame()
  }

  function handleMotionPreferenceChange(): void {
    const shouldRestoreHover = isVisible && isPointerInside
    cancelFrame()
    button.removeEventListener("pointermove", updateTargetAngle)
    introStartedAt = null
    lastFrameAt = null
    softClip.style.removeProperty("filter")

    if (!shouldRestoreHover) {
      setIdleState()
      return
    }

    bounds = button.getBoundingClientRect()
    activateHover()
  }

  function resetInteraction(): void {
    if (isDestroyed) {
      return
    }

    isPointerInside = false
    setIdleState()
  }

  function setVisible(nextIsVisible: boolean): void {
    if (isDestroyed || isVisible === nextIsVisible) {
      return
    }

    isVisible = nextIsVisible

    if (!isVisible) {
      isPointerInside = false
      setIdleState()
      return
    }

    startIntro()
  }

  function destroy(): void {
    if (isDestroyed) {
      return
    }

    isDestroyed = true
    isPointerInside = false
    setIdleState()
    button.removeEventListener("pointerenter", showAurora)
    button.removeEventListener("pointerleave", hideAurora)
    button.removeEventListener("pointercancel", hideAurora)
    motionPreference.removeEventListener("change", handleMotionPreferenceChange)
  }

  button.addEventListener("pointerenter", showAurora)
  button.addEventListener("pointerleave", hideAurora)
  button.addEventListener("pointercancel", hideAurora)
  motionPreference.addEventListener("change", handleMotionPreferenceChange)

  return {
    destroy,
    resetInteraction,
    setVisible,
  }
}
