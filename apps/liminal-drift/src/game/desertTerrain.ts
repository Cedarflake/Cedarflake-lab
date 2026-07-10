import { trackConfig } from "@/game/gameConfig"
import { clamp } from "@/game/number"

export const desertTerrain = {
  baseY: -0.24,
  length: 560,
  sideGap: 0.8,
  sideHalfWidth: 58,
  centerZ: -118,
} as const

export function resolveDesertGroundHeight(x: number, z: number) {
  const distanceFromRoad = Math.abs(x) - trackConfig.roadHalfWidth
  const sideInfluence = clamp((distanceFromRoad - 0.8) / 13, 0, 1)
  const farInfluence = clamp((Math.abs(x) - trackConfig.roadHalfWidth - 8) / 22, 0, 1)
  const longRidge = Math.sin(z * 0.026 + x * 0.12) * 0.28
  const crossSlope = Math.sin(z * 0.052 - x * 0.08) * 0.16
  const farDune = Math.sin(z * 0.014 + Math.abs(x) * 0.18) * 0.34 * farInfluence

  return desertTerrain.baseY + (longRidge + crossSlope + farDune) * sideInfluence
}
