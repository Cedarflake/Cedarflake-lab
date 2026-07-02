import type { BoostGate, Checkpoint, MemoryShard, Obstacle } from "../src/shared/types"

import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleMemoryShards,
  createVisibleObstacles,
} from "../src/game/generation"

const samples = [0, 250, 1200, 4800, 12000]
const lookBehind = 24
const lookAhead = 270

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertUniqueIds(items: Array<{ id: string }>, label: string) {
  const ids = new Set(items.map((item) => item.id))

  assert(ids.size === items.length, `Expected unique ${label} ids`)
}

function assertSortedByDistance(items: Array<{ distance: number }>, label: string) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]
    const current = items[index]

    if (!previous || !current) {
      throw new Error(`Missing ${label} distance item at index ${index}`)
    }

    assert(
      current.distance >= previous.distance,
      `Expected ${label} distances to be sorted at index ${index}`,
    )
  }
}

function assertVisibleWindow(items: Array<{ distance: number }>, distance: number, label: string) {
  const nearestBehind = items.findLast((item) => item.distance <= distance)
  const nearestAhead = items.find((item) => item.distance >= distance)

  if (nearestBehind) {
    assert(
      nearestBehind.distance >= distance - lookBehind - 140,
      `Expected ${label} behind window near distance ${distance}`,
    )
  }

  assert(Boolean(nearestAhead), `Expected forward ${label} at distance ${distance}`)
  assert(
    nearestAhead ? nearestAhead.distance <= distance + lookAhead + 180 : false,
    `Expected ${label} ahead window near distance ${distance}`,
  )
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

  assertUniqueIds(obstacles, "obstacle")
  assertUniqueIds(boostGates, "boost gate")
  assertUniqueIds(checkpoints, "checkpoint")
  assertUniqueIds(memoryShards, "memory shard")

  assertSortedByDistance(obstacles, "obstacle")
  assertSortedByDistance(boostGates, "boost gate")
  assertSortedByDistance(checkpoints, "checkpoint")
  assertSortedByDistance(memoryShards, "memory shard")

  const nearestObstacle = obstacles.find((obstacle) => obstacle.distance >= distance)
  const nearestBoostGate = boostGates.find((boostGate) => boostGate.distance >= distance)
  const nearestCheckpoint = checkpoints.find((checkpoint) => checkpoint.distance >= distance)
  const nearestMemoryShard = memoryShards.find((memoryShard) => memoryShard.distance >= distance)

  assertVisibleWindow(obstacles, distance, "obstacle")
  assertVisibleWindow(boostGates, distance, "boost gate")
  assertVisibleWindow(checkpoints, distance, "checkpoint")
  assertVisibleWindow(memoryShards, distance, "memory shard")

  console.log("generation ok", {
    distance,
    nearestObstacle: nearestObstacle?.id,
    nearestBoostGate: nearestBoostGate?.id,
    nearestCheckpoint: nearestCheckpoint?.id,
    nearestMemoryShard: nearestMemoryShard?.id,
  })
}
