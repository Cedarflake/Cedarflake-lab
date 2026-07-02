import { useEffect } from "react"

import { formatNumber } from "@/game/format"
import { useGameStore } from "@/game/useGameStore"

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

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
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
            <button type="button" onClick={resume} autoFocus>
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
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Race ended">
        <div className="overlay__panel">
          <p className="overlay__eyebrow">Signal lost at {Math.round(score)} points</p>
          <h1>The mall closes itself</h1>
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
            <button type="button" onClick={restart} autoFocus>
              Drive again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Start race">
      <div className="overlay__panel">
        <p className="overlay__eyebrow">Dreamcore night driving</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the pastel highway through empty atriums, pool-blue tunnels, and checkpoints that
          feel half remembered.
        </p>
        <div className="overlay__actions">
          <button type="button" onClick={start} autoFocus>
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
