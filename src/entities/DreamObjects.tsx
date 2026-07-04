import { Suspense, useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame, useLoader } from "@react-three/fiber"
import { DoubleSide, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from "three"
import type { Group } from "three"

import { wallObstacleWidth } from "@/game/collision"
import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"
import { resolveRelativeTrackPose, resolveTrackLaneOffset } from "@/game/trackPath"
import type { Obstacle } from "@/shared/types"

interface DreamObjectsProps {
  distanceRef: RefObject<number>
  obstacles: Obstacle[]
}

interface DesertSetPieceNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface DesertFieldNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface SignNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface DreamRelicNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface TombstoneNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface PictureFrameNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface ObstacleNodeProps {
  nodeRef: (node: Group | null) => void
  obstacle: Obstacle
}

const desertSetPieceCycleDistance = 420
const desertFieldCycleDistance = 520
const dreamRelicCycleDistance = 620
const signCycleDistance = 360
const tombstoneCycleDistance = 460
const pictureFrameCycleDistance = 680
const pictureFrameTextureAspect = 235 / 286
const pictureFrameVisualHeight = 2.92
const pictureFrameVisualWidth = pictureFrameVisualHeight * pictureFrameTextureAspect
const pictureFrameOuterWidth = pictureFrameVisualWidth + 0.44
const pictureFrameOuterHeight = pictureFrameVisualHeight + 0.44
const pictureFrameRailThickness = 0.16

function resolveSceneryZ(originDistance: number, distance: number, speed: number, cycle: number) {
  return 10 - wrapDistance(originDistance - distance * speed, cycle)
}

function DuneCross({
  color,
  rotation,
  scale,
}: {
  color: string
  rotation: [number, number, number]
  scale: number
}) {
  return (
    <group rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <boxGeometry args={[0.12, 0.96, 0.1]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[0.54, 0.1, 0.1]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  )
}

function DuneCluster({ index }: { index: number }) {
  const firstDuneScale = 1 + (index % 4) * 0.16
  const secondDuneScale = 0.72 + (index % 3) * 0.12
  const crossColor = index % 2 === 0 ? dreamPalette.ruinDark : dreamPalette.ruin

  return (
    <group>
      <mesh
        castShadow
        receiveShadow
        scale={[2.8 * firstDuneScale, 1.56, 1.22]}
        position={[-0.9, -0.34, 0.18]}
      >
        <sphereGeometry args={[1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={dreamPalette.sand}
          emissive={dreamPalette.duneShadow}
          emissiveIntensity={0.05}
          roughness={0.84}
        />
      </mesh>
      <mesh position={[-1.04, 0.08, 0.12]} rotation={[0, -0.16, -0.04]}>
        <boxGeometry args={[2.1 * firstDuneScale, 0.04, 0.08]} />
        <meshBasicMaterial color="#ead6ba" transparent opacity={0.34} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        scale={[1.82 * secondDuneScale, 1.08, 0.86]}
        position={[1.24, -0.28, -0.58]}
      >
        <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={dreamPalette.duneShadow}
          emissive={dreamPalette.sand}
          emissiveIntensity={0.04}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[1.22, 0, -0.58]} rotation={[0, 0.22, 0.03]}>
        <boxGeometry args={[1.18 * secondDuneScale, 0.035, 0.07]} />
        <meshBasicMaterial color="#d7bd9f" transparent opacity={0.3} />
      </mesh>
      <group position={[-2.38, 0.62, 0.42]}>
        <DuneCross
          color={crossColor}
          rotation={[0.04, -0.34 + (index % 3) * 0.08, -0.18 + (index % 4) * 0.05]}
          scale={0.68 + (index % 3) * 0.1}
        />
      </group>
      {index % 3 !== 1 && (
        <group position={[2.12, 0.42, -0.72]}>
          <DuneCross
            color={dreamPalette.ruinDark}
            rotation={[-0.03, 0.34 - (index % 4) * 0.07, 0.12 - (index % 3) * 0.07]}
            scale={0.48 + (index % 4) * 0.06}
          />
        </group>
      )}
      {index % 5 === 0 && (
        <group position={[0.1, 0.72, 1.02]}>
          <DuneCross color={dreamPalette.ruin} rotation={[0.02, 0.54, -0.24]} scale={0.42} />
        </group>
      )}
    </group>
  )
}

function RuinCluster({ index }: { index: number }) {
  const hasLintel = index % 3 !== 1

  return (
    <group position={[0, 0.15, 0]} rotation={[0, (index % 2 === 0 ? -1 : 1) * 0.08, 0]}>
      <mesh castShadow receiveShadow position={[-0.86, 0.56, 0]}>
        <boxGeometry args={[0.34, 1.3, 0.42]} />
        <meshStandardMaterial color={dreamPalette.ruin} roughness={0.78} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.72, 0.42, 0.04]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.38, 1.04, 0.42]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.82} />
      </mesh>
      {hasLintel && (
        <mesh castShadow receiveShadow position={[-0.08, 1.24, 0.02]} rotation={[0, 0, -0.06]}>
          <boxGeometry args={[1.92, 0.28, 0.46]} />
          <meshStandardMaterial color={dreamPalette.ruin} roughness={0.76} />
        </mesh>
      )}
      <mesh castShadow receiveShadow position={[1.36, 0.04, -0.28]} rotation={[0, 0.26, 0]}>
        <boxGeometry args={[0.92, 0.18, 0.5]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.86} />
      </mesh>
      <mesh castShadow receiveShadow position={[-1.32, -0.04, 0.34]} rotation={[0, -0.18, 0]}>
        <boxGeometry args={[0.82, 0.16, 0.42]} />
        <meshStandardMaterial color={dreamPalette.ruin} roughness={0.82} />
      </mesh>
    </group>
  )
}

function DesertSetPieceNode({ index, nodeRef }: DesertSetPieceNodeProps) {
  const scale = 0.86 + (index % 5) * 0.14

  return (
    <group ref={nodeRef} scale={scale}>
      <DuneCluster index={index} />
      {index % 2 === 0 && <RuinCluster index={index} />}
    </group>
  )
}

function DesertFieldNode({ index, nodeRef }: DesertFieldNodeProps) {
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

function FloatingDoorNode({ index }: { index: number }) {
  const isBlue = index % 2 === 0

  return (
    <group>
      <mesh castShadow receiveShadow position={[-0.62, 0, 0]}>
        <boxGeometry args={[0.18, 2.6, 0.18]} />
        <meshStandardMaterial
          color={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissive={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissiveIntensity={0.12}
          roughness={0.58}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, 0, 0]}>
        <boxGeometry args={[0.18, 2.6, 0.18]} />
        <meshStandardMaterial
          color={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissive={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissiveIntensity={0.12}
          roughness={0.58}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.22, 0]}>
        <boxGeometry args={[1.42, 0.18, 0.18]} />
        <meshStandardMaterial
          color={dreamPalette.dreamViolet}
          emissive={dreamPalette.dreamViolet}
          emissiveIntensity={0.16}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.16, -0.035]}>
        <boxGeometry args={[0.86, 1.86, 0.035]} />
        <meshBasicMaterial color="#fff7dc" transparent opacity={0.16} />
      </mesh>
    </group>
  )
}

function MemoryWindowNode({ index }: { index: number }) {
  const tint = index % 2 === 0 ? dreamPalette.lemon : dreamPalette.mint

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.35, 1.34, 0.12]} />
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={0.1}
          roughness={0.68}
        />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[1.74, 0.78, 0.04]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.24} />
      </mesh>
      <mesh position={[-0.42, 0.08, 0.11]}>
        <boxGeometry args={[0.62, 0.08, 0.035]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.44} />
      </mesh>
      <mesh position={[0.36, -0.16, 0.11]}>
        <boxGeometry args={[0.84, 0.07, 0.035]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.34} />
      </mesh>
    </group>
  )
}

function BrokenStairNode() {
  return (
    <group rotation={[0, 0, -0.16]}>
      {[0, 1, 2, 3].map((step) => (
        <mesh
          key={step}
          castShadow
          receiveShadow
          position={[step * 0.48, step * 0.24, -step * 0.18]}
        >
          <boxGeometry args={[0.78, 0.12, 0.54]} />
          <meshStandardMaterial
            color={dreamPalette.ruin}
            emissive={dreamPalette.dreamPink}
            emissiveIntensity={0.04 + step * 0.018}
            roughness={0.78}
          />
        </mesh>
      ))}
    </group>
  )
}

function DreamRelicNode({ index, nodeRef }: DreamRelicNodeProps) {
  const variant = index % 3

  return (
    <group ref={nodeRef} scale={0.82 + (index % 4) * 0.08}>
      {variant === 0 && <FloatingDoorNode index={index} />}
      {variant === 1 && <MemoryWindowNode index={index} />}
      {variant === 2 && <BrokenStairNode />}
    </group>
  )
}

function TombstoneNode({ index, nodeRef }: TombstoneNodeProps) {
  const isTall = index % 3 === 0
  const tint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <group ref={nodeRef} scale={0.78 + (index % 5) * 0.08}>
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[0.84, isTall ? 1.18 : 0.94, 0.18]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, isTall ? 1.12 : 0.98, 0]}>
        <sphereGeometry args={[0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={tint} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.72, 0.1]}>
        <boxGeometry args={[0.44, 0.06, 0.035]} />
        <meshBasicMaterial color="#3f3942" transparent opacity={0.52} />
      </mesh>
      <mesh position={[0, 0.56, 0.1]}>
        <boxGeometry args={[0.28, 0.05, 0.035]} />
        <meshBasicMaterial color="#3f3942" transparent opacity={0.38} />
      </mesh>
      {index % 4 === 0 && (
        <group position={[0.36, 0.98, 0.12]} rotation={[0, 0, 0.12]}>
          <DuneCross color={dreamPalette.ruinDark} rotation={[0, 0, 0]} scale={0.32} />
        </group>
      )}
    </group>
  )
}

function PictureFrameImage() {
  const texture = useLoader(TextureLoader, "/image/image.png")
  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true

    return new MeshBasicMaterial({
      depthWrite: true,
      map: texture,
      opacity: 1,
      side: DoubleSide,
      toneMapped: false,
    })
  }, [texture])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  return (
    <mesh position={[0, 0, 0.08]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  )
}

function PictureFramePlaceholder() {
  return (
    <mesh position={[0, 0, 0.06]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#e6dccb" depthWrite={false} transparent opacity={0.82} />
    </mesh>
  )
}

function PictureFrameChrome({ index }: { index: number }) {
  const frameTint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <>
      <mesh position={[0, pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry args={[pictureFrameOuterWidth, pictureFrameRailThickness, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.78} />
      </mesh>
      <mesh position={[0, -pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry args={[pictureFrameOuterWidth, pictureFrameRailThickness, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.8} />
      </mesh>
      <mesh position={[-pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry args={[pictureFrameRailThickness, pictureFrameOuterHeight, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh position={[pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry args={[pictureFrameRailThickness, pictureFrameOuterHeight, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh
        position={[0, 0, -0.045]}
        scale={[pictureFrameVisualWidth + 0.12, pictureFrameVisualHeight + 0.12, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#efe6d5" depthWrite={false} transparent opacity={0.56} />
      </mesh>
      <mesh position={[-0.46, 0.42, 0.1]}>
        <boxGeometry args={[0.5, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.44} />
      </mesh>
      <mesh position={[0.34, -0.52, 0.1]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.68, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.mint} transparent opacity={0.38} />
      </mesh>
    </>
  )
}

function PictureFrameNode({ index, nodeRef }: PictureFrameNodeProps) {
  return (
    <group ref={nodeRef} scale={0.82 + (index % 3) * 0.13}>
      <PictureFrameChrome index={index} />
      <Suspense fallback={<PictureFramePlaceholder />}>
        <PictureFrameImage />
      </Suspense>
    </group>
  )
}

function ObstacleNode({ nodeRef, obstacle }: ObstacleNodeProps) {
  if (obstacle.kind === "hole") {
    return (
      <group ref={nodeRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 1.05, 32]} />
          <meshStandardMaterial
            color={dreamPalette.hole}
            emissive={dreamPalette.holeDepth}
            emissiveIntensity={0.18}
            transparent
            opacity={0.88}
          />
        </mesh>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.72, 28]} />
          <meshBasicMaterial color={dreamPalette.holeDepth} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[obstacle.width * 1.08, 0.035, 8, 40]} />
          <meshBasicMaterial color="#e2ded9" transparent opacity={0.68} />
        </mesh>
      </group>
    )
  }

  if (obstacle.kind === "wall") {
    return (
      <group ref={nodeRef}>
        <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.96, 40]} />
          <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
        </mesh>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[wallObstacleWidth, 1.45, 0.48]} />
          <meshStandardMaterial
            color={dreamPalette.peach}
            emissive={dreamPalette.peach}
            emissiveIntensity={0.08}
            roughness={0.56}
          />
        </mesh>
        <mesh position={[0, 0.18, 0.26]}>
          <boxGeometry args={[1.82, 0.14, 0.05]} />
          <meshBasicMaterial color="#fff7c6" transparent opacity={0.72} />
        </mesh>
        <mesh position={[0, -0.16, 0.27]}>
          <boxGeometry args={[1.16, 0.1, 0.05]} />
          <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.46} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={nodeRef}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[obstacle.width, 1.45, obstacle.width]} />
        <meshStandardMaterial color={dreamPalette.mint} roughness={0.48} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.86, 0]}>
        <coneGeometry args={[obstacle.width * 0.52, 0.7, 4]} />
        <meshStandardMaterial
          color={dreamPalette.lemon}
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.16}
          roughness={0.44}
        />
      </mesh>
      <mesh position={[0, -0.74, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[obstacle.width * 0.72, 24]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
      </mesh>
    </group>
  )
}

export function DreamObjects({ distanceRef, obstacles }: DreamObjectsProps) {
  const obstacleRefs = useRef<Array<Group | null>>([])
  const desertSetPieceRefs = useRef<Array<Group | null>>([])
  const desertFieldRefs = useRef<Array<Group | null>>([])
  const dreamRelicRefs = useRef<Array<Group | null>>([])
  const signRefs = useRef<Array<Group | null>>([])
  const tombstoneRefs = useRef<Array<Group | null>>([])
  const pictureFrameRefs = useRef<Array<Group | null>>([])
  const desertSetPieces = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const desertField = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        index,
        side: index % 2 === 0 ? -1 : 1,
      })),
    [],
  )
  const dreamRelics = useMemo(
    () => Array.from({ length: 28 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const signs = useMemo(
    () => Array.from({ length: 10 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const tombstones = useMemo(
    () => Array.from({ length: 22 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const pictureFrames = useMemo(
    () => Array.from({ length: 7 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )

  useFrame(({ camera }) => {
    const distance = distanceRef.current

    desertSetPieces.forEach(({ index, side }) => {
      const setPiece = desertSetPieceRefs.current[index]
      if (!setPiece) return

      const z = resolveSceneryZ(24 + index * 34, distance, 1.18, desertSetPieceCycleDistance)
      const x = side * (10.4 + (index % 4) * 3.1)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase = distance * 0.025 + index * 0.7

      setPiece.position.set(x, groundY + 0.16, z)
      setPiece.rotation.set(
        Math.sin(floatPhase * 0.7) * 0.006,
        side * 0.12 + Math.sin(floatPhase * 0.5) * 0.025,
        Math.cos(floatPhase * 0.8) * 0.008,
      )
    })

    desertField.forEach(({ index, side }) => {
      const fieldPiece = desertFieldRefs.current[index]
      if (!fieldPiece) return

      const sideBand = index % 3
      const z = resolveSceneryZ(14 + index * 18, distance, 0.82, desertFieldCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 9.5 + sideBand * 6.2 + (index % 5) * 0.9)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase = distance * 0.016 + index * 0.43

      fieldPiece.position.set(x, groundY + 0.12, z)
      fieldPiece.rotation.set(
        Math.sin(floatPhase * 0.5) * 0.004,
        side * (0.2 + sideBand * 0.08) + Math.sin(floatPhase * 0.7) * 0.018,
        Math.cos(floatPhase * 0.6) * 0.006,
      )
    })

    dreamRelics.forEach(({ index, side }) => {
      const relic = dreamRelicRefs.current[index]
      if (!relic) return

      const sideBand = index % 5
      const z = resolveSceneryZ(48 + index * 24, distance, 0.64, dreamRelicCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 13.5 + sideBand * 4.6)
      const groundY = resolveDesertGroundHeight(x, z)
      const dreamPhase = distance * 0.012 + index * 0.78

      relic.position.set(x, groundY + 2.8 + (index % 4) * 0.5 + Math.sin(dreamPhase) * 0.24, z)
      relic.rotation.set(
        Math.sin(dreamPhase * 0.68) * 0.08,
        side * (0.42 + sideBand * 0.08) + Math.sin(dreamPhase * 0.42) * 0.12,
        Math.cos(dreamPhase * 0.74) * 0.06,
      )
    })

    tombstones.forEach(({ index, side }) => {
      const tombstone = tombstoneRefs.current[index]
      if (!tombstone) return

      const sideBand = index % 4
      const z = resolveSceneryZ(32 + index * 25, distance, 0.94, tombstoneCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 7.2 + sideBand * 3.4 + (index % 3) * 0.72)
      const groundY = resolveDesertGroundHeight(x, z)
      const lean = Math.sin(index * 1.7) * 0.16

      tombstone.position.set(x, groundY + 0.18, z)
      tombstone.rotation.set(0, side * (0.18 + sideBand * 0.08), lean)
    })

    pictureFrames.forEach(({ index, side }) => {
      const pictureFrame = pictureFrameRefs.current[index]
      if (!pictureFrame) return

      const z = resolveSceneryZ(126 + index * 91, distance, 0.48, pictureFrameCycleDistance)
      const phase = distance * 0.018 + index * 1.37
      const sideBand = index % 3
      const x =
        side * (trackConfig.roadHalfWidth + 4.6 + sideBand * 1.8 + Math.sin(phase * 0.7) * 0.72)
      const groundY = resolveDesertGroundHeight(x, z)
      const flicker = Math.sin(distance * 0.045 + index * 2.2) > 0.72

      pictureFrame.position.set(x, groundY + 2.35 + Math.sin(phase) * 0.38, z)
      pictureFrame.lookAt(camera.position.x, pictureFrame.position.y, camera.position.z)
      pictureFrame.visible = flicker && z < 10 && z > -150
    })

    signs.forEach(({ index, side }) => {
      const sign = signRefs.current[index]
      if (!sign) return

      const z = resolveSceneryZ(18 + index * 44, distance, 1.34, signCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)
      const groundY = resolveDesertGroundHeight(x, z)

      sign.position.set(x, groundY + 1.55 + (index % 2) * 0.48, z)
      sign.rotation.set(0, side > 0 ? -0.34 : 0.34, side * 0.035)
    })

    obstacles.forEach((obstacle, index) => {
      const obstacleGroup = obstacleRefs.current[index]
      if (!obstacleGroup) return

      const pose = resolveRelativeTrackPose(obstacle.distance, distance, 2)
      const laneOffset = resolveTrackLaneOffset(obstacle.lane, pose.heading, trackConfig.laneWidth)
      const y = obstacle.kind === "hole" ? 0.01 : obstacle.kind === "wall" ? 0.78 : 0.82

      obstacleGroup.position.set(pose.x + laneOffset.x, y, pose.z + laneOffset.z)
      obstacleGroup.rotation.set(0, pose.heading, 0)
      obstacleGroup.visible = pose.z <= 16 && pose.z >= -260
    })
  })

  return (
    <group>
      {desertSetPieces.map(({ index }) => (
        <DesertSetPieceNode
          key={index}
          index={index}
          nodeRef={(node) => {
            desertSetPieceRefs.current[index] = node
          }}
        />
      ))}

      {desertField.map(({ index }) => (
        <DesertFieldNode
          key={index}
          index={index}
          nodeRef={(node) => {
            desertFieldRefs.current[index] = node
          }}
        />
      ))}

      {dreamRelics.map(({ index }) => (
        <DreamRelicNode
          key={index}
          index={index}
          nodeRef={(node) => {
            dreamRelicRefs.current[index] = node
          }}
        />
      ))}

      {tombstones.map(({ index }) => (
        <TombstoneNode
          key={index}
          index={index}
          nodeRef={(node) => {
            tombstoneRefs.current[index] = node
          }}
        />
      ))}

      {pictureFrames.map(({ index }) => (
        <PictureFrameNode
          key={index}
          index={index}
          nodeRef={(node) => {
            pictureFrameRefs.current[index] = node
          }}
        />
      ))}

      {signs.map(({ index }) => (
        <SignNode
          key={index}
          index={index}
          nodeRef={(node) => {
            signRefs.current[index] = node
          }}
        />
      ))}

      {obstacles.map((obstacle, index) => (
        <ObstacleNode
          key={obstacle.id}
          nodeRef={(node) => {
            obstacleRefs.current[index] = node
          }}
          obstacle={obstacle}
        />
      ))}
    </group>
  )
}
