import {
  FocusOrbBackground,
  FocusOrbButton,
  type FocusOrbAudioInput,
  type FocusOrbColors,
  type FocusOrbFit,
  type FocusOrbRenderStatus,
  type FocusOrbState,
  type ResolvedFocusOrbInteractionOptions,
  type ResolvedFocusOrbMotionOptions,
  type ResolvedFocusOrbShaderOptions,
} from "@cedarflake/focus-orb"

import type { PreviewMode, RenderingControls } from "../types/demo"

interface PreviewPanelProps {
  backgroundOrbScale: number
  buttonOrbScale: number
  buttonSize: number
  colors: FocusOrbColors
  fit: FocusOrbFit
  interaction: ResolvedFocusOrbInteractionOptions
  isActive: boolean
  isPaused: boolean
  motion: ResolvedFocusOrbMotionOptions
  onButtonActiveChange: (isActive: boolean) => void
  onPreviewModeChange: (previewMode: PreviewMode) => void
  onRenderStatusChange: (status: FocusOrbRenderStatus) => void
  previewMode: PreviewMode
  rendering: RenderingControls
  renderStatus: FocusOrbRenderStatus | null
  resolvedAudio: FocusOrbAudioInput | undefined
  shader: ResolvedFocusOrbShaderOptions
  state: FocusOrbState
  textureSrc: string
}

export function PreviewPanel({
  backgroundOrbScale,
  buttonOrbScale,
  buttonSize,
  colors,
  fit,
  interaction,
  isActive,
  isPaused,
  motion,
  onButtonActiveChange,
  onPreviewModeChange,
  onRenderStatusChange,
  previewMode,
  rendering,
  renderStatus,
  resolvedAudio,
  shader,
  state,
  textureSrc,
}: PreviewPanelProps) {
  const renderStatusLabel = renderStatus
    ? `Ready ${renderStatus.canvasWidth} x ${renderStatus.canvasHeight}`
    : "Loading renderer"

  return (
    <section className="preview-panel" aria-label="Live component preview">
      <div className="preview-toolbar">
        <div className="segmented-control" aria-label="Preview mode">
          <button
            aria-pressed={previewMode === "button"}
            onClick={() => {
              onPreviewModeChange("button")
            }}
            type="button"
          >
            Button
          </button>
          <button
            aria-pressed={previewMode === "background"}
            onClick={() => {
              onPreviewModeChange("background")
            }}
            type="button"
          >
            Background
          </button>
        </div>
        <span className="status-pill" aria-live="polite">
          {renderStatusLabel}
        </span>
      </div>

      <div className="preview-stage" data-mode={previewMode}>
        {previewMode === "button" ? (
          <FocusOrbButton
            active={isActive}
            ariaLabelActive="Exit focus mode"
            ariaLabelInactive="Enter focus mode"
            audio={resolvedAudio}
            colors={colors}
            fit={fit}
            height={buttonSize}
            interaction={interaction}
            motion={motion}
            onActiveChange={onButtonActiveChange}
            onRenderComplete={onRenderStatusChange}
            orbScale={buttonOrbScale}
            paused={isPaused}
            rendering={rendering}
            shader={shader}
            state={state}
            textureSrc={textureSrc}
            width={buttonSize}
          />
        ) : (
          <div className="background-preview">
            <FocusOrbBackground
              className="background-preview__orb"
              audio={resolvedAudio}
              colors={colors}
              fit={fit}
              motion={motion}
              onRenderComplete={onRenderStatusChange}
              orbScale={backgroundOrbScale}
              paused={isPaused}
              rendering={rendering}
              shader={shader}
              state={state}
              textureSrc={textureSrc}
            />
            <div className="background-preview__content">
              <span className="background-preview__label">Focus session</span>
              <strong>28:40</strong>
              <span>{state === "speak" ? "Speaking" : "Listening"}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
