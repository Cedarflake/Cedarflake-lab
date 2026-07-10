import type { CSSProperties, ForwardedRef, MutableRefObject } from "react"

import {
  defaultColors,
  defaultInteractionOptions,
  defaultMotionOptions,
  defaultRenderingOptions,
  defaultShaderOptions,
} from "../config/defaults"
import type {
  FocusOrbAudioVector,
  FocusOrbColors,
  FocusOrbInteractionOptions,
  FocusOrbMotionOptions,
  FocusOrbRenderingOptions,
  FocusOrbShaderOptions,
  ResolvedFocusOrbInteractionOptions,
  ResolvedFocusOrbMotionOptions,
  ResolvedFocusOrbRenderingOptions,
  ResolvedFocusOrbShaderOptions,
} from "../types/focusOrb"

export type Vec3 = Float32Array

export interface FocusOrbColorVectors {
  main: Vec3
  low: Vec3
  mid: Vec3
  high: Vec3
}

export type FocusOrbStyle = CSSProperties & {
  "--focus-orb-height"?: string
  "--focus-orb-hover-scale"?: number
  "--focus-orb-pressed-scale"?: number
  "--focus-orb-transition-ms"?: string
  "--focus-orb-width"?: string
}

export function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value)
    return
  }

  if (ref) {
    const mutableRef = ref as MutableRefObject<T | null>

    mutableRef.current = value
  }
}

export function createHostStyle(
  width: number | string,
  height: number | string,
  interaction: ResolvedFocusOrbInteractionOptions,
  style: CSSProperties | undefined,
): FocusOrbStyle {
  return {
    "--focus-orb-height": toCssSize(height),
    "--focus-orb-hover-scale": interaction.hoverScale,
    "--focus-orb-pressed-scale": interaction.pressedScale,
    "--focus-orb-transition-ms": `${interaction.transitionMs}ms`,
    "--focus-orb-width": toCssSize(width),
    ...style,
  }
}

export function hexToRgb(hex: string, fallback = "#ffffff"): Vec3 {
  const value = normalizeHexColor(hex) ?? normalizeHexColor(fallback) ?? "ffffff"

  return new Float32Array([
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ])
}

export function mergeClassNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ")
}

export function reportError(onError: ((error: Error) => void) | undefined, error: unknown) {
  const normalizedError = toError(error)

  if (onError) {
    onError(normalizedError)
    return
  }

  console.error(normalizedError)
}

export function resolveAudioVector(value: FocusOrbAudioVector | undefined, fallback: Float32Array) {
  return value ? new Float32Array(value) : fallback
}

export function resolveColorVectors(colors: FocusOrbColors): FocusOrbColorVectors {
  return {
    main: hexToRgb(colors.main, defaultColors.main),
    low: hexToRgb(colors.low, defaultColors.low),
    mid: hexToRgb(colors.mid, defaultColors.mid),
    high: hexToRgb(colors.high, defaultColors.high),
  }
}

export function resolveInteractionOptions(
  interaction: FocusOrbInteractionOptions | undefined,
): ResolvedFocusOrbInteractionOptions {
  return {
    ...defaultInteractionOptions,
    ...interaction,
  }
}

export function resolveMotionOptions(
  motion: FocusOrbMotionOptions | undefined,
  intensity: number | undefined,
): ResolvedFocusOrbMotionOptions {
  return {
    ...defaultMotionOptions,
    ...motion,
    intensity: intensity ?? motion?.intensity ?? defaultMotionOptions.intensity,
  }
}

export function resolveRenderingOptions(
  rendering: FocusOrbRenderingOptions | undefined,
  canvasSize: number | undefined,
  maxCanvasSize: number | undefined,
): ResolvedFocusOrbRenderingOptions {
  return {
    ...defaultRenderingOptions,
    ...rendering,
    canvasSize: canvasSize ?? rendering?.canvasSize ?? defaultRenderingOptions.canvasSize,
    maxCanvasSize: maxCanvasSize ?? rendering?.maxCanvasSize ?? defaultRenderingOptions.maxCanvasSize,
  }
}

export function resolveShaderOptions(shader: FocusOrbShaderOptions | undefined): ResolvedFocusOrbShaderOptions {
  return {
    ...defaultShaderOptions,
    ...shader,
  }
}

function toCssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value
}

function normalizeHexColor(hex: string): string | undefined {
  const value = hex.trim().replace(/^#/, "")

  if (/^[\da-f]{3}$/i.test(value)) {
    return [...value].map((char) => `${char}${char}`).join("")
  }

  if (/^[\da-f]{6}$/i.test(value)) {
    return value
  }

  return undefined
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
