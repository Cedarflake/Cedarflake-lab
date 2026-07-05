import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { lerp } from "@/game/number"

interface WheelRef {
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
}

interface SkidMaterialRef {
  opacity: number
}

interface PlayerCarProps {
  carRef: RefObject<Group | null>
  distanceRef: RefObject<number>
  skidIntensityRef: RefObject<number>
  steeringRef: RefObject<number>
}

interface WheelPlacement {
  position: [number, number, number]
  canSteer: boolean
}

const rearWheelZ = 1.16
const frontWheelZ = -1.12
const skidRayY = -0.38
const skidRayNearZ = rearWheelZ + 0.46
const skidRayFarZ = skidRayNearZ + 1.26
const skidRayNearHalfWidth = 0.095
const skidRayFarHalfWidth = 0.018
const cabinGlassColor = "#2f2630"
const bodyMarkColor = "#65151d"
const tailLightColor = "#b82831"
const tailLightGlowColor = "#d53138"
const wheelColor = "#3f3440"

function createSkidRayGeometry() {
  const geometry = new BufferGeometry()

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -skidRayNearHalfWidth,
        0,
        skidRayNearZ,
        skidRayNearHalfWidth,
        0,
        skidRayNearZ,
        -skidRayFarHalfWidth,
        0,
        skidRayFarZ,
        skidRayFarHalfWidth,
        0,
        skidRayFarZ,
      ],
      3,
    ),
  )
  geometry.setIndex([0, 2, 1, 1, 2, 3])
  geometry.computeVertexNormals()

  return geometry
}

export function PlayerCar({ carRef, distanceRef, skidIntensityRef, steeringRef }: PlayerCarProps) {
  const wheelRefs = useRef<Array<WheelRef | null>>([])
  const wheelSteeringRefs = useRef<Array<WheelRef | null>>([])
  const skidMaterialRefs = useRef<Array<SkidMaterialRef | null>>([])
  const skidRayGeometry = useMemo(createSkidRayGeometry, [])
  const wheelPlacements = useMemo(
    (): WheelPlacement[] => [
      { position: [-0.86, -0.28, rearWheelZ], canSteer: false },
      { position: [0.86, -0.28, rearWheelZ], canSteer: false },
      { position: [-0.86, -0.28, frontWheelZ], canSteer: true },
      { position: [0.86, -0.28, frontWheelZ], canSteer: true },
    ],
    [],
  )

  useFrame(() => {
    const wheelRotation = -distanceRef.current * 0.24
    const steeringAngle = -steeringRef.current * 0.26
    const skidOpacity = skidIntensityRef.current * 0.46

    wheelRefs.current.forEach((wheel) => {
      if (!wheel) return

      wheel.rotation.set(wheelRotation, 0, Math.PI / 2)
    })

    wheelSteeringRefs.current.forEach((wheelSteering) => {
      if (!wheelSteering) return

      wheelSteering.rotation.set(0, steeringAngle, 0)
    })

    skidMaterialRefs.current.forEach((material) => {
      if (!material) return

      material.opacity = lerp(material.opacity, skidOpacity, 0.18)
    })
  })

  return (
    <group ref={carRef}>
      <RoundedBox
        castShadow
        receiveShadow
        args={[1.9, 0.54, 3.05]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.18, 0]}
      >
        <meshStandardMaterial color={dreamPalette.car} roughness={0.42} metalness={0.08} />
      </RoundedBox>

      <mesh position={[0, 0.49, 0.76]} rotation={[0.02, 0, 0.04]}>
        <boxGeometry args={[1.14, 0.026, 0.22]} />
        <meshBasicMaterial color={bodyMarkColor} transparent opacity={0.44} />
      </mesh>
      <mesh position={[-0.42, 0.48, -0.98]} rotation={[0.01, 0, -0.12]}>
        <boxGeometry args={[0.72, 0.022, 0.16]} />
        <meshBasicMaterial color={bodyMarkColor} transparent opacity={0.32} />
      </mesh>

      <RoundedBox
        castShadow
        receiveShadow
        args={[1.22, 0.52, 1.25]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.62, -0.24]}
      >
        <meshPhysicalMaterial
          color={cabinGlassColor}
          roughness={0.24}
          transmission={0.04}
          thickness={0.35}
          transparent
          opacity={0.62}
        />
      </RoundedBox>

      <mesh position={[-0.48, 0.22, 1.66]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color={tailLightColor} />
      </mesh>
      <mesh position={[0.48, 0.22, 1.66]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color={tailLightColor} />
      </mesh>
      <mesh position={[-0.48, 0.22, 1.72]}>
        <boxGeometry args={[0.52, 0.16, 0.03]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={tailLightGlowColor}
          depthWrite={false}
          transparent
          opacity={0.28}
        />
      </mesh>
      <mesh position={[0.48, 0.22, 1.72]}>
        <boxGeometry args={[0.52, 0.16, 0.03]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={tailLightGlowColor}
          depthWrite={false}
          transparent
          opacity={0.28}
        />
      </mesh>

      {wheelPlacements.map(({ position: [x, y, z], canSteer }, index) => (
        <group key={index} position={[x, y, z]}>
          <group
            ref={(wheelSteering) => {
              wheelSteeringRefs.current[index] = canSteer ? wheelSteering : null
            }}
          >
            <group
              ref={(wheel) => {
                wheelRefs.current[index] = wheel
              }}
            >
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.31, 0.31, 0.25, 18]} />
                <meshStandardMaterial color={wheelColor} roughness={0.68} />
              </mesh>
              <mesh position={[0, x > 0 ? -0.14 : 0.14, 0]}>
                <boxGeometry args={[0.18, 0.025, 0.18]} />
                <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.72} />
              </mesh>
            </group>
          </group>
        </group>
      ))}

      {[-0.86, 0.86].map((x, index) => (
        <mesh key={x} position={[x, skidRayY, 0]} renderOrder={6}>
          <primitive attach="geometry" object={skidRayGeometry} />
          <meshBasicMaterial
            ref={(material) => {
              skidMaterialRefs.current[index] = material
            }}
            color={dreamPalette.carGlow}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </group>
  )
}
