import { wrapDistance } from "@/game/number"

export type ScenerySide = -1 | 1

export interface SideSceneryItem {
  index: number
  side: ScenerySide
}

export function createSideSceneryItems(length: number) {
  return Array.from({ length }, (_, index): SideSceneryItem => ({
    index,
    side: index % 2 === 0 ? -1 : 1,
  }))
}

export function resolveSceneryZ(
  originDistance: number,
  distance: number,
  speed: number,
  cycle: number,
) {
  return 10 - wrapDistance(originDistance - distance * speed, cycle)
}
