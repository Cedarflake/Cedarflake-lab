import type { RefObject } from "react"

import { formatNumber } from "@/game/format"
import type { GameStatus } from "@/shared/types"

import { ControlsLegend } from "./ControlsLegend"
import { RunStats } from "./RunStats"
import type { RunStatsData } from "./types"

interface DialogRefProps {
  dialogRef: RefObject<HTMLDivElement | null>
  isExiting?: boolean
}

interface PausedDialogProps extends DialogRefProps {
  onRestart: () => void
  onResume: () => void
  stats: RunStatsData
}

interface EndedDialogProps extends DialogRefProps {
  hasNewBest: boolean
  onRestart: () => void
  stats: RunStatsData
}

interface RaceControlButtonProps {
  onPause: () => void
  onResume: () => void
  onStart: () => void
  status: GameStatus
}

interface StartDialogProps extends DialogRefProps {
  gamepadStatusText: string
  onStart: () => void
}

export function RaceControlButton({ onPause, onResume, onStart, status }: RaceControlButtonProps) {
  const isRunning = status === "running"
  const isPaused = status === "paused"
  const label = isRunning ? "Pause" : isPaused ? "Resume" : "Start driving"
  const action = isRunning ? onPause : isPaused ? onResume : onStart

  return (
    <button
      type="button"
      className="race-control-button"
      data-action={isRunning ? "pause" : "start"}
      aria-label={label}
      onClick={action}
    >
      <span className="race-control-button__icon" aria-hidden="true" />
    </button>
  )
}

export function StartDialog({
  dialogRef,
  gamepadStatusText,
  isExiting,
  onStart,
}: StartDialogProps) {
  return (
    <div
      ref={dialogRef}
      className="overlay"
      data-exiting={isExiting ? "true" : undefined}
      role="dialog"
      aria-hidden={isExiting ? true : undefined}
      aria-label="Start race"
      aria-modal={isExiting ? undefined : true}
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">A road remembered by nobody</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the faded highway through empty atriums, gray sinkholes, and exits that keep
          changing their mind.
        </p>
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onStart}>
            Start driving
          </button>
        </div>
        <ControlsLegend />
        <p className="overlay__gamepad-status" aria-live="polite">
          {gamepadStatusText}
        </p>
      </div>
    </div>
  )
}

export function PausedDialog({
  dialogRef,
  isExiting,
  onRestart,
  onResume,
  stats,
}: PausedDialogProps) {
  return (
    <div
      ref={dialogRef}
      className="overlay"
      data-exiting={isExiting ? "true" : undefined}
      role="dialog"
      aria-hidden={isExiting ? true : undefined}
      aria-label="Paused"
      aria-modal={isExiting ? undefined : true}
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">The exit sign is still humming</p>
        <h1>Liminal Drift</h1>
        <p>Resume before the road decides you were never here.</p>
        <RunStats {...stats} showHighlights />
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="ui-button ui-button--secondary" onClick={onRestart}>
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}

export function EndedDialog({
  dialogRef,
  hasNewBest,
  isExiting,
  onRestart,
  stats,
}: EndedDialogProps) {
  return (
    <div
      ref={dialogRef}
      className="overlay"
      data-exiting={isExiting ? "true" : undefined}
      role="dialog"
      aria-hidden={isExiting ? true : undefined}
      aria-label="Race ended"
      aria-modal={isExiting ? undefined : true}
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">
          {hasNewBest
            ? "A stronger trace was left behind"
            : `The trace faded at ${Math.round(stats.score)} points`}
        </p>
        <h1>The mall closes itself</h1>
        {hasNewBest ? (
          <p className="overlay__best-badge">Best {formatNumber(stats.bestScore)}</p>
        ) : null}
        <p>The car is still warm. The corridor has learned your route.</p>
        <RunStats {...stats} showBest showHighlights />
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onRestart}>
            Drive again
          </button>
        </div>
      </div>
    </div>
  )
}
