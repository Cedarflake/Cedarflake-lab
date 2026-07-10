import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"

import { dreamPalette, renderWindowConfig, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"

interface DreadAtmosphereProps {
  distanceRef: RefObject<number>
  speedRef: RefObject<number>
}

interface DreadNode {
  index: number
  side: -1 | 1
}

interface DreadGroupRef {
  position: {
    set: (x: number, y: number, z: number) => void
  }
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
  scale: {
    setScalar: (scale: number) => void
  }
  visible: boolean
}

interface DreadLightRef {
  intensity: number
}

const peripheralCycleDistance = 560
const skyTearCycleDistance = 720
const rememberedBodyColor = "#322a34"
const rememberedHeadColor = "#4a3946"
const rememberedLimbColor = "#6f2d3f"
const skyTearBrightColor = "#d6a2ad"
const skyTearDarkColor = "#352a36"

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)

  return t * t * (3 - 2 * t)
}

function resolveAtmosphereZ(
  originDistance: number,
  distance: number,
  speed: number,
  cycle: number,
) {
  return 12 - wrapDistance(originDistance - distance * speed, cycle)
}

function RememberedShapeNode({
  index,
  nodeRef,
}: {
  index: number
  nodeRef: (node: DreadGroupRef | null) => void
}) {
  const isTall = index % 3 !== 1

  return (
    <group ref={nodeRef}>
      <mesh position={[0, isTall ? 1.1 : 0.78, 0]} scale={[1, isTall ? 1 : 0.72, 1]}>
        <boxGeometry args={[0.32, 2.7, 0.08]} />
        <meshBasicMaterial
          color={rememberedBodyColor}
          depthWrite={false}
          transparent
          opacity={0.48}
        />
      </mesh>
      <mesh position={[0, isTall ? 2.38 : 1.7, 0]}>
        <boxGeometry args={[0.7, 0.42, 0.07]} />
        <meshBasicMaterial
          color={rememberedHeadColor}
          depthWrite={false}
          transparent
          opacity={0.36}
        />
      </mesh>
      <mesh
        position={[index % 2 === 0 ? -0.24 : 0.24, 0.46, 0.02]}
        rotation={[0, 0, index % 2 === 0 ? 0.36 : -0.36]}
      >
        <boxGeometry args={[0.18, 1.24, 0.06]} />
        <meshBasicMaterial
          color={rememberedLimbColor}
          depthWrite={false}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  )
}

function SkyTearNode({
  index,
  nodeRef,
}: {
  index: number
  nodeRef: (node: DreadGroupRef | null) => void
}) {
  const width = 2.5 + (index % 4) * 0.54
  const height = 13 + (index % 3) * 2.8

  return (
    <group ref={nodeRef}>
      <mesh rotation={[0, 0, index % 2 === 0 ? 0.04 : -0.03]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={index % 2 === 0 ? dreamPalette.dreamViolet : dreamPalette.dreamBlue}
          depthTest={false}
          depthWrite={false}
          fog={false}
          transparent
          opacity={0.3}
        />
      </mesh>
      <mesh position={[0, -height * 0.12, 0.01]} rotation={[0, 0, -0.08]}>
        <planeGeometry args={[width * 1.6, 0.12]} />
        <meshBasicMaterial
          color={skyTearBrightColor}
          depthTest={false}
          depthWrite={false}
          fog={false}
          transparent
          opacity={0.42}
        />
      </mesh>
      <mesh position={[0, height * 0.14, 0.02]} rotation={[0, 0, 0.06]}>
        <planeGeometry args={[width * 0.72, height * 0.06]} />
        <meshBasicMaterial
          color={skyTearDarkColor}
          depthTest={false}
          depthWrite={false}
          fog={false}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  )
}

export function DreadAtmosphere({ distanceRef, speedRef }: DreadAtmosphereProps) {
  const peripheralRefs = useRef<Array<DreadGroupRef | null>>([])
  const skyTearRefs = useRef<Array<DreadGroupRef | null>>([])
  const lightRef = useRef<DreadLightRef | null>(null)
  const peripheralNodes = useMemo<DreadNode[]>(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        index,
        side: index % 2 === 0 ? -1 : 1,
      })),
    [],
  )
  const skyTearNodes = useMemo<DreadNode[]>(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        index,
        side: index % 2 === 0 ? -1 : 1,
      })),
    [],
  )

  useFrame((_, delta) => {
    const distance = distanceRef.current
    const speed = speedRef.current
    const speedTension = Math.min(speed / 70, 1)

    peripheralNodes.forEach(({ index, side }) => {
      const node = peripheralRefs.current[index]
      if (!node) return

      const z = resolveAtmosphereZ(36 + index * 41, distance, 0.92, peripheralCycleDistance)
      const phase = distance * 0.018 + index * 1.31
      const shoulder = trackConfig.roadHalfWidth + 3.4 + (index % 4) * 2.15
      const blink = Math.sin(distance * 0.09 + index * 2.7) > 0.86
      const heightPulse = 1 + Math.sin(phase * 0.6) * 0.1 + (blink ? 0.58 : 0)

      node.position.set(
        side * (shoulder + Math.sin(phase * 0.7) * 0.56),
        0.7 + Math.sin(phase) * 0.12,
        z,
      )
      node.scale.setScalar((0.86 + (index % 5) * 0.1) * heightPulse)
      node.rotation.set(0, side > 0 ? -0.2 : 0.2, Math.sin(phase * 0.4) * 0.045)
      node.visible =
        z < renderWindowConfig.dreadPeripheral.near && z > renderWindowConfig.dreadPeripheral.far
    })

    skyTearNodes.forEach(({ index, side }) => {
      const node = skyTearRefs.current[index]
      if (!node) return

      const z = resolveAtmosphereZ(96 + index * 78, distance, 0.38, skyTearCycleDistance)
      const phase = distance * 0.011 + index * 0.93
      const blink = Math.sin(distance * 0.041 + index * 3.2) > 0.96

      node.position.set(
        side * (11.5 + (index % 3) * 6.2 + Math.sin(phase) * 1.6),
        8.8 + (index % 3) * 2 + Math.cos(phase * 0.8) * 0.6,
        z,
      )
      node.scale.setScalar(1.28 + speedTension * 0.16 + (blink ? 0.4 : 0))
      node.rotation.set(0, 0, side * 0.055 + Math.sin(phase * 0.55) * 0.055)
      node.visible =
        z < renderWindowConfig.dreadSkyTear.near && z > renderWindowConfig.dreadSkyTear.far
    })

    const light = lightRef.current
    if (light) {
      const pulse = smoothstep(0.62, 0.94, Math.sin(distance * 0.025))
      const targetIntensity = 0.55 + speedTension * 0.74 + pulse * 2.2

      light.intensity += (targetIntensity - light.intensity) * Math.min(delta * 2.2, 1)
    }
  })

  return (
    <group>
      <pointLight
        ref={(node) => {
          lightRef.current = node
        }}
        color="#b82038"
        distance={118}
        intensity={0.55}
        position={[0, 9, -58]}
      />

      {peripheralNodes.map(({ index }) => (
        <RememberedShapeNode
          key={`remembered-shape-${index}`}
          index={index}
          nodeRef={(node) => {
            peripheralRefs.current[index] = node
          }}
        />
      ))}

      {skyTearNodes.map(({ index }) => (
        <SkyTearNode
          key={`sky-tear-${index}`}
          index={index}
          nodeRef={(node) => {
            skyTearRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
