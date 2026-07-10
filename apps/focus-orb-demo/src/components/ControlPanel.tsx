import { type ChangeEvent } from "react"
import { RotateCcw } from "lucide-react"
import type {
  FocusOrbFit,
  FocusOrbState,
  ResolvedFocusOrbInteractionOptions,
  ResolvedFocusOrbMotionOptions,
  ResolvedFocusOrbShaderOptions,
} from "@cedarflake/focus-orb"

import {
  advancedMotionControls,
  audioControls,
  essentialMotionControls,
  interactionControls,
  renderingControls,
  shaderFlowControls,
  shaderLayerControls,
  shaderMaterialControls,
  shaderShapeControls,
  shaderTransitionControls,
} from "../config/controlDefinitions"
import { palettePresets } from "../config/demoPresets"
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
import { ControlSummary } from "./controls/ControlSummary"
import { RangeControl } from "./controls/RangeControl"
import { SliderStack } from "./controls/SliderStack"

interface ControlPanelProps {
  audio: Record<AudioControlKey, number>
  backgroundOrbScale: number
  buttonOrbScale: number
  buttonSize: number
  fit: FocusOrbFit
  interaction: ResolvedFocusOrbInteractionOptions
  isManualAudio: boolean
  isPaused: boolean
  motion: ResolvedFocusOrbMotionOptions
  onAdvancedReset: () => void
  onAllReset: () => void
  onAudioChange: (key: AudioControlKey, value: number) => void
  onAudioModeChange: (isManualAudio: boolean) => void
  onBackgroundOrbScaleChange: (value: number) => void
  onBackgroundReset: () => void
  onButtonOrbScaleChange: (value: number) => void
  onButtonReset: () => void
  onButtonSizeChange: (value: number) => void
  onCommonReset: () => void
  onFitChange: (fit: FocusOrbFit) => void
  onInteractionChange: (key: InteractionControlKey, value: number) => void
  onMotionChange: (key: MotionControlKey, value: number) => void
  onPaletteChange: (paletteIndex: number) => void
  onPausedChange: (isPaused: boolean) => void
  onRenderingChange: (key: RenderingNumberKey, value: number) => void
  onRenderingFlagChange: (key: RenderingBooleanKey, value: boolean) => void
  onShaderChange: (key: ShaderControlKey, value: number) => void
  onShaderReset: (definitions?: readonly SliderDefinition<ShaderControlKey>[]) => void
  onStateSelect: (state: FocusOrbState) => void
  onTextureChange: (textureChoice: TextureChoice) => void
  paletteIndex: number
  previewMode: PreviewMode
  rendering: RenderingControls
  shader: ResolvedFocusOrbShaderOptions
  state: FocusOrbState
  textureChoice: TextureChoice
}

export function ControlPanel({
  audio,
  backgroundOrbScale,
  buttonOrbScale,
  buttonSize,
  fit,
  interaction,
  isManualAudio,
  isPaused,
  motion,
  onAdvancedReset,
  onAllReset,
  onAudioChange,
  onAudioModeChange,
  onBackgroundOrbScaleChange,
  onBackgroundReset,
  onButtonOrbScaleChange,
  onButtonReset,
  onButtonSizeChange,
  onCommonReset,
  onFitChange,
  onInteractionChange,
  onMotionChange,
  onPaletteChange,
  onPausedChange,
  onRenderingChange,
  onRenderingFlagChange,
  onShaderChange,
  onShaderReset,
  onStateSelect,
  onTextureChange,
  paletteIndex,
  previewMode,
  rendering,
  shader,
  state,
  textureChoice,
}: ControlPanelProps) {
  return (
    <aside className="control-panel" aria-label="Focus Orb controls">
      <div className="control-panel__toolbar">
        <span>Controls</span>
        <button className="reset-button reset-button--strong" onClick={onAllReset} type="button">
          <RotateCcw aria-hidden="true" className="reset-button__icon" />
          Reset all
        </button>
      </div>

      <details className="control-disclosure" open>
        <ControlSummary label="Common" onReset={onCommonReset} resetLabel="Reset Common" />
        <div className="control-group">
          <span className="group-label">State</span>
          <div className="segmented-control" aria-label="Orb state">
            <button
              aria-pressed={state === "speak"}
              onClick={() => {
                onStateSelect("speak")
              }}
              type="button"
            >
              Speak
            </button>
            <button
              aria-pressed={state === "listen"}
              onClick={() => {
                onStateSelect("listen")
              }}
              type="button"
            >
              Listen
            </button>
          </div>
        </div>

        <div className="palette-list" aria-label="Color palette">
          {palettePresets.map((palette, index) => (
            <button
              aria-pressed={paletteIndex === index}
              className="palette-button"
              key={palette.name}
              onClick={() => {
                onPaletteChange(index)
              }}
              type="button"
            >
              <span className="palette-button__swatches" aria-hidden="true">
                <span style={{ background: palette.colors.main }} />
                <span style={{ background: palette.colors.low }} />
                <span style={{ background: palette.colors.mid }} />
                <span style={{ background: palette.colors.high }} />
              </span>
              <span>{palette.name}</span>
            </button>
          ))}
        </div>

        <div className="control-group">
          <span className="group-label">Texture</span>
          <div className="texture-list" aria-label="Texture preset">
            {texturePresets.map((preset) => (
              <button
                aria-pressed={textureChoice === preset.id}
                className="texture-button"
                key={preset.id}
                onClick={() => {
                  onTextureChange(preset.id)
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="texture-button__preview"
                  style={{ backgroundImage: `url(${preset.src})` }}
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <SliderStack definitions={essentialMotionControls} onChange={onMotionChange} values={motion} />
        <label className="toggle-control">
          <input
            checked={isPaused}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onPausedChange(event.currentTarget.checked)
            }}
            type="checkbox"
          />
          <span>Pause animation</span>
        </label>
      </details>

      {previewMode === "button" ? (
        <details className="control-disclosure" open>
          <ControlSummary label="Button only" onReset={onButtonReset} resetLabel="Reset Button" />
          <div className="range-stack">
            <RangeControl
              label="Button size"
              max={340}
              min={160}
              onChange={onButtonSizeChange}
              step={1}
              value={buttonSize}
            />
            <RangeControl
              label="Button orb scale"
              max={1.45}
              min={0.72}
              onChange={onButtonOrbScaleChange}
              step={0.01}
              value={buttonOrbScale}
            />
          </div>
          <div className="control-group">
            <span className="group-label">Interaction</span>
            <SliderStack definitions={interactionControls} onChange={onInteractionChange} values={interaction} />
          </div>
        </details>
      ) : (
        <details className="control-disclosure" open>
          <ControlSummary label="Background only" onReset={onBackgroundReset} resetLabel="Reset Background" />
          <RangeControl
            label="Background orb scale"
            max={2.8}
            min={0.6}
            onChange={onBackgroundOrbScaleChange}
            step={0.01}
            value={backgroundOrbScale}
          />
        </details>
      )}

      <details className="control-disclosure">
        <ControlSummary label="Advanced" onReset={onAdvancedReset} resetLabel="Reset Advanced" />
        <div className="control-group">
          <span className="group-label">Fit</span>
          <div className="segmented-control" aria-label="Orb fit">
            <button
              aria-pressed={fit === "contain"}
              onClick={() => {
                onFitChange("contain")
              }}
              type="button"
            >
              Contain
            </button>
            <button
              aria-pressed={fit === "cover"}
              onClick={() => {
                onFitChange("cover")
              }}
              type="button"
            >
              Cover
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="group-label">Motion response</span>
          <SliderStack definitions={advancedMotionControls} onChange={onMotionChange} values={motion} />
        </div>

        <div className="control-group">
          <span className="group-label">Manual audio</span>
          <label className="toggle-control">
            <input
              checked={isManualAudio}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                onAudioModeChange(event.currentTarget.checked)
              }}
              type="checkbox"
            />
            <span>Use manual audio input</span>
          </label>
          <SliderStack definitions={audioControls} disabled={!isManualAudio} onChange={onAudioChange} values={audio} />
        </div>

        <div className="control-group">
          <span className="group-label">Rendering</span>
          <SliderStack definitions={renderingControls} onChange={onRenderingChange} values={rendering} />
          <label className="toggle-control">
            <input
              checked={rendering.antialias}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                onRenderingFlagChange("antialias", event.currentTarget.checked)
              }}
              type="checkbox"
            />
            <span>Antialias</span>
          </label>
          <label className="toggle-control">
            <input
              checked={rendering.premultipliedAlpha}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                onRenderingFlagChange("premultipliedAlpha", event.currentTarget.checked)
              }}
              type="checkbox"
            />
            <span>Premultiplied alpha</span>
          </label>
        </div>
      </details>

      <details className="control-disclosure">
        <ControlSummary
          label="Shader Lab"
          onReset={() => {
            onShaderReset()
          }}
          resetLabel="Reset Shader Lab"
        />
        <details className="control-subsection">
          <ControlSummary
            label="Shape"
            onReset={() => {
              onShaderReset(shaderShapeControls)
            }}
            resetLabel="Reset Shader Shape"
          />
          <SliderStack definitions={shaderShapeControls} onChange={onShaderChange} values={shader} />
        </details>

        <details className="control-subsection">
          <ControlSummary
            label="Flow"
            onReset={() => {
              onShaderReset(shaderFlowControls)
            }}
            resetLabel="Reset Shader Flow"
          />
          <SliderStack definitions={shaderFlowControls} onChange={onShaderChange} values={shader} />
        </details>

        <details className="control-subsection">
          <ControlSummary
            label="Material"
            onReset={() => {
              onShaderReset(shaderMaterialControls)
            }}
            resetLabel="Reset Shader Material"
          />
          <SliderStack definitions={shaderMaterialControls} onChange={onShaderChange} values={shader} />
        </details>

        <details className="control-subsection">
          <ControlSummary
            label="Layers"
            onReset={() => {
              onShaderReset(shaderLayerControls)
            }}
            resetLabel="Reset Shader Layers"
          />
          <SliderStack definitions={shaderLayerControls} onChange={onShaderChange} values={shader} />
        </details>

        <details className="control-subsection">
          <ControlSummary
            label="Transitions"
            onReset={() => {
              onShaderReset(shaderTransitionControls)
            }}
            resetLabel="Reset Shader Transitions"
          />
          <SliderStack definitions={shaderTransitionControls} onChange={onShaderChange} values={shader} />
        </details>
      </details>
    </aside>
  )
}
