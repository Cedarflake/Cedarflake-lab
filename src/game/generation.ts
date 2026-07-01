import type { Checkpoint, Obstacle } from "@/shared/types"

import { trackConfig } from "./gameConfig"

const obstacleKinds: Array<Obstacle["kind"]> = ["pillar", "pool", "arch"]

function hash(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function createObstacleAt(index: number): Obstacle {
  const lane = Math.floor(hash(index + 2) * 5) - 2
  const kind = obstacleKinds[Math.floor(hash(index + 9) * obstacleKinds.length)] ?? "pillar"

  return {
    id: `obstacle-${index}`,
    lane,
    distance: 90 + index * 46 + hash(index + 21) * 22,
    width: kind === "arch" ? 2.2 : 1.35 + hash(index + 31) * 0.7,
    kind,
  }
}

export function createCheckpointAt(index: number): Checkpoint {
  return {
    id: `checkpoint-${index}`,
    distance: trackConfig.checkpointSpacing * (index + 1),
    width: 11.6,
  }
}

export function createVisibleObstacles(distance: number, lookBehind = 24, lookAhead = 270) {
  const spacing = 46
  const startIndex = Math.max(0, Math.floor((distance - 90 - lookBehind) / spacing))
  const endIndex = Math.ceil((distance + lookAhead - 90) / spacing)

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) =>
    createObstacleAt(startIndex + offset),
  )
}

export function createVisibleCheckpoints(distance: number, lookBehind = 24, lookAhead = 270) {
  const startIndex = Math.max(
    0,
    Math.floor((distance - lookBehind) / trackConfig.checkpointSpacing),
  )
  const endIndex = Math.ceil((distance + lookAhead) / trackConfig.checkpointSpacing)

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) =>
    createCheckpointAt(startIndex + offset),
  )
}
