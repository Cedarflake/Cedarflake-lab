import { formatNumber } from "@/game/format"

import type { RunStatsData } from "./types"

interface RunStatsProps extends RunStatsData {
  showBest?: boolean
  showHighlights?: boolean
}

export function RunStats({
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
