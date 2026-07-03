import { useRef } from "react"
import type { RefObject } from "react"

import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { BoostGate } from "@/shared/types"

interface BoostGatesProps {
  boostGates: BoostGate[]
  distanceRef: RefObject<number>
}

interface BoostGateNodeProps {
  boostGate: BoostGate
  distanceRef: RefObject<number>
}

function BoostGateNode({ boostGate, distanceRef }: BoostGateNodeProps) {
  const gateRef = useRef<Group | null>(null)

  useFrame(() => {
    const gate = gateRef.current
    if (!gate) return

    const distance = distanceRef.current
    const z = -(boostGate.distance - distance) + 2
    const x =
      resolveRelativeTrackCenter(boostGate.distance, distance) +
      boostGate.lane * trackConfig.laneWidth

    gate.position.set(x, 0.08, z)
    gate.visible = z <= 18 && z >= -260
  })

  return (
    <group ref={gateRef}>
      <RoundedBox args={[boostGate.width, 0.08, 2.6]} radius={0.08} smoothness={8}>
        <meshStandardMaterial
          color={dreamPalette.boost}
          emissive={dreamPalette.boost}
          emissiveIntensity={0.46}
          transparent
          opacity={0.88}
        />
      </RoundedBox>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.16, 0.08, 2.9]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

export function BoostGates({ boostGates, distanceRef }: BoostGatesProps) {
  return (
    <group>
      {boostGates.map((boostGate) => (
        <BoostGateNode key={boostGate.id} boostGate={boostGate} distanceRef={distanceRef} />
      ))}
    </group>
  )
}
