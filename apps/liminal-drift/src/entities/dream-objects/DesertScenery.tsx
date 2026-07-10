import { useMemo } from "react"
import type { RefObject } from "react"

import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { sceneryConfig, trackConfig } from "@/game/gameConfig"

import { DuneCluster, RuinCluster } from "./desertPrimitives"
import { createSideSceneryItems } from "./shared"
import { useScrollingScenery } from "./useScrollingScenery"

interface DesertSceneryProps {
  distanceRef: RefObject<number>
}

interface DesertNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const { desert, visibility } = sceneryConfig

function DesertSetPieceNode({ index, nodeRef }: DesertNodeProps) {
  const scale = 0.86 + (index % 5) * 0.14

  return (
    <group ref={nodeRef} scale={scale}>
      <DuneCluster index={index} />
      {index % 2 === 0 && <RuinCluster index={index} />}
    </group>
  )
}

function DesertFieldNode({ index, nodeRef }: DesertNodeProps) {
  const scale = 1.2 + (index % 6) * 0.18
  const hasRuin = index % 4 === 0

  return (
    <group ref={nodeRef} scale={scale}>
      <DuneCluster index={index + 11} />
      {hasRuin && (
        <group position={[0.4, 0.08, -0.2]} scale={0.82}>
          <RuinCluster index={index + 7} />
        </group>
      )}
    </group>
  )
}

export function DesertScenery({ distanceRef }: DesertSceneryProps) {
  const desertSetPieces = useMemo(() => createSideSceneryItems(desert.setPiece.count), [])
  const desertField = useMemo(() => createSideSceneryItems(desert.field.count), [])
  const setDesertSetPieceRef = useScrollingScenery({
    cycleDistance: desert.setPiece.cycleDistance,
    distanceRef,
    items: desertSetPieces,
    originDistance: ({ index }) => desert.setPiece.originStart + index * desert.setPiece.spacing,
    speed: desert.setPiece.speed,
    visibilityRange: visibility,
    update: ({ distance, item, node, z }) => {
      const { index, side } = item
      const x =
        side *
        (desert.setPiece.baseSideOffset +
          (index % desert.setPiece.sideBandCount) * desert.setPiece.sideBandOffset)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase =
        distance * desert.setPiece.phaseDistanceSpeed + index * desert.setPiece.phaseStride

      node.position.set(x, groundY + desert.setPiece.groundOffset, z)
      node.rotation.set(
        Math.sin(floatPhase * 0.7) * 0.006,
        side * 0.12 + Math.sin(floatPhase * 0.5) * 0.025,
        Math.cos(floatPhase * 0.8) * 0.008,
      )
    },
  })
  const setDesertFieldRef = useScrollingScenery({
    cycleDistance: desert.field.cycleDistance,
    distanceRef,
    items: desertField,
    originDistance: ({ index }) => desert.field.originStart + index * desert.field.spacing,
    speed: desert.field.speed,
    visibilityRange: visibility,
    update: ({ distance, item, node, z }) => {
      const { index, side } = item
      const sideBand = index % desert.field.sideBandCount
      const x =
        side *
        (trackConfig.roadHalfWidth +
          desert.field.baseSideOffset +
          sideBand * desert.field.sideBandOffset +
          (index % desert.field.indexOffsetCount) * desert.field.indexOffset)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase =
        distance * desert.field.phaseDistanceSpeed + index * desert.field.phaseStride

      node.position.set(x, groundY + desert.field.groundOffset, z)
      node.rotation.set(
        Math.sin(floatPhase * 0.5) * 0.004,
        side * (0.2 + sideBand * 0.08) + Math.sin(floatPhase * 0.7) * 0.018,
        Math.cos(floatPhase * 0.6) * 0.006,
      )
    },
  })

  return (
    <>
      {desertSetPieces.map(({ index }) => (
        <DesertSetPieceNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setDesertSetPieceRef(index, node)
          }}
        />
      ))}

      {desertField.map(({ index }) => (
        <DesertFieldNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setDesertFieldRef(index, node)
          }}
        />
      ))}
    </>
  )
}
