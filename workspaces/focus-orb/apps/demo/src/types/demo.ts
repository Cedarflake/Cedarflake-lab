import type {
  FocusOrbColors,
  ResolvedFocusOrbInteractionOptions,
  ResolvedFocusOrbMotionOptions,
  ResolvedFocusOrbRenderingOptions,
  ResolvedFocusOrbShaderOptions,
} from "@igcrystal/focus-orb"

export type PreviewMode = "button" | "background"
export type MotionControlKey = Extract<keyof ResolvedFocusOrbMotionOptions, string>
export type ShaderControlKey = Extract<keyof ResolvedFocusOrbShaderOptions, string>
export type InteractionControlKey = Extract<keyof ResolvedFocusOrbInteractionOptions, string>
export type RenderingNumberKey = "canvasSize" | "maxCanvasSize" | "pixelRatioCap"
export type RenderingBooleanKey = "antialias" | "premultipliedAlpha"
export type AudioControlKey = "avgMag0" | "avgMag1" | "avgMag2" | "avgMag3" | "micLevel"

export interface PalettePreset {
  name: string
  colors: FocusOrbColors
}

export interface SliderDefinition<Key extends string> {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

export interface RenderingControls
  extends Pick<
    ResolvedFocusOrbRenderingOptions,
    "antialias" | "canvasSize" | "maxCanvasSize" | "pixelRatioCap" | "premultipliedAlpha"
  > {}
