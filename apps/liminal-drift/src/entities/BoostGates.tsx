import { useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"
import type { Group } from "three"

import { dreamPalette, renderWindowConfig, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackPose, resolveTrackLaneOffset } from "@/game/trackPath"
import type { BoostGate } from "@/shared/types"

interface BoostGatesProps {
  boostGates: BoostGate[]
  distanceRef: RefObject<number>
}

interface BoostGateNodeProps {
  arrowHeadGeometry: BufferGeometry
  boostGate: BoostGate
  nodeRef: (node: Group | null) => void
}

function createBoostArrowHeadGeometry() {
  const geometry = new BufferGeometry()

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, -1.16, -0.72, 0, -0.24, 0.72, 0, -0.24], 3),
  )
  geometry.setIndex([0, 1, 2])
  geometry.computeVertexNormals()

  return geometry
}

function BoostGateNode({ arrowHeadGeometry, boostGate, nodeRef }: BoostGateNodeProps) {
  return (
    <group ref={nodeRef}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[boostGate.width, 0.08, 2.6]} />
        <meshStandardMaterial
          color={dreamPalette.boost}
          emissive={dreamPalette.boost}
          emissiveIntensity={0.46}
          transparent
          opacity={0.88}
        />
      </mesh>
      <mesh position={[0, 0.13, 0.24]} renderOrder={2}>
        <boxGeometry args={[0.48, 0.026, 1.24]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.92} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.14, 0]} renderOrder={2}>
        <primitive object={arrowHeadGeometry} attach="geometry" />
        <meshBasicMaterial
          color="#fff7c6"
          side={DoubleSide}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function BoostGates({ boostGates, distanceRef }: BoostGatesProps) {
  const gateRefs = useRef<Array<Group | null>>([])
  const arrowHeadGeometry = useMemo(createBoostArrowHeadGeometry, [])

  useEffect(() => {
    return () => {
      arrowHeadGeometry.dispose()
    }
  }, [arrowHeadGeometry])

  useFrame(() => {
    const distance = distanceRef.current

    boostGates.forEach((boostGate, index) => {
      const gate = gateRefs.current[index]
      if (!gate) return

      const pose = resolveRelativeTrackPose(boostGate.distance, distance, 2)
      const laneOffset = resolveTrackLaneOffset(boostGate.lane, pose.heading, trackConfig.laneWidth)

      gate.position.set(pose.x + laneOffset.x, 0.08, pose.z + laneOffset.z)
      gate.rotation.set(0, pose.heading, 0)
      gate.visible =
        pose.z <= renderWindowConfig.boostGates.near && pose.z >= renderWindowConfig.boostGates.far
    })
  })

  return (
    <group>
      {boostGates.map((boostGate, index) => (
        <BoostGateNode
          key={boostGate.id}
          arrowHeadGeometry={arrowHeadGeometry}
          boostGate={boostGate}
          nodeRef={(node) => {
            gateRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
