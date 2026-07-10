import { useMemo, useState } from "react"
import {
  focusOrbDefaultInteractionOptions,
  focusOrbDefaultMotionOptions,
  focusOrbDefaultRenderingOptions,
  focusOrbDefaultShaderOptions,
  focusOrbTextureUrl,
  type FocusOrbAudioInput,
  type FocusOrbFit,
  type FocusOrbRenderStatus,
  type FocusOrbState,
  type ResolvedFocusOrbInteractionOptions,
  type ResolvedFocusOrbMotionOptions,
  type ResolvedFocusOrbShaderOptions,
} from "@cedarflake/focus-orb"

import { essentialMotionControls } from "../config/controlDefinitions"
import { defaultAudioControls, defaultRenderingControls, fallbackPalette, palettePresets } from "../config/demoPresets"
import { texturePresets, type TextureChoice } from "../texturePresets"
import type {
  AudioControlKey,
  InteractionControlKey,
  MotionControlKey,
  PreviewMode,
  RenderingBooleanKey,
  RenderingControls,
  RenderingNumberKey,
  ShaderControlKey,
  SliderDefinition,
} from "../types/demo"
import { ControlPanel } from "./ControlPanel"
import { PreviewPanel } from "./PreviewPanel"
import { SiteHeader } from "./SiteHeader"
import { UsageDetails } from "./UsageDetails"

const defaultTextureToken = "__focusOrbTextureUrl__"

export function DemoApp() {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("button")
  const [fit, setFit] = useState<FocusOrbFit>("contain")
  const [isActive, setIsActive] = useState(true)
  const [state, setState] = useState<FocusOrbState>("speak")
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [textureChoice, setTextureChoice] = useState<TextureChoice>("default")
  const [buttonSize, setButtonSize] = useState(256)
  const [buttonOrbScale, setButtonOrbScale] = useState(1)
  const [backgroundOrbScale, setBackgroundOrbScale] = useState(1)
  const [isPaused, setIsPaused] = useState(false)
  const [isManualAudio, setIsManualAudio] = useState(false)
  const [audio, setAudio] = useState<Record<AudioControlKey, number>>({ ...defaultAudioControls })
  const [interaction, setInteraction] = useState<ResolvedFocusOrbInteractionOptions>({
    ...focusOrbDefaultInteractionOptions,
  })
  const [motion, setMotion] = useState<ResolvedFocusOrbMotionOptions>({ ...focusOrbDefaultMotionOptions })
  const [rendering, setRendering] = useState<RenderingControls>({ ...defaultRenderingControls })
  const [shader, setShader] = useState<ResolvedFocusOrbShaderOptions>({ ...focusOrbDefaultShaderOptions })
  const [renderStatus, setRenderStatus] = useState<FocusOrbRenderStatus | null>(null)
  const colors = palettePresets[paletteIndex]?.colors ?? fallbackPalette.colors
  const selectedTexturePreset = texturePresets.find((preset) => preset.id === textureChoice)
  const textureSrc = selectedTexturePreset?.src ?? focusOrbTextureUrl
  const resolvedAudio = useMemo<FocusOrbAudioInput | undefined>(
    () =>
      isManualAudio
        ? {
            avgMag: [audio.avgMag0, audio.avgMag1, audio.avgMag2, audio.avgMag3] as const,
            micLevel: audio.micLevel,
            simulated: false,
          }
        : undefined,
    [audio, isManualAudio],
  )
  const resolvedRendering = useMemo<RenderingControls>(
    () => ({
      antialias: rendering.antialias,
      canvasSize: rendering.canvasSize,
      maxCanvasSize: rendering.maxCanvasSize,
      pixelRatioCap: rendering.pixelRatioCap,
      premultipliedAlpha: rendering.premultipliedAlpha,
    }),
    [rendering],
  )
  const codeSample = useMemo(() => {
    const componentName = previewMode === "background" ? "FocusOrbBackground" : "FocusOrbButton"
    const codeTextureSrc = textureChoice === "default" ? defaultTextureToken : textureSrc
    const sharedProps = {
      audio: resolvedAudio,
      colors,
      fit,
      motion,
      paused: isPaused,
      rendering: resolvedRendering,
      shader,
      state,
      textureSrc: codeTextureSrc,
    }
    const props =
      previewMode === "background"
        ? {
            ...sharedProps,
            orbScale: backgroundOrbScale,
          }
        : {
            ...sharedProps,
            height: buttonSize,
            interaction,
            orbScale: buttonOrbScale,
            width: buttonSize,
          }

    return `<${componentName}
  {...${JSON.stringify(props, null, 2).replace(/\n/g, "\n  ").replace(`"${defaultTextureToken}"`, "focusOrbTextureUrl")}}
/>`
  }, [
    backgroundOrbScale,
    buttonSize,
    buttonOrbScale,
    colors,
    fit,
    interaction,
    isPaused,
    motion,
    previewMode,
    resolvedAudio,
    resolvedRendering,
    shader,
    state,
    textureChoice,
    textureSrc,
  ])

  function selectPreviewMode(nextPreviewMode: PreviewMode) {
    if (nextPreviewMode === previewMode) {
      return
    }

    setPreviewMode(nextPreviewMode)
    setRenderStatus(null)
  }

  function selectState(nextState: FocusOrbState) {
    setState(nextState)
    setIsActive(nextState === "speak")
  }

  function updateButtonActive(nextActive: boolean) {
    setIsActive(nextActive)
    setState(nextActive ? "speak" : "listen")
  }

  function resetAllControls() {
    resetCommonControls()
    resetButtonControls()
    resetBackgroundControls()
    resetAdvancedControls()
    resetShaderControls()
  }

  function resetAppearanceControls() {
    setPaletteIndex(0)
    setTextureChoice("default")
  }

  function resetButtonControls() {
    setButtonSize(256)
    setButtonOrbScale(1)
    resetInteractionControls()
  }

  function resetBackgroundControls() {
    setBackgroundOrbScale(1)
  }

  function resetAudioControls() {
    setAudio({ ...defaultAudioControls })
    setIsManualAudio(false)
  }

  function resetInteractionControls() {
    setInteraction({ ...focusOrbDefaultInteractionOptions })
  }

  function resetCommonControls() {
    resetAppearanceControls()
    resetMotionControls(essentialMotionControls)
    setIsActive(true)
    setIsPaused(false)
    selectPreviewMode("button")
    setState("speak")
  }

  function resetAdvancedControls() {
    setFit("contain")
    resetAudioControls()
    resetMotionControls()
    resetRenderingControls()
  }

  function resetMotionControls(definitions?: readonly SliderDefinition<MotionControlKey>[]) {
    if (!definitions) {
      setMotion({ ...focusOrbDefaultMotionOptions })
      return
    }

    setMotion((current) => {
      const next = { ...current }

      for (const definition of definitions) {
        next[definition.key] = focusOrbDefaultMotionOptions[definition.key]
      }

      return next
    })
  }

  function resetRenderingControls() {
    setRendering({ ...defaultRenderingControls })
    setRenderStatus(null)
  }

  function resetShaderControls(definitions?: readonly SliderDefinition<ShaderControlKey>[]) {
    if (!definitions) {
      setShader({ ...focusOrbDefaultShaderOptions })
      return
    }

    setShader((current) => {
      const next = { ...current }

      for (const definition of definitions) {
        next[definition.key] = focusOrbDefaultShaderOptions[definition.key]
      }

      return next
    })
  }

  function updateAudio(key: AudioControlKey, value: number) {
    setAudio((current) => ({ ...current, [key]: value }))
  }

  function updateInteraction(key: InteractionControlKey, value: number) {
    setInteraction((current) => ({ ...current, [key]: value }))
  }

  function updateMotion(key: MotionControlKey, value: number) {
    setMotion((current) => ({ ...current, [key]: value }))
  }

  function updateRendering(key: RenderingNumberKey, value: number) {
    setRendering((current) => ({ ...current, [key]: value }))
    setRenderStatus(null)
  }

  function updateRenderingFlag(key: RenderingBooleanKey, value: boolean) {
    setRendering((current) => ({ ...current, [key]: value }))
    setRenderStatus(null)
  }

  function updateShader(key: ShaderControlKey, value: number) {
    setShader((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="site-shell">
      <SiteHeader />

      <section className="hero-section" id="preview" aria-labelledby="demo-title">
        <div className="hero-copy">
          <p className="eyebrow">React WebGL Component</p>
          <h1 id="demo-title">Focus Orb</h1>
          <p className="hero-copy__summary">Button or ambient background, tuned from the same canvas renderer.</p>
        </div>

        <div className="playground-grid">
          <PreviewPanel
            backgroundOrbScale={backgroundOrbScale}
            buttonOrbScale={buttonOrbScale}
            buttonSize={buttonSize}
            colors={colors}
            fit={fit}
            interaction={interaction}
            isActive={isActive}
            isPaused={isPaused}
            motion={motion}
            onButtonActiveChange={updateButtonActive}
            onPreviewModeChange={selectPreviewMode}
            onRenderStatusChange={setRenderStatus}
            previewMode={previewMode}
            rendering={resolvedRendering}
            renderStatus={renderStatus}
            resolvedAudio={resolvedAudio}
            shader={shader}
            state={state}
            textureSrc={textureSrc}
          />

          <ControlPanel
            audio={audio}
            backgroundOrbScale={backgroundOrbScale}
            buttonOrbScale={buttonOrbScale}
            buttonSize={buttonSize}
            fit={fit}
            interaction={interaction}
            isManualAudio={isManualAudio}
            isPaused={isPaused}
            motion={motion}
            onAdvancedReset={resetAdvancedControls}
            onAllReset={resetAllControls}
            onAudioChange={updateAudio}
            onAudioModeChange={setIsManualAudio}
            onBackgroundOrbScaleChange={setBackgroundOrbScale}
            onBackgroundReset={resetBackgroundControls}
            onButtonOrbScaleChange={setButtonOrbScale}
            onButtonReset={resetButtonControls}
            onButtonSizeChange={setButtonSize}
            onCommonReset={resetCommonControls}
            onFitChange={setFit}
            onInteractionChange={updateInteraction}
            onMotionChange={updateMotion}
            onPaletteChange={setPaletteIndex}
            onPausedChange={setIsPaused}
            onRenderingChange={updateRendering}
            onRenderingFlagChange={updateRenderingFlag}
            onShaderChange={updateShader}
            onShaderReset={resetShaderControls}
            onStateSelect={selectState}
            onTextureChange={setTextureChoice}
            paletteIndex={paletteIndex}
            previewMode={previewMode}
            rendering={rendering}
            shader={shader}
            state={state}
            textureChoice={textureChoice}
          />
        </div>
      </section>

      <UsageDetails codeSample={codeSample} />
    </main>
  )
}
