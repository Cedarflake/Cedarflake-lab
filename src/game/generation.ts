import type { BoostGate, Checkpoint, MemoryShard, Obstacle } from "@/shared/types"

import { trackConfig } from "./gameConfig"

const obstacleKinds: Array<Obstacle["kind"]> = ["pillar", "hole", "wall"]
const boostLanes = [-1, 0, 1] as const
const roadLanes = [-2, -1, 0, 1, 2] as const
const modelSeparationDistance = 18
const placementDistanceOffsets = [0, 18, -18, 30, -30] as const

interface TrackPlacement {
  lane: number
  distance: number
}

function hash(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function arePlacementsCrowded(a: TrackPlacement, b: TrackPlacement) {
  return (
    Math.abs(a.distance - b.distance) < modelSeparationDistance && Math.abs(a.lane - b.lane) <= 1
  )
}

function resolveSeparatedPlacement(
  basePlacement: TrackPlacement,
  lanes: readonly number[],
  blockers: TrackPlacement[],
  seed: number,
) {
  const sortedLanes = [...lanes].sort((a, b) => {
    const aDistance = Math.abs(a - basePlacement.lane)
    const bDistance = Math.abs(b - basePlacement.lane)

    if (aDistance !== bDistance) {
      return aDistance - bDistance
    }

    return hash(seed + a * 17) - hash(seed + b * 17)
  })

  for (const distanceOffset of placementDistanceOffsets) {
    for (const lane of sortedLanes) {
      const placement = {
        lane,
        distance: basePlacement.distance + distanceOffset,
      }

      if (!blockers.some((blocker) => arePlacementsCrowded(placement, blocker))) {
        return placement
      }
    }
  }

  return basePlacement
}

function createNearbyObstacleBlockers(distance: number) {
  const obstacleIndex = Math.max(0, Math.floor((distance - 90) / 46) - 1)

  return Array.from({ length: 4 }, (_, offset) => {
    const obstacle = createObstacleAt(obstacleIndex + offset)

    return {
      lane: obstacle.lane,
      distance: obstacle.distance,
    }
  })
}

export function createObstacleAt(index: number): Obstacle {
  const lane = Math.floor(hash(index + 2) * 5) - 2
  const kind = obstacleKinds[Math.floor(hash(index + 9) * obstacleKinds.length)] ?? "pillar"

  return {
    id: `obstacle-${index}`,
    lane,
    distance: 90 + index * 46 + hash(index + 21) * 22,
    width: kind === "wall" ? 1.55 : 1.35 + hash(index + 31) * 0.7,
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

export function createBoostGateAt(index: number): BoostGate {
  const basePlacement = {
    lane: Math.floor(hash(index + 43) * 3) - 1,
    distance: 125 + index * 138 + hash(index + 53) * 28,
  }
  const placement = resolveSeparatedPlacement(
    basePlacement,
    boostLanes,
    createNearbyObstacleBlockers(basePlacement.distance),
    index + 101,
  )

  return {
    id: `boost-${index}`,
    lane: placement.lane,
    distance: placement.distance,
    width: 1.8,
  }
}

export function createMemoryShardAt(index: number): MemoryShard {
  const basePlacement = {
    lane: Math.floor(hash(index + 71) * 5) - 2,
    distance: 70 + index * 92 + hash(index + 83) * 18,
  }
  const boostIndex = Math.max(0, Math.floor((basePlacement.distance - 125) / 138) - 1)
  const boostBlockers = Array.from({ length: 3 }, (_, offset) => {
    const boostGate = createBoostGateAt(boostIndex + offset)

    return {
      lane: boostGate.lane,
      distance: boostGate.distance,
    }
  })
  const placement = resolveSeparatedPlacement(
    basePlacement,
    roadLanes,
    [...createNearbyObstacleBlockers(basePlacement.distance), ...boostBlockers],
    index + 211,
  )

  return {
    id: `memory-shard-${index}`,
    lane: placement.lane,
    distance: placement.distance,
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

export function createVisibleBoostGates(distance: number, lookBehind = 24, lookAhead = 270) {
  const spacing = 138
  const startIndex = Math.max(0, Math.floor((distance - 125 - lookBehind) / spacing))
  const endIndex = Math.ceil((distance + lookAhead - 125) / spacing)

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) =>
    createBoostGateAt(startIndex + offset),
  )
}

export function createVisibleMemoryShards(distance: number, lookBehind = 24, lookAhead = 270) {
  const spacing = 92
  const startIndex = Math.max(0, Math.floor((distance - 70 - lookBehind) / spacing))
  const endIndex = Math.ceil((distance + lookAhead - 70) / spacing)

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) =>
    createMemoryShardAt(startIndex + offset),
  )
}
