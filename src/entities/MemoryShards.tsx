import { useRef } from "react"
import type { RefObject } from "react"

import { Float } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { MemoryShard } from "@/shared/types"

interface MemoryShardsProps {
  distanceRef: RefObject<number>
  memoryShards: MemoryShard[]
}

interface MemoryShardNodeProps {
  distanceRef: RefObject<number>
  memoryShard: MemoryShard
}

function MemoryShardNode({ distanceRef, memoryShard }: MemoryShardNodeProps) {
  const shardRef = useRef<Group | null>(null)

  useFrame(() => {
    const shard = shardRef.current
    if (!shard) return

    const distance = distanceRef.current
    const z = -(memoryShard.distance - distance) + 2
    const x =
      resolveRelativeTrackCenter(memoryShard.distance, distance) +
      memoryShard.lane * trackConfig.laneWidth

    shard.position.set(x, 1.1, z)
    shard.visible = z <= 18 && z >= -260
  })

  return (
    <Float speed={0.9} floatIntensity={0.32} rotationIntensity={0.42}>
      <group ref={shardRef}>
        <mesh rotation={[0.62, 0.28, 0.72]}>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial
            color="#fff0b8"
            emissive={dreamPalette.lemon}
            emissiveIntensity={0.42}
            roughness={0.36}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.72, 0.018, 8, 56]} />
          <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.46} />
        </mesh>
      </group>
    </Float>
  )
}

export function MemoryShards({ distanceRef, memoryShards }: MemoryShardsProps) {
  return (
    <group>
      {memoryShards.map((memoryShard) => (
        <MemoryShardNode key={memoryShard.id} distanceRef={distanceRef} memoryShard={memoryShard} />
      ))}
    </group>
  )
}
