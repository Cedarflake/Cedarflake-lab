import type { BoostGate, Checkpoint, Obstacle } from "../src/shared/types"

import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
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

for (const distance of samples) {
  const obstacles = createVisibleObstacles(distance)
  const boostGates = createVisibleBoostGates(distance)
  const checkpoints = createVisibleCheckpoints(distance)

  assert(obstacles.length > 0, `Expected visible obstacles at distance ${distance}`)
  assert(boostGates.length > 0, `Expected visible boost gates at distance ${distance}`)
  assert(checkpoints.length > 0, `Expected visible checkpoints at distance ${distance}`)

  obstacles.forEach(assertObstacle)
  boostGates.forEach(assertBoostGate)
  checkpoints.forEach(assertCheckpoint)

  const nearestObstacle = obstacles.find((obstacle) => obstacle.distance >= distance)
  const nearestBoostGate = boostGates.find((boostGate) => boostGate.distance >= distance)
  const nearestCheckpoint = checkpoints.find((checkpoint) => checkpoint.distance >= distance)

  assert(Boolean(nearestObstacle), `Expected forward obstacle at distance ${distance}`)
  assert(Boolean(nearestBoostGate), `Expected forward boost gate at distance ${distance}`)
  assert(Boolean(nearestCheckpoint), `Expected forward checkpoint at distance ${distance}`)

  console.log("generation ok", {
    distance,
    nearestObstacle: nearestObstacle?.id,
    nearestBoostGate: nearestBoostGate?.id,
    nearestCheckpoint: nearestCheckpoint?.id,
  })
}
