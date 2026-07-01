import type { BoostGate, Checkpoint, MemoryShard, Obstacle } from "../src/shared/types"

import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleMemoryShards,
  createVisibleObstacles,
} from "../src/game/generation"

const samples = [0, 250, 1200, 4800, 12000]

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertObstacle(obstacle: Obstacle) {
  assert(obstacle.lane >= -2 && obstacle.lane <= 2, `Invalid obstacle lane ${obstacle.id}`)
  assert(obstacle.distance > 0, `Invalid obstacle distance ${obstacle.id}`)
  assert(obstacle.width > 0, `Invalid obstacle width ${obstacle.id}`)
}

function assertBoostGate(boostGate: BoostGate) {
  assert(boostGate.lane >= -1 && boostGate.lane <= 1, `Invalid boost lane ${boostGate.id}`)
  assert(boostGate.distance > 0, `Invalid boost distance ${boostGate.id}`)
  assert(boostGate.width > 0, `Invalid boost width ${boostGate.id}`)
}

function assertCheckpoint(checkpoint: Checkpoint) {
  assert(checkpoint.distance > 0, `Invalid checkpoint distance ${checkpoint.id}`)
  assert(checkpoint.width > 0, `Invalid checkpoint width ${checkpoint.id}`)
}

function assertMemoryShard(memoryShard: MemoryShard) {
  assert(memoryShard.lane >= -2 && memoryShard.lane <= 2, `Invalid shard lane ${memoryShard.id}`)
  assert(memoryShard.distance > 0, `Invalid shard distance ${memoryShard.id}`)
}

for (const distance of samples) {
  const obstacles = createVisibleObstacles(distance)
  const boostGates = createVisibleBoostGates(distance)
  const checkpoints = createVisibleCheckpoints(distance)
  const memoryShards = createVisibleMemoryShards(distance)

  assert(obstacles.length > 0, `Expected visible obstacles at distance ${distance}`)
  assert(boostGates.length > 0, `Expected visible boost gates at distance ${distance}`)
  assert(checkpoints.length > 0, `Expected visible checkpoints at distance ${distance}`)
  assert(memoryShards.length > 0, `Expected visible memory shards at distance ${distance}`)

  obstacles.forEach(assertObstacle)
  boostGates.forEach(assertBoostGate)
  checkpoints.forEach(assertCheckpoint)
  memoryShards.forEach(assertMemoryShard)

  const nearestObstacle = obstacles.find((obstacle) => obstacle.distance >= distance)
  const nearestBoostGate = boostGates.find((boostGate) => boostGate.distance >= distance)
  const nearestCheckpoint = checkpoints.find((checkpoint) => checkpoint.distance >= distance)
  const nearestMemoryShard = memoryShards.find((memoryShard) => memoryShard.distance >= distance)

  assert(Boolean(nearestObstacle), `Expected forward obstacle at distance ${distance}`)
  assert(Boolean(nearestBoostGate), `Expected forward boost gate at distance ${distance}`)
  assert(Boolean(nearestCheckpoint), `Expected forward checkpoint at distance ${distance}`)
  assert(Boolean(nearestMemoryShard), `Expected forward memory shard at distance ${distance}`)

  console.log("generation ok", {
    distance,
    nearestObstacle: nearestObstacle?.id,
    nearestBoostGate: nearestBoostGate?.id,
    nearestCheckpoint: nearestCheckpoint?.id,
    nearestMemoryShard: nearestMemoryShard?.id,
  })
}
