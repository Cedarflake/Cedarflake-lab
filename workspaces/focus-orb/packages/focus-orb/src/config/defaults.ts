import type {
  FocusOrbColors,
  ResolvedFocusOrbInteractionOptions,
  ResolvedFocusOrbMotionOptions,
  ResolvedFocusOrbRenderingOptions,
  ResolvedFocusOrbShaderOptions,
} from "../types/focusOrb"

export const defaultTextureSrc = new URL("../assets/noise-watercolor-m3j88gni.webp", import.meta.url).toString()

export const defaultColors: FocusOrbColors = {
  main: "#dcf7ff",
  low: "#0181fe",
  mid: "#a4efff",
  high: "#fffdef",
}

export const defaultMotionOptions: ResolvedFocusOrbMotionOptions = {
  hoverEase: 0.12,
  intensity: 1,
  pressEase: 0.2,
  timeScale: 1,
  voiceSpeedA: 1.7,
  voiceSpeedB: 2.3,
  voiceSpeedC: 3.1,
}

export const defaultInteractionOptions: ResolvedFocusOrbInteractionOptions = {
  hoverScale: 1.02,
  pressedScale: 0.99,
  transitionMs: 300,
}

export const defaultRenderingOptions: ResolvedFocusOrbRenderingOptions = {
  antialias: true,
  canvasSize: 320,
  maxCanvasSize: 2048,
  pixelRatioCap: 2,
  premultipliedAlpha: true,
}

export const defaultShaderOptions: ResolvedFocusOrbShaderOptions = {
  blurRadius: 1.5,
  colorMixAmount: 0.12,
  displacement: 0.01,
  edgeSoftness: 0.0075,
  fbmPowerDamping: 0.55,
  idleSpringDamping: 0.96,
  idleTransitionDuration: 2,
  layer1Amplitude: 1,
  layer1Frequency: 1,
  layer2Amplitude: 1,
  layer2Frequency: 1,
  layer3Amplitude: 1,
  layer3Frequency: 1,
  listenRadius: 0.37,
  mainRadius: 0.49,
  micRadiusBoost: 0.065,
  noiseScale: 1.25,
  originX: 0.5,
  originY: 0.5,
  oscillationPeriod: 4,
  rotation: 0,
  speakRadius: 0.43,
  stateSpringDamping: 0.92,
  stateTransitionDuration: 2,
  textureNoiseStrength: 0.08,
  timeScale: 0.85,
  verticalOffset: 0.09,
  warpPower: 0.19,
  waterColorNoiseScale: 18,
  waterColorNoiseStrength: 0.01,
  waveSpread: 1,
  windSpeed: 0.075,
}
