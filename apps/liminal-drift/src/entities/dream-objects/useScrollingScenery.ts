import { useCallback, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { RootState } from "@react-three/fiber"
import type { Group } from "three"

import { wrapDistance } from "@/game/number"

import { resolveSceneryZ } from "./shared"
import type { SideSceneryItem } from "./shared"

interface SceneryVisibilityRange {
  far: number
  near: number
}

interface ScrollingSceneryContext<Item extends SideSceneryItem> {
  camera: RootState["camera"]
  distance: number
  elapsedTime: number
  item: Item
  node: Group
  z: number
}

interface UseScrollingSceneryOptions<Item extends SideSceneryItem> {
  cycleDistance: number
  distanceRef: RefObject<number>
  items: readonly Item[]
  originDistance: (item: Item) => number
  speed: number
  update: (context: ScrollingSceneryContext<Item>) => void
  visibilityRange: SceneryVisibilityRange
}

const maxFrameDelta = 0.1
const motionTimeCycleSeconds = 24 * 60 * 60

export function useScrollingScenery<Item extends SideSceneryItem>({
  cycleDistance,
  distanceRef,
  items,
  originDistance,
  speed,
  update,
  visibilityRange,
}: UseScrollingSceneryOptions<Item>) {
  const elapsedTimeRef = useRef(0)
  const nodeRefs = useRef<Array<Group | null>>([])

  useFrame(({ camera }, delta) => {
    const distance = distanceRef.current
    elapsedTimeRef.current = wrapDistance(
      elapsedTimeRef.current + Math.min(delta, maxFrameDelta),
      motionTimeCycleSeconds,
    )
    const elapsedTime = elapsedTimeRef.current

    items.forEach((item) => {
      const node = nodeRefs.current[item.index]
      if (!node) return

      const z = resolveSceneryZ(originDistance(item), distance, speed, cycleDistance)

      node.visible = z < visibilityRange.near && z > visibilityRange.far
      update({
        camera,
        distance,
        elapsedTime,
        item,
        node,
        z,
      })
    })
  })

  return useCallback((index: number, node: Group | null) => {
    nodeRefs.current[index] = node
  }, [])
}
