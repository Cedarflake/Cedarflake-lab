import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes } from "react"

export type FocusOrbVariant = "button" | "background"
export type FocusOrbState = "speak" | "listen"
export type FocusOrbFit = "contain" | "cover"
export type FocusOrbAudioVector = readonly [number, number, number, number]
export type FocusOrbTextureCrossOrigin = "" | "anonymous" | "use-credentials"

export interface FocusOrbColors {
  main: string
  low: string
  mid: string
  high: string
}

export interface FocusOrbRenderStatus {
  active: boolean
  canvasHeight: number
  canvasWidth: number
  cssHeight: number
  cssWidth: number
  fit: FocusOrbFit
  intensity: number
  orbScale: number
  state: FocusOrbState
  textureSrc: string
  variant: FocusOrbVariant
}

export interface FocusOrbShaderOptions {
  blurRadius?: number
  colorMixAmount?: number
  displacement?: number
  edgeSoftness?: number
  fbmPowerDamping?: number
  idleSpringDamping?: number
  idleTransitionDuration?: number
  layer1Amplitude?: number
  layer1Frequency?: number
  layer2Amplitude?: number
  layer2Frequency?: number
  layer3Amplitude?: number
  layer3Frequency?: number
  listenRadius?: number
  mainRadius?: number
  micRadiusBoost?: number
  noiseScale?: number
  originX?: number
  originY?: number
  oscillationPeriod?: number
  rotation?: number
  speakRadius?: number
  stateSpringDamping?: number
  stateTransitionDuration?: number
  textureNoiseStrength?: number
  timeScale?: number
  verticalOffset?: number
  warpPower?: number
  waterColorNoiseScale?: number
  waterColorNoiseStrength?: number
  waveSpread?: number
  windSpeed?: number
}

export interface ResolvedFocusOrbShaderOptions {
  blurRadius: number
  colorMixAmount: number
  displacement: number
  edgeSoftness: number
  fbmPowerDamping: number
  idleSpringDamping: number
  idleTransitionDuration: number
  layer1Amplitude: number
  layer1Frequency: number
  layer2Amplitude: number
  layer2Frequency: number
  layer3Amplitude: number
  layer3Frequency: number
  listenRadius: number
  mainRadius: number
  micRadiusBoost: number
  noiseScale: number
  originX: number
  originY: number
  oscillationPeriod: number
  rotation: number
  speakRadius: number
  stateSpringDamping: number
  stateTransitionDuration: number
  textureNoiseStrength: number
  timeScale: number
  verticalOffset: number
  warpPower: number
  waterColorNoiseScale: number
  waterColorNoiseStrength: number
  waveSpread: number
  windSpeed: number
}

export interface FocusOrbMotionOptions {
  hoverEase?: number
  intensity?: number
  pressEase?: number
  timeScale?: number
  voiceSpeedA?: number
  voiceSpeedB?: number
  voiceSpeedC?: number
}

export interface ResolvedFocusOrbMotionOptions {
  hoverEase: number
  intensity: number
  pressEase: number
  timeScale: number
  voiceSpeedA: number
  voiceSpeedB: number
  voiceSpeedC: number
}

export interface FocusOrbAudioInput {
  avgMag?: FocusOrbAudioVector
  cumulativeAudio?: FocusOrbAudioVector
  micLevel?: number
  simulated?: boolean
}

export interface FocusOrbInteractionOptions {
  hoverScale?: number
  pressedScale?: number
  transitionMs?: number
}

export interface ResolvedFocusOrbInteractionOptions {
  hoverScale: number
  pressedScale: number
  transitionMs: number
}

export interface FocusOrbRenderingOptions {
  antialias?: boolean
  canvasHeight?: number
  canvasSize?: number
  canvasWidth?: number
  maxCanvasSize?: number
  pixelRatioCap?: number
  premultipliedAlpha?: boolean
  textureCrossOrigin?: FocusOrbTextureCrossOrigin
}

export interface ResolvedFocusOrbRenderingOptions {
  antialias: boolean
  canvasHeight?: number
  canvasSize: number
  canvasWidth?: number
  maxCanvasSize: number
  pixelRatioCap: number
  premultipliedAlpha: boolean
  textureCrossOrigin?: FocusOrbTextureCrossOrigin
}

export interface FocusOrbBaseProps {
  active?: boolean
  audio?: FocusOrbAudioInput
  canvasClassName?: string
  canvasSize?: number
  className?: string
  colors?: Partial<FocusOrbColors>
  defaultActive?: boolean
  fit?: FocusOrbFit
  height?: number | string
  interaction?: FocusOrbInteractionOptions
  intensity?: number
  maxCanvasSize?: number
  motion?: FocusOrbMotionOptions
  onError?: (error: Error) => void
  onRenderComplete?: (status: FocusOrbRenderStatus) => void
  orbScale?: number
  paused?: boolean
  rendering?: FocusOrbRenderingOptions
  shader?: FocusOrbShaderOptions
  state?: FocusOrbState
  style?: CSSProperties
  textureSrc?: string
  width?: number | string
}

export interface FocusOrbButtonProps
  extends FocusOrbBaseProps,
    Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      "children" | "className" | "color" | "height" | "onError" | "style" | "width"
    > {
  ariaLabelActive?: string
  ariaLabelInactive?: string
  onActiveChange?: (active: boolean) => void
  variant?: "button"
}

export interface FocusOrbBackgroundProps
  extends FocusOrbBaseProps,
    Omit<
      HTMLAttributes<HTMLDivElement>,
      "children" | "className" | "color" | "height" | "onError" | "style" | "width"
    > {
  ariaHidden?: boolean
  interactive?: boolean
  variant: "background"
}

export type FocusOrbProps = FocusOrbButtonProps | FocusOrbBackgroundProps
