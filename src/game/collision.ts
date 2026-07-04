import type { Obstacle } from "@/shared/types"

export const playerCollisionHalfWidth = 0.95
export const playerModelHalfDepth = 1.7
export const playerModelHalfWidth = 1.17
export const memoryShardModelHalfDepth = 0.95
export const memoryShardModelHalfWidth = 0.95
export const wallObstacleWidth = 2.45
export const nearMissPadding = 0.85

interface FootprintOverlapInput {
  aHalfDepth: number
  aHalfWidth: number
  aX: number
  aZ: number
  bHalfDepth: number
  bHalfWidth: number
  bX: number
  bZ: number
}

export interface MemoryShardCollectionInput {
  playerX: number
  playerZ: number
  shardX: number
  shardZ: number
}

export function resolveObstacleHalfWidth(obstacle: Obstacle) {
  if (obstacle.kind === "hole") {
    return obstacle.width * 1.05
  }

  if (obstacle.kind === "wall") {
    return wallObstacleWidth / 2
  }

  return obstacle.width / 2
}

export function resolveObstacleCollisionHalfWidth(obstacle: Obstacle) {
  return resolveObstacleHalfWidth(obstacle) + playerCollisionHalfWidth
}

export function resolveObstacleNearMissHalfWidth(obstacle: Obstacle) {
  return resolveObstacleCollisionHalfWidth(obstacle) + nearMissPadding
}

export function resolveFootprintOverlap({
  aHalfDepth,
  aHalfWidth,
  aX,
  aZ,
  bHalfDepth,
  bHalfWidth,
  bX,
  bZ,
}: FootprintOverlapInput) {
  return (
    Math.abs(aX - bX) <= aHalfWidth + bHalfWidth && Math.abs(aZ - bZ) <= aHalfDepth + bHalfDepth
  )
}

export function resolveMemoryShardCollection({
  playerX,
  playerZ,
  shardX,
  shardZ,
}: MemoryShardCollectionInput) {
  return resolveFootprintOverlap({
    aHalfDepth: playerModelHalfDepth,
    aHalfWidth: playerModelHalfWidth,
    aX: playerX,
    aZ: playerZ,
    bHalfDepth: memoryShardModelHalfDepth,
    bHalfWidth: memoryShardModelHalfWidth,
    bX: shardX,
    bZ: shardZ,
  })
}

export function hasMemoryShardPassedPlayer(shardZ: number, playerZ = 0) {
  return shardZ > playerZ + playerModelHalfDepth + memoryShardModelHalfDepth
}
