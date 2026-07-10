import { useCallback, useRef } from "react"
import type { MutableRefObject, RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { wallObstacleWidth } from "@/game/collision"
import { dreamPalette, renderWindowConfig, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackPose, resolveTrackLaneOffset } from "@/game/trackPath"
import type { Obstacle } from "@/shared/types"

interface ObstacleObjectsProps {
  distanceRef: RefObject<number>
  obstacles: Obstacle[]
}

interface ObstacleNodeProps {
  obstacle: Obstacle
  obstacleRefs: MutableRefObject<Map<string, Group>>
}

function ObstacleNode({ obstacle, obstacleRefs }: ObstacleNodeProps) {
  const nodeRef = useCallback(
    (node: Group | null) => {
      if (node) {
        obstacleRefs.current.set(obstacle.id, node)
        return
      }

      obstacleRefs.current.delete(obstacle.id)
    },
    [obstacle.id, obstacleRefs],
  )

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

export function ObstacleObjects({ distanceRef, obstacles }: ObstacleObjectsProps) {
  const obstacleRefs = useRef<Map<string, Group>>(new Map())

  useFrame(() => {
    const distance = distanceRef.current

    obstacles.forEach((obstacle) => {
      const obstacleGroup = obstacleRefs.current.get(obstacle.id)
      if (!obstacleGroup) return

      const pose = resolveRelativeTrackPose(obstacle.distance, distance, 2)
      const laneOffset = resolveTrackLaneOffset(obstacle.lane, pose.heading, trackConfig.laneWidth)
      const y = obstacle.kind === "hole" ? 0.01 : obstacle.kind === "wall" ? 0.78 : 0.82

      obstacleGroup.position.set(pose.x + laneOffset.x, y, pose.z + laneOffset.z)
      obstacleGroup.rotation.set(0, pose.heading, 0)
      obstacleGroup.visible =
        pose.z <= renderWindowConfig.obstacles.near && pose.z >= renderWindowConfig.obstacles.far
    })
  })

  return (
    <>
      {obstacles.map((obstacle) => (
        <ObstacleNode key={obstacle.id} obstacle={obstacle} obstacleRefs={obstacleRefs} />
      ))}
    </>
  )
}
