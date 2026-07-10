import { formatNumber, formatRacerNumber, formatScoreNumber } from "@/game/format"
import { trackConfig } from "@/game/gameConfig"
import { useGameStore } from "@/game/useGameStore"
import type { DebugMode } from "@/game/debugMode"

interface HudProps {
  debugMode: DebugMode
}

export function Hud({ debugMode }: HudProps) {
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
      data-low-integrity={integrity <= trackConfig.lowIntegrityThreshold ? "true" : undefined}
      data-status={status}
      aria-label="Race telemetry"
      aria-hidden={status !== "running"}
    >
      {debugMode.isEnabled ? (
        <div className="hud__debug-badge" aria-label="Debug mode">
          <span>DEV</span>
          <strong>{debugMode.label}</strong>
        </div>
      ) : null}

      <div className="hud__bar-parameters" aria-label="Bar parameters">
        <div className="hud__bar-row">
          <span className="hud__bar-label">Integrity</span>
          <div
            className="hud__bar hud__bar--integrity"
            role="progressbar"
            aria-label="Vehicle integrity"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(integrity)}
          >
            <span style={{ inlineSize: `${integrity}%` }} />
          </div>
          <span className="hud__bar-value">{formatNumber(integrity)}%</span>
        </div>
        <div className="hud__bar-row">
          <span className="hud__bar-label">Drift</span>
          <div
            className="hud__bar hud__bar--drift"
            role="progressbar"
            aria-label="Drift charge"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(driftPercent)}
          >
            <span style={{ inlineSize: `${driftPercent}%` }} />
          </div>
          <span className="hud__bar-value">{formatRacerNumber(driftCharge)}</span>
        </div>
        <div className="hud__bar-row">
          <span className="hud__bar-label">Exit</span>
          <div
            className="hud__bar hud__bar--checkpoint"
            role="progressbar"
            aria-label="Checkpoint progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(checkpointPercent)}
          >
            <span style={{ inlineSize: `${checkpointPercent}%` }} />
          </div>
          <span className="hud__bar-value">{formatRacerNumber(nextCheckpointDistance)} m</span>
        </div>
      </div>

      <div className="hud__racer-parameters" aria-label="Racer parameters">
        <div className="hud__dial hud__dial--score">
          <span className="hud__dial-label">Score</span>
          <strong>{formatScoreNumber(score)}</strong>
          <small>Best {formatScoreNumber(bestScore)}</small>
        </div>
        <div className="hud__dial">
          <span className="hud__dial-label">Speed</span>
          <strong>{formatRacerNumber(speed * 3.1)}</strong>
          <small>km/h</small>
        </div>
        <div className="hud__dial">
          <span className="hud__dial-label">Distance</span>
          <strong>{formatRacerNumber(distance)}</strong>
          <small>m</small>
        </div>
        <div className="hud__dial">
          <span className="hud__dial-label">Combo</span>
          <strong>{combo.toFixed(1)}x</strong>
          <small>{lastEvent}</small>
        </div>
      </div>
    </section>
  )
}
