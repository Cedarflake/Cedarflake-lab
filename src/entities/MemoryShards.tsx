import { useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import { AdditiveBlending } from "three"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackPose, resolveTrackLaneOffset } from "@/game/trackPath"
import type { MemoryShard } from "@/shared/types"

interface MemoryShardsProps {
  distanceRef: RefObject<number>
  memoryShards: MemoryShard[]
}

interface MemoryShardNodeProps {
  glowRef: (node: Group | null) => void
  nodeRef: (node: Group | null) => void
}

function MemoryShardNode({ glowRef, nodeRef }: MemoryShardNodeProps) {
  return (
    <group ref={nodeRef}>
      <group ref={glowRef}>
        <mesh scale={[1.45, 1.45, 1.45]}>
          <octahedronGeometry args={[0.42, 0]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#aee9ff"
            depthWrite={false}
            transparent
            opacity={0.22}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.92, 0.028, 8, 44]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#b9f1ff"
            depthWrite={false}
            transparent
            opacity={0.38}
          />
        </mesh>
        <mesh rotation={[0.2, Math.PI / 2, 0]}>
          <torusGeometry args={[0.62, 0.018, 8, 36]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#d7fbff"
            depthWrite={false}
            transparent
            opacity={0.32}
          />
        </mesh>
      </group>
      <mesh castShadow receiveShadow rotation={[0.62, 0.28, 0.72]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color="#d7f7ff"
          emissive={dreamPalette.dreamBlue}
          emissiveIntensity={1.05}
          roughness={0.22}
        />
      </mesh>
      <mesh rotation={[0.62, 0.28, 0.72]} scale={[0.58, 0.58, 0.58]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.42} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.018, 8, 36]} />
        <meshBasicMaterial color="#8fdce9" transparent opacity={0.54} />
      </mesh>
    </group>
  )
}

export function MemoryShards({ distanceRef, memoryShards }: MemoryShardsProps) {
  const glowRefs = useRef<Array<Group | null>>([])
  const shardRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const distance = distanceRef.current

    memoryShards.forEach((memoryShard, index) => {
      const shard = shardRefs.current[index]
      if (!shard) return

      const pose = resolveRelativeTrackPose(memoryShard.distance, distance, 2)
      const laneOffset = resolveTrackLaneOffset(
        memoryShard.lane,
        pose.heading,
        trackConfig.laneWidth,
      )
      const phase = distance * 0.035 + index * 0.9
      const blink = Math.sin(phase * 3.4) * 0.5 + 0.5
      const shimmer = Math.sin(phase * 8.2 + index) * 0.5 + 0.5
      const pulse = blink * 0.08 + shimmer * 0.025
      const glow = glowRefs.current[index]

      shard.position.set(pose.x + laneOffset.x, 1.1 + Math.sin(phase) * 0.24, pose.z + laneOffset.z)
      shard.scale.setScalar(1 + pulse)
      shard.rotation.set(
        Math.sin(phase) * 0.08,
        pose.heading + phase * 0.22,
        Math.cos(phase) * 0.08,
      )
      if (glow) {
        glow.scale.setScalar(1.08 + blink * 0.18 + shimmer * 0.05)
      }
      shard.visible = pose.z <= 18 && pose.z >= -260
    })
  })

  return (
    <group>
      {memoryShards.map((memoryShard, index) => (
        <MemoryShardNode
          key={memoryShard.id}
          glowRef={(node) => {
            glowRefs.current[index] = node
          }}
          nodeRef={(node) => {
            shardRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
