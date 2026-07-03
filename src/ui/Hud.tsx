import { formatNumber } from "@/game/format"
import { trackConfig } from "@/game/gameConfig"
import { useGameStore } from "@/game/useGameStore"

export function Hud() {
  const status = useGameStore((state) => state.status)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const speed = useGameStore((state) => state.speed)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const driftCharge = useGameStore((state) => state.driftCharge)
  const lastEvent = useGameStore((state) => state.lastEvent)
  const driftPercent = Math.min((driftCharge / 1600) * 100, 100)
  const isDriftReady = driftCharge >= 120
  const checkpointPercent =
    ((distance % trackConfig.checkpointSpacing) / trackConfig.checkpointSpacing) * 100
  const nextCheckpointDistance =
    trackConfig.checkpointSpacing - (distance % trackConfig.checkpointSpacing)

  return (
    <section
      className="hud"
      data-drift-ready={isDriftReady ? "true" : undefined}
      data-low-integrity={integrity <= 32 ? "true" : undefined}
      aria-label="Race telemetry"
      aria-hidden={status !== "running"}
    >
      <div className="glass-card hud__cluster hud__cluster--primary">
        <span className="hud__label">Score</span>
        <strong>{formatNumber(score)}</strong>
        <small>Best {formatNumber(bestScore)}</small>
      </div>

      <div className="glass-card hud__cluster">
        <span className="hud__label">Speed</span>
        <strong>{formatNumber(speed * 3.1)}</strong>
        <small>km/h</small>
      </div>

      <div className="glass-card hud__cluster">
        <span className="hud__label">Distance</span>
        <strong>{formatNumber(distance)}</strong>
        <small>Next exit {formatNumber(nextCheckpointDistance)} m</small>
      </div>

      <div className="glass-card hud__cluster">
        <span className="hud__label">Combo</span>
        <strong>{combo.toFixed(1)}x</strong>
        <small>{lastEvent}</small>
      </div>

      <div className="hud__meters">
        <div className="glass-card hud__meter">
          <span className="hud__meter-label">Integrity</span>
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
          <span className="hud__meter-value">{formatNumber(integrity)}%</span>
        </div>
        <div className="glass-card hud__meter">
          <span className="hud__meter-label">Drift</span>
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
          <span className="hud__meter-value">{formatNumber(driftCharge)}</span>
        </div>
        <div className="glass-card hud__meter">
          <span className="hud__meter-label">Exit</span>
          <div
            className="hud__checkpoint"
            role="progressbar"
            aria-label="Checkpoint progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(checkpointPercent)}
          >
            <span style={{ inlineSize: `${checkpointPercent}%` }} />
          </div>
          <span className="hud__meter-value">{formatNumber(nextCheckpointDistance)} m</span>
        </div>
      </div>
    </section>
  )
}
