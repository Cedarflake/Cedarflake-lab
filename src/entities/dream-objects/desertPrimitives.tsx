import { dreamPalette } from "@/game/gameConfig"

interface DuneCrossProps {
  color: string
  rotation: [number, number, number]
  scale: number
}

export function DuneCross({ color, rotation, scale }: DuneCrossProps) {
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

export function DuneCluster({ index }: { index: number }) {
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
        <meshBasicMaterial color="#8f7564" transparent opacity={0.28} />
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
        <meshBasicMaterial color="#725f52" transparent opacity={0.3} />
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

export function RuinCluster({ index }: { index: number }) {
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
