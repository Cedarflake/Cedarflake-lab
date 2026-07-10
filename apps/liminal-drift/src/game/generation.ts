import type {
  BoostGate,
  BoostLane,
  Checkpoint,
  MemoryShard,
  Obstacle,
  RoadLane,
} from "@/shared/types"

import { trackConfig } from "./gameConfig"

const obstacleKinds: Array<Obstacle["kind"]> = ["pillar", "hole", "wall"]
const boostLanes = [-1, 0, 1] as const satisfies readonly BoostLane[]
const roadLanes = [-2, -1, 0, 1, 2] as const satisfies readonly RoadLane[]
const modelSeparationDistance = 18
const placementDistanceOffsets = [0, 18, -18, 30, -30] as const
type GeneratedLane = BoostLane | RoadLane

interface TrackPlacement<TLane extends GeneratedLane = GeneratedLane> {
  lane: TLane
  distance: number
}

function hash(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function pickBoostLane(seed: number): BoostLane {
  return boostLanes[Math.floor(hash(seed) * boostLanes.length)] ?? 0
}

function pickRoadLane(seed: number): RoadLane {
  return roadLanes[Math.floor(hash(seed) * roadLanes.length)] ?? 0
}

function arePlacementsCrowded(a: TrackPlacement, b: TrackPlacement) {
  return (
    Math.abs(a.distance - b.distance) < modelSeparationDistance && Math.abs(a.lane - b.lane) <= 1
  )
}

function resolvePlacementCrowdingScore(placement: TrackPlacement, blocker: TrackPlacement) {
  const laneCrowding = Math.max(0, 2 - Math.abs(placement.lane - blocker.lane))
  const distanceCrowding = Math.max(
    0,
    modelSeparationDistance - Math.abs(placement.distance - blocker.distance),
  )

  return laneCrowding * distanceCrowding
}

function resolveSeparatedPlacement<TLane extends GeneratedLane>(
  basePlacement: TrackPlacement<TLane>,
  lanes: readonly TLane[],
  blockers: TrackPlacement[],
  seed: number,
) {
  let leastCrowdedPlacement: TrackPlacement<TLane> = basePlacement
  let leastCrowdedScore = Number.POSITIVE_INFINITY
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
      const placement: TrackPlacement<TLane> = {
        lane,
        distance: basePlacement.distance + distanceOffset,
      }

      if (!blockers.some((blocker) => arePlacementsCrowded(placement, blocker))) {
        return placement
      }

      const crowdingScore = blockers.reduce(
        (score, blocker) => score + resolvePlacementCrowdingScore(placement, blocker),
        0,
      )

      if (crowdingScore < leastCrowdedScore) {
        leastCrowdedPlacement = placement
        leastCrowdedScore = crowdingScore
      }
    }
  }

  return leastCrowdedPlacement
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
  const lane = pickRoadLane(index + 2)
  const kind = obstacleKinds[Math.floor(hash(index + 9) * obstacleKinds.length)] ?? "pillar"

  return {
    id: `obstacle-${index}`,
    lane,
    distance: 90 + index * 46 + hash(index + 21) * 22,
    width: kind === "wall" ? trackConfig.wallObstacleWidth : 1.35 + hash(index + 31) * 0.7,
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
    lane: pickBoostLane(index + 43),
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
    width: 2.35,
  }
}

export function createMemoryShardAt(index: number): MemoryShard {
  const basePlacement = {
    lane: pickRoadLane(index + 71),
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
