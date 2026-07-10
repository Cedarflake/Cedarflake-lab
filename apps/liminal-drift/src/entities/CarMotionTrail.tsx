import { useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"

import { clamp, lerp } from "@/game/number"

interface TrailSample {
  distance: number
  x: number
}

interface TrailSurface {
  geometry: BufferGeometry
  positions: Float32Array
  positionAttribute: Float32BufferAttribute
  side: number
}

interface TrailMaterialRef {
  opacity: number
}

interface CarMotionTrailProps {
  carXRef: RefObject<number>
  distanceRef: RefObject<number>
  speedRef: RefObject<number>
}

const maxControlSamples = 20
const trailSegmentCount = 44
const minDistanceSpacing = 0.62
const minLateralSpacing = 0.14
const trailOffsets = [0] as const

function createTrailSurface(offsetX: number) {
  const geometry = new BufferGeometry()
  const positionAttribute = new Float32BufferAttribute(trailSegmentCount * 2 * 3, 3)
  const positions = positionAttribute.array as Float32Array
  const indices: number[] = []

  for (let index = 0; index < trailSegmentCount - 1; index += 1) {
    const left = index * 2
    const right = left + 1
    const nextLeft = left + 2
    const nextRight = left + 3

    indices.push(left, nextLeft, right, right, nextLeft, nextRight)
  }

  geometry.setAttribute("position", positionAttribute)
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()

  return {
    geometry,
    positions,
    positionAttribute,
    side: offsetX,
  }
}

function writeVertex(
  positions: Float32Array,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
) {
  const offset = vertexIndex * 3

  positions[offset] = x
  positions[offset + 1] = y
  positions[offset + 2] = z
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t

  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

function sampleTrailPoint(samples: TrailSample[], progress: number) {
  if (samples.length === 0) {
    return { distance: 0, x: 0 }
  }

  const baseIndex = Math.floor(progress)
  const t = progress - baseIndex
  const fallback = samples[0] ?? { distance: 0, x: 0 }
  const readSample = (offset: number) =>
    samples[Math.trunc(clamp(baseIndex + offset, 0, samples.length - 1))] ?? fallback
  const previous = readSample(-1)
  const current = readSample(0)
  const next = readSample(1)
  const nextNext = readSample(2)

  return {
    distance: catmullRom(previous.distance, current.distance, next.distance, nextNext.distance, t),
    x: catmullRom(previous.x, current.x, next.x, nextNext.x, t),
  }
}

function smoothTrailSamples(samples: TrailSample[]) {
  let smoothedSamples = samples.map((sample) => ({ ...sample }))

  for (let pass = 0; pass < 3; pass += 1) {
    smoothedSamples = smoothedSamples.map((sample, index) => {
      if (index === 0 || index === smoothedSamples.length - 1) {
        return sample
      }

      const previous = smoothedSamples[index - 1] ?? sample
      const next = smoothedSamples[index + 1] ?? sample

      return {
        distance: sample.distance,
        x: previous.x * 0.26 + sample.x * 0.48 + next.x * 0.26,
      }
    })
  }

  return smoothedSamples
}

function updateTrailSurface(
  surface: TrailSurface,
  samples: TrailSample[],
  currentX: number,
  currentDistance: number,
) {
  const newestToOldest = smoothTrailSamples(
    [{ distance: currentDistance, x: currentX }, ...samples].sort(
      (a, b) => b.distance - a.distance,
    ),
  )
  const maxProgress = Math.max(newestToOldest.length - 1, 0)

  for (let index = 0; index < trailSegmentCount; index += 1) {
    const normalizedAge = index / (trailSegmentCount - 1)
    const progress = normalizedAge * maxProgress
    const sample = sampleTrailPoint(newestToOldest, progress)
    const nextSample = sampleTrailPoint(
      newestToOldest,
      Math.min(progress + maxProgress / (trailSegmentCount - 1), maxProgress),
    )
    const nextNormalizedAge = Math.min((index + 1) / (trailSegmentCount - 1), 1)
    const centerX = sample.x + surface.side
    const nextX = nextSample.x + surface.side
    const centerZ = 1.42 + normalizedAge * 4.55
    const nextZ = 1.42 + nextNormalizedAge * 4.55
    const tangentX = nextX - centerX
    const tangentZ = Math.max(nextZ - centerZ, 0.04)
    const normalLength = Math.hypot(tangentZ, tangentX) || 1
    const normalX = tangentZ / normalLength
    const normalZ = -tangentX / normalLength
    const halfWidth = lerp(0.12, 0.026, normalizedAge)
    const lift = 0.092 - normalizedAge * 0.034

    writeVertex(
      surface.positions,
      index * 2,
      centerX - normalX * halfWidth,
      lift,
      centerZ - normalZ * halfWidth,
    )
    writeVertex(
      surface.positions,
      index * 2 + 1,
      centerX + normalX * halfWidth,
      lift,
      centerZ + normalZ * halfWidth,
    )
  }

  surface.positionAttribute.needsUpdate = true
}

export function CarMotionTrail({ carXRef, distanceRef, speedRef }: CarMotionTrailProps) {
  const materialRefs = useRef<Array<TrailMaterialRef | null>>([])
  const samplesRef = useRef<TrailSample[]>([])
  const surfaces = useMemo(() => trailOffsets.map(createTrailSurface), [])

  useEffect(() => {
    return () => {
      surfaces.forEach((surface) => {
        surface.geometry.dispose()
      })
    }
  }, [surfaces])

  useFrame(() => {
    const currentDistance = distanceRef.current
    const currentX = carXRef.current
    const newestSample = samplesRef.current.at(-1)

    if (
      !newestSample ||
      currentDistance - newestSample.distance >= minDistanceSpacing ||
      Math.abs(currentX - newestSample.x) >= minLateralSpacing
    ) {
      samplesRef.current.push({
        distance: currentDistance,
        x: newestSample ? lerp(newestSample.x, currentX, 0.38) : currentX,
      })

      while (samplesRef.current.length > maxControlSamples) {
        samplesRef.current.shift()
      }
    }

    const opacity = clamp((speedRef.current - 7) / 48, 0, 0.46)

    surfaces.forEach((surface) => {
      updateTrailSurface(surface, samplesRef.current, currentX, currentDistance)
    })

    materialRefs.current.forEach((material) => {
      if (!material) return

      material.opacity = lerp(material.opacity, opacity, 0.16)
    })
  })

  return (
    <>
      {surfaces.map((surface, index) => (
        <mesh key={`${surface.side}:${index}`} frustumCulled={false} renderOrder={20}>
          <primitive object={surface.geometry} attach="geometry" />
          <meshBasicMaterial
            ref={(material) => {
              materialRefs.current[index] = material
            }}
            color="#b06a7f"
            side={DoubleSide}
            toneMapped={false}
            transparent
            depthWrite={false}
            depthTest
            opacity={0}
          />
        </mesh>
      ))}
    </>
  )
}
