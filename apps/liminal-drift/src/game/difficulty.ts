import { trackConfig } from "./gameConfig"

export interface RunDifficulty {
  maxSpeed: number
}

export function resolveRunDifficulty(): RunDifficulty {
  // Keep this static until difficulty progression has a distance or time contract.
  return {
    maxSpeed: trackConfig.maxSpeed,
  }
}
