import type {
  AudioControlKey,
  InteractionControlKey,
  MotionControlKey,
  RenderingNumberKey,
  ShaderControlKey,
  SliderDefinition,
} from "../types/demo"

export const essentialMotionControls = [
  { key: "intensity", label: "Intensity", max: 1.8, min: 0.2, step: 0.01 },
  { key: "timeScale", label: "Time scale", max: 2.2, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<MotionControlKey>[]

export const advancedMotionControls = [
  { key: "hoverEase", label: "Hover ease", max: 0.4, min: 0.01, step: 0.01 },
  { key: "pressEase", label: "Press ease", max: 0.5, min: 0.01, step: 0.01 },
  { key: "voiceSpeedA", label: "Voice speed A", max: 5, min: 0, step: 0.01 },
  { key: "voiceSpeedB", label: "Voice speed B", max: 5, min: 0, step: 0.01 },
  { key: "voiceSpeedC", label: "Voice speed C", max: 5, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<MotionControlKey>[]

export const interactionControls = [
  { key: "hoverScale", label: "Hover scale", max: 1.12, min: 1, step: 0.001 },
  { key: "pressedScale", label: "Pressed scale", max: 1, min: 0.9, step: 0.001 },
  { key: "transitionMs", label: "Transition", max: 900, min: 0, step: 10 },
] satisfies readonly SliderDefinition<InteractionControlKey>[]

export const renderingControls = [
  { key: "canvasSize", label: "Canvas size", max: 768, min: 160, step: 1 },
  { key: "maxCanvasSize", label: "Max canvas size", max: 4096, min: 256, step: 1 },
  { key: "pixelRatioCap", label: "Pixel ratio cap", max: 4, min: 0.5, step: 0.1 },
] satisfies readonly SliderDefinition<RenderingNumberKey>[]

export const audioControls = [
  { key: "micLevel", label: "Mic level", max: 1, min: 0, step: 0.01 },
  { key: "avgMag0", label: "Band 0", max: 1, min: 0, step: 0.01 },
  { key: "avgMag1", label: "Band 1", max: 1, min: 0, step: 0.01 },
  { key: "avgMag2", label: "Band 2", max: 1, min: 0, step: 0.01 },
  { key: "avgMag3", label: "Band 3", max: 1, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<AudioControlKey>[]

export const shaderShapeControls = [
  { key: "mainRadius", label: "Main radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "listenRadius", label: "Listen radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "speakRadius", label: "Speak radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "micRadiusBoost", label: "Mic radius boost", max: 0.2, min: 0, step: 0.001 },
  { key: "originX", label: "Origin X", max: 1, min: 0, step: 0.001 },
  { key: "originY", label: "Origin Y", max: 1, min: 0, step: 0.001 },
  { key: "rotation", label: "Rotation", max: 3.14, min: -3.14, step: 0.001 },
  { key: "verticalOffset", label: "Vertical offset", max: 0.3, min: -0.3, step: 0.001 },
  { key: "waveSpread", label: "Wave spread", max: 2.4, min: 0.2, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

export const shaderFlowControls = [
  { key: "displacement", label: "Displacement", max: 0.08, min: 0, step: 0.001 },
  { key: "oscillationPeriod", label: "Oscillation period", max: 12, min: 0.5, step: 0.01 },
  { key: "warpPower", label: "Warp power", max: 0.5, min: 0, step: 0.001 },
  { key: "noiseScale", label: "Noise scale", max: 4, min: 0.1, step: 0.01 },
  { key: "windSpeed", label: "Wind speed", max: 0.5, min: 0, step: 0.001 },
  { key: "timeScale", label: "Shader time scale", max: 2, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

export const shaderMaterialControls = [
  { key: "waterColorNoiseScale", label: "Watercolor scale", max: 48, min: 1, step: 0.1 },
  { key: "waterColorNoiseStrength", label: "Watercolor strength", max: 0.08, min: 0, step: 0.001 },
  { key: "textureNoiseStrength", label: "Texture grain", max: 0.24, min: 0, step: 0.001 },
  { key: "blurRadius", label: "Blur radius", max: 4, min: 0.1, step: 0.01 },
  { key: "edgeSoftness", label: "Edge softness", max: 0.04, min: 0.001, step: 0.0005 },
  { key: "fbmPowerDamping", label: "FBM damping", max: 1.5, min: 0.1, step: 0.01 },
  { key: "colorMixAmount", label: "Color mix", max: 1, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

export const shaderLayerControls = [
  { key: "layer1Amplitude", label: "Layer 1 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer1Frequency", label: "Layer 1 frequency", max: 4, min: 0.1, step: 0.01 },
  { key: "layer2Amplitude", label: "Layer 2 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer2Frequency", label: "Layer 2 frequency", max: 4, min: 0.1, step: 0.01 },
  { key: "layer3Amplitude", label: "Layer 3 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer3Frequency", label: "Layer 3 frequency", max: 4, min: 0.1, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

export const shaderTransitionControls = [
  { key: "idleSpringDamping", label: "Idle damping", max: 1, min: 0, step: 0.001 },
  { key: "stateSpringDamping", label: "State damping", max: 1, min: 0, step: 0.001 },
  { key: "idleTransitionDuration", label: "Idle duration", max: 6, min: 0.1, step: 0.01 },
  { key: "stateTransitionDuration", label: "State duration", max: 6, min: 0.1, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]
