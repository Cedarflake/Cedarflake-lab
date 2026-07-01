import { Float } from "@react-three/drei"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import type { MemoryShard } from "@/shared/types"

interface MemoryShardsProps {
  distance: number
  memoryShards: MemoryShard[]
}

export function MemoryShards({ distance, memoryShards }: MemoryShardsProps) {
  return (
    <group>
      {memoryShards.map((memoryShard) => {
        const z = -(memoryShard.distance - distance) + 2
        if (z > 18 || z < -260) return null

        const x = memoryShard.lane * trackConfig.laneWidth

        return (
          <Float key={memoryShard.id} speed={0.9} floatIntensity={0.32} rotationIntensity={0.42}>
            <group position={[x, 1.1, z]}>
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
              <pointLight color={dreamPalette.lemon} intensity={4.6} distance={4.4} />
            </group>
          </Float>
        )
      })}
    </group>
  )
}
