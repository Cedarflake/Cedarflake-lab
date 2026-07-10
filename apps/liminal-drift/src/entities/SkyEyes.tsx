import { useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import { CanvasTexture, LinearFilter, TextureLoader } from "three"

import { wrapDistance } from "@/game/number"

interface SkyEyesProps {
  distanceRef: RefObject<number>
}

interface FloatingBillboard {
  opacity: number
  scale: [number, number, number]
  x: number
  y: number
  z: number
}

interface EyeJumpState {
  jumpCount: number
  jumpUntil: number
  nextJumpDistance: number
  offsetX: number
  offsetY: number
  offsetZ: number
}

interface BillboardRef {
  lookAt: (x: number, y: number, z: number) => void
  position: {
    set: (x: number, y: number, z: number) => void
  }
  rotation: {
    z: number
  }
  scale: {
    set: (x: number, y: number, z: number) => void
  }
}

const imageEyeTextureSrc = "/image/eyes-edit.png"
const skyEyes: FloatingBillboard[] = [
  { x: -18, y: 14.6, z: -44, scale: [7.4, 3.5, 1], opacity: 0.92 },
  { x: 5, y: 11.8, z: -58, scale: [4.8, 2.22, 1], opacity: 0.44 },
  { x: 25, y: 13.4, z: -76, scale: [6.2, 2.9, 1], opacity: 0.68 },
  { x: -35, y: 17.1, z: -118, scale: [8.2, 3.9, 1], opacity: 0.5 },
  { x: 38, y: 18.2, z: -142, scale: [7.1, 3.3, 1], opacity: 0.36 },
]
const eyeClouds: FloatingBillboard[] = [
  { x: 30, y: 12.8, z: -38, scale: [13.6, 5.2, 1], opacity: 0.62 },
  { x: -35, y: 11.4, z: -62, scale: [11.4, 4.4, 1], opacity: 0.56 },
  { x: 6, y: 16.2, z: -96, scale: [15.8, 5.8, 1], opacity: 0.46 },
  { x: -6, y: 20.4, z: -142, scale: [18.2, 6.2, 1], opacity: 0.36 },
]
const maxFrameDelta = 0.1
const skyMotionCycleSeconds = 24 * 60 * 60

function createEyeJumpStates() {
  return skyEyes.map((_, index) => ({
    jumpCount: 0,
    jumpUntil: 0,
    nextJumpDistance: 82 + index * 68,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
  }))
}

function resolveJumpOffset(index: number, jumpCount: number) {
  const seed = (index + 1) * 19.17 + jumpCount * 11.31
  const side = Math.sin(seed) > 0 ? 1 : -1

  return {
    x: side * (8.4 + Math.abs(Math.sin(seed * 0.43)) * 9.6),
    y: (Math.sin(seed * 0.71) - 0.18) * 2.4,
    z: -8 - Math.abs(Math.cos(seed * 0.37)) * 24,
  }
}

function drawEyeCloudTexture(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d")

  if (!context) {
    return
  }

  const width = canvas.width
  const height = canvas.height
  const centerX = width / 2
  const centerY = height / 2

  context.clearRect(0, 0, width, height)

  const glow = context.createRadialGradient(centerX, centerY, 24, centerX, centerY, 230)
  glow.addColorStop(0, "rgba(238, 215, 210, 0.52)")
  glow.addColorStop(0.48, "rgba(176, 121, 142, 0.36)")
  glow.addColorStop(0.86, "rgba(116, 135, 154, 0.2)")
  glow.addColorStop(1, "rgba(123, 83, 104, 0)")
  context.fillStyle = glow
  context.fillRect(0, 0, width, height)

  const cloudGradient = context.createLinearGradient(56, 72, 456, 194)
  cloudGradient.addColorStop(0, "rgba(212, 192, 181, 0.34)")
  cloudGradient.addColorStop(0.42, "rgba(213, 182, 170, 0.82)")
  cloudGradient.addColorStop(0.72, "rgba(168, 138, 166, 0.6)")
  cloudGradient.addColorStop(1, "rgba(117, 139, 159, 0.3)")

  const lobes = [
    [118, 146, 76, 36, -0.08],
    [186, 122, 92, 48, 0.05],
    [268, 116, 104, 54, -0.04],
    [354, 136, 82, 42, 0.08],
    [248, 158, 168, 45, 0],
  ] as const

  context.fillStyle = cloudGradient
  for (const [x, y, radiusX, radiusY, rotation] of lobes) {
    context.beginPath()
    context.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2)
    context.fill()
  }

  context.beginPath()
  context.ellipse(centerX, 158, 186, 50, 0, 0, Math.PI * 2)
  context.fillStyle = "rgba(72, 54, 70, 0.22)"
  context.fill()

  context.beginPath()
  context.moveTo(84, 150)
  context.bezierCurveTo(152, 210, 348, 214, 432, 148)
  context.strokeStyle = "rgba(229, 202, 198, 0.36)"
  context.lineWidth = 9
  context.stroke()

  context.beginPath()
  context.moveTo(126, 104)
  context.bezierCurveTo(202, 60, 326, 62, 392, 106)
  context.strokeStyle = "rgba(126, 91, 122, 0.46)"
  context.lineWidth = 7
  context.stroke()
}

function createEyeCloudTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 256
  drawEyeCloudTexture(canvas)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true

  return texture
}

function updateBillboards(
  billboards: FloatingBillboard[],
  refs: Array<BillboardRef | null>,
  elapsed: number,
  distance: number,
  cameraPosition: { x: number; y: number; z: number },
  phaseOffset: number,
) {
  billboards.forEach((billboard, index) => {
    const group = refs[index]
    if (!group) return

    const phase = elapsed * 0.16 + index * 1.7 + phaseOffset
    const drift = Math.sin(phase) * 0.9
    const parallax = (distance * (0.014 + index * 0.002)) % 14

    group.position.set(
      billboard.x + Math.sin(phase * 0.64) * 1.1,
      billboard.y + drift,
      billboard.z + parallax,
    )
    group.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    group.rotation.z += Math.sin(phase * 0.52) * 0.03
  })
}

function updateSkyEyes(
  refs: Array<BillboardRef | null>,
  jumpStates: EyeJumpState[],
  elapsed: number,
  distance: number,
  cameraPosition: { x: number; y: number; z: number },
) {
  skyEyes.forEach((eye, index) => {
    const group = refs[index]
    const jumpState = jumpStates[index]
    if (!group || !jumpState) return

    if (distance > jumpState.nextJumpDistance) {
      jumpState.jumpCount += 1
      jumpState.jumpUntil = elapsed + 0.72
      jumpState.nextJumpDistance += 154 + index * 29 + (jumpState.jumpCount % 3) * 38

      const offset = resolveJumpOffset(index, jumpState.jumpCount)
      jumpState.offsetX = offset.x
      jumpState.offsetY = offset.y
      jumpState.offsetZ = offset.z
    }

    const phase = elapsed * 0.13 + index * 1.7
    const parallax = (distance * (0.01 + index * 0.002)) % 12
    const jumpAge = Math.max(0, jumpState.jumpUntil - elapsed)
    const jumpPulse = Math.min(jumpAge / 0.22, 1)
    const isJumping = jumpAge > 0
    const x = eye.x + Math.sin(phase * 0.6) * 1.1 + (isJumping ? jumpState.offsetX : 0)
    const y = eye.y + Math.sin(phase) * 0.7 + (isJumping ? jumpState.offsetY : 0)
    const z = eye.z + parallax + (isJumping ? jumpState.offsetZ : 0)
    const pulseScale = 1 + jumpPulse * 0.12

    group.position.set(x, y, z)
    group.scale.set(eye.scale[0] * pulseScale, eye.scale[1] * (1 + jumpPulse * 0.18), eye.scale[2])
    group.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    group.rotation.z +=
      Math.sin(phase * 0.48) * 0.025 + (isJumping ? Math.sin(elapsed * 38) * 0.012 : 0)
  })
}

export function SkyEyes({ distanceRef }: SkyEyesProps) {
  const eyeRefs = useRef<Array<BillboardRef | null>>([])
  const cloudRefs = useRef<Array<BillboardRef | null>>([])
  const elapsedRef = useRef(0)
  const eyeJumpStatesRef = useRef<EyeJumpState[] | null>(null)
  const eyeTexture = useMemo(() => {
    const texture = new TextureLoader().load(imageEyeTextureSrc)
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    return texture
  }, [])
  const cloudTexture = useMemo(() => createEyeCloudTexture(), [])

  if (eyeJumpStatesRef.current === null) {
    eyeJumpStatesRef.current = createEyeJumpStates()
  }

  useEffect(() => {
    return () => {
      eyeTexture.dispose()
      cloudTexture.dispose()
    }
  }, [cloudTexture, eyeTexture])

  useFrame((state, delta) => {
    const distance = distanceRef.current
    elapsedRef.current = wrapDistance(
      elapsedRef.current + Math.min(delta, maxFrameDelta),
      skyMotionCycleSeconds,
    )
    const elapsed = elapsedRef.current
    const eyeJumpStates = eyeJumpStatesRef.current
    if (!eyeJumpStates) return

    updateSkyEyes(eyeRefs.current, eyeJumpStates, elapsed, distance, state.camera.position)
    updateBillboards(eyeClouds, cloudRefs.current, elapsed, distance, state.camera.position, 2.3)
  })

  return (
    <group>
      {eyeClouds.map((cloud, index) => (
        <group
          key={`cloud-${index}`}
          ref={(node) => {
            cloudRefs.current[index] = node
          }}
          scale={cloud.scale}
        >
          <mesh>
            <planeGeometry args={[1, 0.5]} />
            <meshBasicMaterial
              alphaTest={0.005}
              color="#d7b9c2"
              depthTest={false}
              depthWrite={false}
              fog={false}
              opacity={cloud.opacity}
              transparent
            >
              <primitive attach="map" object={cloudTexture} />
            </meshBasicMaterial>
          </mesh>
        </group>
      ))}

      {skyEyes.map((eye, index) => (
        <group
          key={`eye-${index}`}
          ref={(node) => {
            eyeRefs.current[index] = node
          }}
          scale={eye.scale}
        >
          <mesh>
            <planeGeometry args={[1, 0.58]} />
            <meshBasicMaterial
              alphaTest={0.08}
              color="#ffd7dc"
              depthWrite={false}
              opacity={eye.opacity}
              transparent
            >
              <primitive attach="map" object={eyeTexture} />
            </meshBasicMaterial>
          </mesh>
        </group>
      ))}
    </group>
  )
}
