import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"
import { resolveRelativeTrackCenter, resolveTrackHeading } from "@/game/trackPath"

interface TrackSegmentRef {
  position: {
    set: (x: number, y: number, z: number) => void
  }
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
}

interface RoadSurfaceRef {
  visible: boolean
}

interface TrackProps {
  distanceRef: RefObject<number>
}

const alternateRoadColor = "#ece7e8"

export function Track({ distanceRef }: TrackProps) {
  const segmentRefs = useRef<Array<TrackSegmentRef | null>>([])
  const roadSurfaceRefs = useRef<Array<RoadSurfaceRef | null>>([])
  const segmentIndexes = useMemo(
    () => Array.from({ length: trackConfig.visibleSegments }, (_, index) => index),
    [],
  )

  useFrame(() => {
    const distance = distanceRef.current
    const offset = wrapDistance(distance, trackConfig.segmentLength)
    const firstSegmentDistance = Math.max(0, distance - offset)

    segmentRefs.current.forEach((segment, index) => {
      if (!segment) return

      const segmentDistance = firstSegmentDistance + index * trackConfig.segmentLength
      const segmentParity = Math.floor(segmentDistance / trackConfig.segmentLength) % 2
      const z = -(segmentDistance - distance) + 8
      const bend = resolveRelativeTrackCenter(segmentDistance, distance)
      const heading = resolveTrackHeading(segmentDistance)
      const baseRoad = roadSurfaceRefs.current[index * 2]
      const alternateRoad = roadSurfaceRefs.current[index * 2 + 1]

      segment.position.set(bend, -0.12, z)
      segment.rotation.set(0, heading, 0)

      if (baseRoad) {
        baseRoad.visible = segmentParity === 0
      }

      if (alternateRoad) {
        alternateRoad.visible = segmentParity === 1
      }
    })
  })

  return (
    <group>
      {segmentIndexes.map((index) => (
        <group
          key={index}
          ref={(segment) => {
            segmentRefs.current[index] = segment
          }}
        >
          <mesh
            receiveShadow
            ref={(road) => {
              roadSurfaceRefs.current[index * 2] = road
            }}
          >
            <boxGeometry
              args={[trackConfig.roadHalfWidth * 2, 0.18, trackConfig.segmentLength + 0.36]}
            />
            <meshStandardMaterial color={dreamPalette.road} roughness={0.72} />
          </mesh>
          <mesh
            receiveShadow
            ref={(road) => {
              roadSurfaceRefs.current[index * 2 + 1] = road
            }}
          >
            <boxGeometry
              args={[trackConfig.roadHalfWidth * 2, 0.18, trackConfig.segmentLength + 0.36]}
            />
            <meshStandardMaterial color={alternateRoadColor} roughness={0.72} />
          </mesh>

          <mesh position={[-trackConfig.roadHalfWidth - 0.12, 0.03, 0]}>
            <boxGeometry args={[0.16, 0.2, trackConfig.segmentLength - 0.2]} />
            <meshStandardMaterial
              color={dreamPalette.roadEdge}
              emissive={dreamPalette.roadEdge}
              emissiveIntensity={0.25}
            />
          </mesh>
          <mesh position={[trackConfig.roadHalfWidth + 0.12, 0.03, 0]}>
            <boxGeometry args={[0.16, 0.2, trackConfig.segmentLength - 0.2]} />
            <meshStandardMaterial
              color={dreamPalette.roadEdge}
              emissive={dreamPalette.roadEdge}
              emissiveIntensity={0.25}
            />
          </mesh>

          {[-1, 0, 1].map((lane) => (
            <mesh key={lane} position={[lane * trackConfig.laneWidth, 0.04, 0]}>
              <boxGeometry args={[0.08, 0.05, trackConfig.segmentLength * 0.44]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.34} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
