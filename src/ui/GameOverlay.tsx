import { useEffect, useRef } from "react"

import { formatNumber } from "@/game/format"
import { useGameStore } from "@/game/useGameStore"
import type { GameStatus } from "@/shared/types"

import "./GameOverlay.css"

interface RunStatsProps {
  bestScore: number
  combo: number
  distance: number
  integrity: number
  score: number
  showBest?: boolean
}

function RunStats({ bestScore, combo, distance, integrity, score, showBest }: RunStatsProps) {
  return (
    <dl className="overlay__stats">
      <div>
        <dt>Score</dt>
        <dd>{formatNumber(score)}</dd>
      </div>
      <div>
        <dt>Distance</dt>
        <dd>{formatNumber(distance)} m</dd>
      </div>
      <div>
        <dt>Combo</dt>
        <dd>{combo.toFixed(1)}x</dd>
      </div>
      <div>
        <dt>Integrity</dt>
        <dd>{formatNumber(integrity)}%</dd>
      </div>
      {showBest ? (
        <div>
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

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const hasNewBest = useGameStore((state) => state.hasNewBest)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)
  const dialogRef = useDialogFocusTrap(status)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }

      if (event.key === "Escape") {
        if (status === "running") pause()
        if (status === "paused") resume()
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
  }, [pause, resume, status])

  if (status === "running") {
    return (
      <button type="button" className="pause-button" onClick={pause}>
        Pause
      </button>
    )
  }

  if (status === "paused") {
    return (
      <div ref={dialogRef} className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
        <div className="overlay__panel">
          <p className="overlay__eyebrow">A quiet exit sign hums overhead</p>
          <h1>Liminal Drift</h1>
          <p>Resume before the road forgets where it was going.</p>
          <RunStats
            bestScore={bestScore}
            combo={combo}
            distance={distance}
            integrity={integrity}
            score={score}
          />
          <div className="overlay__actions">
            <button type="button" onClick={resume}>
              Resume
            </button>
            <button type="button" className="button-secondary" onClick={restart}>
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
        <div className="overlay__panel">
          <p className="overlay__eyebrow">
            {hasNewBest ? "New best signal recorded" : `Signal lost at ${Math.round(score)} points`}
          </p>
          <h1>The mall closes itself</h1>
          {hasNewBest ? (
            <p className="overlay__best-badge">Best {formatNumber(bestScore)}</p>
          ) : null}
          <p>The car is still warm. The corridor is longer than before.</p>
          <RunStats
            bestScore={bestScore}
            combo={combo}
            distance={distance}
            integrity={integrity}
            score={score}
            showBest
          />
          <div className="overlay__actions">
            <button type="button" onClick={restart}>
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
      <div className="overlay__panel">
        <p className="overlay__eyebrow">Dreamcore night driving</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the pastel highway through empty atriums, pool-blue tunnels, and checkpoints that
          feel half remembered.
        </p>
        <div className="overlay__actions">
          <button type="button" onClick={start}>
            Start driving
          </button>
        </div>
        <dl className="controls">
          <div>
            <dt>Drive</dt>
            <dd>W / S / Up / Down</dd>
          </div>
          <div>
            <dt>Steer</dt>
            <dd>A / D / Left / Right</dd>
          </div>
          <div>
            <dt>Drift</dt>
            <dd>Space / Shift</dd>
          </div>
          <div>
            <dt>Pause</dt>
            <dd>Esc</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
