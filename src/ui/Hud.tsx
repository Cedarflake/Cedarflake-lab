import { formatNumber } from "@/game/format"
import { useGameStore } from "@/game/useGameStore"

export function Hud() {
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const speed = useGameStore((state) => state.speed)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const driftCharge = useGameStore((state) => state.driftCharge)
  const lastEvent = useGameStore((state) => state.lastEvent)
  const driftPercent = Math.min((driftCharge / 1600) * 100, 100)

  return (
    <section className="hud" aria-label="Race telemetry">
      <div className="hud__cluster hud__cluster--primary">
        <span className="hud__label">Score</span>
        <strong>{formatNumber(score)}</strong>
        <small>Best {formatNumber(bestScore)}</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Speed</span>
        <strong>{formatNumber(speed * 3.1)}</strong>
        <small>km/h</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Distance</span>
        <strong>{formatNumber(distance)}</strong>
        <small>meters</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Combo</span>
        <strong>{combo.toFixed(1)}x</strong>
        <small>{lastEvent}</small>
      </div>

      <div className="hud__meters">
        <div
          className="hud__integrity"
          role="progressbar"
          aria-label="Vehicle integrity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(integrity)}
        >
          <span style={{ inlineSize: `${integrity}%` }} />
        </div>
        <div
          className="hud__drift"
          role="progressbar"
          aria-label="Drift charge"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(driftPercent)}
        >
          <span style={{ inlineSize: `${driftPercent}%` }} />
        </div>
      </div>
    </section>
  )
}
