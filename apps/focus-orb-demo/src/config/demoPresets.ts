import { focusOrbDefaultRenderingOptions } from "@cedarflake/focus-orb"

import type { AudioControlKey, PalettePreset, RenderingControls } from "../types/demo"

export const fallbackPalette: PalettePreset = {
  name: "Aqua",
  colors: {
    high: "#fffdef",
    low: "#0181fe",
    main: "#dcf7ff",
    mid: "#a4efff",
  },
}

export const palettePresets: PalettePreset[] = [
  fallbackPalette,
  {
    name: "Signal",
    colors: {
      high: "#f8ffe8",
      low: "#0057ff",
      main: "#c9fff2",
      mid: "#7df7cf",
    },
  },
  {
    name: "Ember",
    colors: {
      high: "#fff5d6",
      low: "#5a2cff",
      main: "#ffe1ca",
      mid: "#ff9277",
    },
  },
]

export const defaultAudioControls: Record<AudioControlKey, number> = {
  avgMag0: 0.28,
  avgMag1: 0.24,
  avgMag2: 0.2,
  avgMag3: 0.32,
  micLevel: 0.18,
}

export const defaultRenderingControls: RenderingControls = {
  antialias: focusOrbDefaultRenderingOptions.antialias,
  canvasSize: focusOrbDefaultRenderingOptions.canvasSize,
  maxCanvasSize: focusOrbDefaultRenderingOptions.maxCanvasSize,
  pixelRatioCap: focusOrbDefaultRenderingOptions.pixelRatioCap,
  premultipliedAlpha: focusOrbDefaultRenderingOptions.premultipliedAlpha,
}
