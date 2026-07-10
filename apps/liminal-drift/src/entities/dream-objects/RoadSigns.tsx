import { useMemo } from "react"
import type { RefObject } from "react"

import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, sceneryConfig, trackConfig } from "@/game/gameConfig"

import { createSideSceneryItems } from "./shared"
import { useScrollingScenery } from "./useScrollingScenery"

interface RoadSignsProps {
  distanceRef: RefObject<number>
}

interface SignNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const { roadSigns, visibility } = sceneryConfig

function SignNode({ index, nodeRef }: SignNodeProps) {
  const isWarningSign = index % 2 === 0

  return (
    <group ref={nodeRef}>
      <mesh castShadow receiveShadow position={[-0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.58, 0.1]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.32, 0.1]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[0, 0, isWarningSign ? 0.04 : -0.04]}>
        <boxGeometry args={[2.62, 0.82, 0.14]} />
        <meshStandardMaterial
          color={isWarningSign ? "#f4dc8c" : "#c9d7cf"}
          emissive={isWarningSign ? "#d59d62" : "#8fbeb7"}
          emissiveIntensity={0.16}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0.32, 0.06, 0.09]} rotation={[0, 0, isWarningSign ? 0.62 : 0]}>
        <boxGeometry args={isWarningSign ? [0.62, 0.1, 0.04] : [1.38, 0.08, 0.04]} />
        <meshBasicMaterial color="#6d5f62" transparent opacity={0.62} />
      </mesh>
      <mesh position={isWarningSign ? [-0.16, -0.04, 0.1] : [-0.32, -0.16, 0.1]}>
        <boxGeometry args={isWarningSign ? [0.46, 0.1, 0.04] : [0.86, 0.07, 0.04]} />
        <meshBasicMaterial color="#6d5f62" transparent opacity={0.44} />
      </mesh>
    </group>
  )
}

export function RoadSigns({ distanceRef }: RoadSignsProps) {
  const signs = useMemo(() => createSideSceneryItems(roadSigns.count), [])
  const setSignRef = useScrollingScenery({
    cycleDistance: roadSigns.cycleDistance,
    distanceRef,
    items: signs,
    originDistance: ({ index }) => roadSigns.originStart + index * roadSigns.spacing,
    speed: roadSigns.speed,
    visibilityRange: visibility,
    update: ({ item, node, z }) => {
      const { index, side } = item
      const x =
        side *
        (trackConfig.roadHalfWidth +
          roadSigns.baseSideOffset +
          (index % roadSigns.sideBandCount) * roadSigns.sideBandOffset)
      const groundY = resolveDesertGroundHeight(x, z)

      node.position.set(
        x,
        groundY + roadSigns.baseHeight + (index % 2) * roadSigns.alternateHeightOffset,
        z,
      )
      node.rotation.set(0, side > 0 ? -roadSigns.yaw : roadSigns.yaw, side * roadSigns.roll)
    },
  })

  return (
    <>
      {signs.map(({ index }) => (
        <SignNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setSignRef(index, node)
          }}
        />
      ))}
    </>
  )
}
