import { useCallback, useEffect, useRef } from "react"

import { playBackgroundMusic } from "@/app/backgroundMusic"
import { formatNumber } from "@/game/format"
import { resolveGamepadOverlayInput } from "@/game/gamepadInput"
import { useGameStore } from "@/game/useGameStore"
import type { GameStatus } from "@/shared/types"

interface RunStatsProps {
  bestDriftScore: number
  bestScore: number
  checkpointCount: number
  combo: number
  distance: number
  integrity: number
  score: number
  showBest?: boolean
  showHighlights?: boolean
  topSpeed: number
}

function RunStats({
  bestDriftScore,
  bestScore,
  checkpointCount,
  combo,
  distance,
  integrity,
  score,
  showBest,
  showHighlights,
  topSpeed,
}: RunStatsProps) {
  return (
    <dl className="overlay__stats">
      <div className="glass-card overlay__stat">
        <dt>Score</dt>
        <dd>{formatNumber(score)}</dd>
      </div>
      <div className="glass-card overlay__stat">
        <dt>Distance</dt>
        <dd>{formatNumber(distance)} m</dd>
      </div>
      <div className="glass-card overlay__stat">
        <dt>Combo</dt>
        <dd>{combo.toFixed(1)}x</dd>
      </div>
      <div className="glass-card overlay__stat">
        <dt>Integrity</dt>
        <dd>{formatNumber(integrity)}%</dd>
      </div>
      {showHighlights ? (
        <>
          <div className="glass-card overlay__stat">
            <dt>Top speed</dt>
            <dd>{formatNumber(topSpeed * 3.1)} km/h</dd>
          </div>
          <div className="glass-card overlay__stat">
            <dt>Best drift</dt>
            <dd>{formatNumber(bestDriftScore)}</dd>
          </div>
          <div className="glass-card overlay__stat">
            <dt>Exits</dt>
            <dd>{formatNumber(checkpointCount)}</dd>
          </div>
        </>
      ) : null}
      {showBest ? (
        <div className="glass-card overlay__stat">
          <dt>Best</dt>
          <dd>{formatNumber(bestScore)}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function getDialogFocusTargets(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null)
}

function useDialogFocusTrap(status: GameStatus) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (status === "running") {
      return
    }

    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    const activeDialog = dialog
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTargets = getDialogFocusTargets(activeDialog)
    focusTargets[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return
      }

      const targets = getDialogFocusTargets(activeDialog)

      if (targets.length === 0) {
        event.preventDefault()
        return
      }

      const firstTarget = targets[0]
      const lastTarget = targets.at(-1)

      if (!firstTarget || !lastTarget) {
        return
      }

      if (event.shiftKey && document.activeElement === firstTarget) {
        event.preventDefault()
        lastTarget.focus()
      } else if (!event.shiftKey && document.activeElement === lastTarget) {
        event.preventDefault()
        firstTarget.focus()
      } else if (!activeDialog.contains(document.activeElement)) {
        event.preventDefault()
        firstTarget.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)

      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus()
      }
    }
  }, [status])

  return dialogRef
}

function readGamepadOverlayInput() {
  const gamepads =
    typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
      ? navigator.getGamepads()
      : []

  return resolveGamepadOverlayInput(gamepads)
}

function useGamepadOverlayControls({
  onPause,
  onRestart,
  onResume,
  onStart,
  status,
}: {
  onPause: () => void
  onRestart: () => void
  onResume: () => void
  onStart: () => void
  status: GameStatus
}) {
  const previousInputRef = useRef(readGamepadOverlayInput())

  useEffect(() => {
    let animationFrame = 0

    function syncGamepadOverlayInput() {
      const input = readGamepadOverlayInput()
      const confirmPressed = input.confirm && !previousInputRef.current.confirm
      const pausePressed = input.pause && !previousInputRef.current.pause

      if (status === "running" && pausePressed) {
        onPause()
      } else if (status === "paused" && (confirmPressed || pausePressed)) {
        onResume()
      } else if (status === "ready" && confirmPressed) {
        onStart()
      } else if (status === "ended" && confirmPressed) {
        onRestart()
      }

      previousInputRef.current = input
      animationFrame = window.requestAnimationFrame(syncGamepadOverlayInput)
    }

    animationFrame = window.requestAnimationFrame(syncGamepadOverlayInput)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [onPause, onRestart, onResume, onStart, status])
}

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const bestDriftScore = useGameStore((state) => state.bestDriftScore)
  const checkpointCount = useGameStore((state) => state.checkpointCount)
  const hasNewBest = useGameStore((state) => state.hasNewBest)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const topSpeed = useGameStore((state) => state.topSpeed)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)
  const dialogRef = useDialogFocusTrap(status)

  const playMusicFromGesture = useCallback(() => {
    void playBackgroundMusic().catch(() => undefined)
  }, [])

  const handleStart = useCallback(() => {
    playMusicFromGesture()
    start()
  }, [playMusicFromGesture, start])

  const handleResume = useCallback(() => {
    playMusicFromGesture()
    resume()
  }, [playMusicFromGesture, resume])

  const handleRestart = useCallback(() => {
    playMusicFromGesture()
    restart()
  }, [playMusicFromGesture, restart])

  useGamepadOverlayControls({
    onPause: pause,
    onRestart: handleRestart,
    onResume: handleResume,
    onStart: handleStart,
    status,
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }

      if (event.key === "Escape") {
        if (status === "running") pause()
        if (status === "paused") {
          playMusicFromGesture()
          resume()
        }
      }
    }

    function handleBlur() {
      if (status === "running") pause()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("blur", handleBlur)
    }
  }, [pause, playMusicFromGesture, resume, status])

  if (status === "running") {
    return (
      <button type="button" className="ui-button pause-button" onClick={pause}>
        Pause
      </button>
    )
  }

  if (status === "paused") {
    return (
      <div ref={dialogRef} className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
        <div className="glass-panel overlay__panel">
          <p className="overlay__eyebrow">The exit sign is still humming</p>
          <h1>Liminal Drift</h1>
          <p>Resume before the road decides you were never here.</p>
          <RunStats
            bestDriftScore={bestDriftScore}
            bestScore={bestScore}
            checkpointCount={checkpointCount}
            combo={combo}
            distance={distance}
            integrity={integrity}
            score={score}
            showHighlights
            topSpeed={topSpeed}
          />
          <div className="overlay__actions">
            <button type="button" className="ui-button" onClick={handleResume}>
              Resume
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={handleRestart}
            >
              Restart
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === "ended") {
    return (
      <div
        ref={dialogRef}
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Race ended"
      >
        <div className="glass-panel overlay__panel">
          <p className="overlay__eyebrow">
            {hasNewBest
              ? "A stronger trace was left behind"
              : `The trace faded at ${Math.round(score)} points`}
          </p>
          <h1>The mall closes itself</h1>
          {hasNewBest ? (
            <p className="overlay__best-badge">Best {formatNumber(bestScore)}</p>
          ) : null}
          <p>The car is still warm. The corridor has learned your route.</p>
          <RunStats
            bestDriftScore={bestDriftScore}
            bestScore={bestScore}
            checkpointCount={checkpointCount}
            combo={combo}
            distance={distance}
            integrity={integrity}
            score={score}
            showBest
            showHighlights
            topSpeed={topSpeed}
          />
          <div className="overlay__actions">
            <button type="button" className="ui-button" onClick={handleRestart}>
              Drive again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={dialogRef}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Start race"
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">A road remembered by nobody</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the faded highway through empty atriums, gray sinkholes, and exits that keep
          changing their mind.
        </p>
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={handleStart}>
            Start driving
          </button>
        </div>
        <dl className="controls">
          <div className="glass-card controls__item">
            <dt>Drive</dt>
            <dd>
              <span className="controls__desktop">W / S / Up / Down</span>
              <span className="controls__touch">Go / Brake</span>
            </dd>
          </div>
          <div className="glass-card controls__item">
            <dt>Steer</dt>
            <dd>
              <span className="controls__desktop">A / D / Left / Right</span>
              <span className="controls__touch">Left / Right</span>
            </dd>
          </div>
          <div className="glass-card controls__item">
            <dt>Drift</dt>
            <dd>
              <span className="controls__desktop">Space / Shift</span>
              <span className="controls__touch">Drift button</span>
            </dd>
          </div>
          <div className="glass-card controls__item">
            <dt>Pause</dt>
            <dd>
              <span className="controls__desktop">Esc</span>
              <span className="controls__touch">Pause</span>
            </dd>
          </div>
          <div className="glass-card controls__item">
            <dt>Gamepad</dt>
            <dd>
              <span className="controls__desktop">A / RT / LT / Menu</span>
              <span className="controls__touch">Desktop only</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
