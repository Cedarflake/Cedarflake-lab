import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { Float, RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { Obstacle } from "@/shared/types"

interface DreamObjectsProps {
  distanceRef: RefObject<number>
  obstacles: Obstacle[]
}

interface SetPieceNodeProps {
  distanceRef: RefObject<number>
  index: number
  side: number
}

interface SignNodeProps {
  distanceRef: RefObject<number>
  index: number
  side: number
}

interface ObstacleNodeProps {
  distanceRef: RefObject<number>
  obstacle: Obstacle
}

function SetPieceNode({ distanceRef, index, side }: SetPieceNodeProps) {
  const setPieceRef = useRef<Group | null>(null)
  const scale = 0.8 + (index % 5) * 0.16

  useFrame(() => {
    const setPiece = setPieceRef.current
    if (!setPiece) return

    const distance = distanceRef.current
    const z = -wrapDistance(index * 36 - distance * 0.75, 1080) - 24
    const x = side * (11 + (index % 4) * 3.2)

    setPiece.position.set(x, 0.5, z)
  })

  return (
    <Float speed={0.4 + (index % 3) * 0.12} floatIntensity={0.35} rotationIntensity={0.08}>
      <group ref={setPieceRef} scale={scale}>
        <RoundedBox args={[4.2, 2.1, 0.32]} radius={0.16} smoothness={8}>
          <meshStandardMaterial
            color={index % 3 === 0 ? dreamPalette.mint : dreamPalette.peach}
            roughness={0.62}
          />
        </RoundedBox>
        <mesh position={[0, 1.55, -0.08]}>
          <sphereGeometry args={[0.45, 24, 24]} />
          <meshStandardMaterial
            color={dreamPalette.lemon}
            emissive={dreamPalette.lemon}
            emissiveIntensity={0.18}
          />
        </mesh>
      </group>
    </Float>
  )
}

function SignNode({ distanceRef, index, side }: SignNodeProps) {
  const signRef = useRef<Group | null>(null)

  useFrame(() => {
    const sign = signRef.current
    if (!sign) return

    const distance = distanceRef.current
    const z = -wrapDistance(index * 64 + 28 - distance * 0.9, 1120) - 42
    const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)

    sign.position.set(x, 2.25 + (index % 2) * 0.8, z)
  })

  return (
    <group ref={signRef} rotation={[0, side > 0 ? -0.28 : 0.28, 0]}>
      <RoundedBox args={[3.4, 1.05, 0.16]} radius={0.08} smoothness={6}>
        <meshStandardMaterial
          color={index % 2 === 0 ? "#fff4bc" : "#d4f4ee"}
          emissive={index % 2 === 0 ? "#f0c76a" : "#8fdad0"}
          emissiveIntensity={0.18}
        />
      </RoundedBox>
      <mesh position={[0, 0.06, 0.1]}>
        <boxGeometry args={[1.9, 0.08, 0.04]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.62} />
      </mesh>
      <mesh position={[0, -0.14, 0.1]}>
        <boxGeometry args={[1.15, 0.07, 0.04]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.42} />
      </mesh>
    </group>
  )
}

function ObstacleNode({ distanceRef, obstacle }: ObstacleNodeProps) {
  const obstacleRef = useRef<Group | null>(null)

  useFrame(() => {
    const obstacleGroup = obstacleRef.current
    if (!obstacleGroup) return

    const distance = distanceRef.current
    const z = -(obstacle.distance - distance) + 2
    const x =
      resolveRelativeTrackCenter(obstacle.distance, distance) +
      obstacle.lane * trackConfig.laneWidth

    const y = obstacle.kind === "pool" ? 0.01 : obstacle.kind === "arch" ? 1.2 : 0.82

    obstacleGroup.position.set(x, y, z)
    obstacleGroup.visible = z <= 16 && z >= -260
  })

  if (obstacle.kind === "pool") {
    return (
      <group ref={obstacleRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 1.05, 48]} />
          <meshStandardMaterial
            color={dreamPalette.pool}
            emissive={dreamPalette.pool}
            emissiveIntensity={0.16}
            transparent
            opacity={0.84}
          />
        </mesh>
      </group>
    )
  }

  if (obstacle.kind === "arch") {
    return (
      <group ref={obstacleRef}>
        <mesh position={[-1.25, 0, 0]}>
          <boxGeometry args={[0.34, 2.4, 0.34]} />
          <meshStandardMaterial color={dreamPalette.peach} />
        </mesh>
        <mesh position={[1.25, 0, 0]}>
          <boxGeometry args={[0.34, 2.4, 0.34]} />
          <meshStandardMaterial color={dreamPalette.peach} />
        </mesh>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[2.84, 0.34, 0.34]} />
          <meshStandardMaterial
            color={dreamPalette.peach}
            emissive={dreamPalette.peach}
            emissiveIntensity={0.12}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={obstacleRef}>
      <RoundedBox args={[obstacle.width, 1.45, obstacle.width]} radius={0.12} smoothness={8}>
        <meshStandardMaterial color={dreamPalette.mint} roughness={0.48} />
      </RoundedBox>
      <mesh position={[0, 0.86, 0]}>
        <coneGeometry args={[obstacle.width * 0.52, 0.7, 4]} />
        <meshStandardMaterial
          color={dreamPalette.lemon}
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.16}
          roughness={0.44}
        />
      </mesh>
      <mesh position={[0, -0.74, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[obstacle.width * 0.62, 28]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

export function DreamObjects({ distanceRef, obstacles }: DreamObjectsProps) {
  const setPieces = useMemo(
    () => Array.from({ length: 30 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const signs = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )

  return (
    <group>
      {setPieces.map(({ index, side }) => (
        <SetPieceNode key={index} distanceRef={distanceRef} index={index} side={side} />
      ))}

      {signs.map(({ index, side }) => (
        <SignNode key={index} distanceRef={distanceRef} index={index} side={side} />
      ))}

      {obstacles.map((obstacle) => (
        <ObstacleNode key={obstacle.id} distanceRef={distanceRef} obstacle={obstacle} />
      ))}
    </group>
  )
}
