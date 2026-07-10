export interface RunStatsData {
  bestDriftScore: number
  bestScore: number
  checkpointCount: number
  combo: number
  distance: number
  integrity: number
  score: number
  topSpeed: number
}

export interface OverlayDialogActions {
  onRestart: () => void
  onResume: () => void
  onStart: () => void
}
