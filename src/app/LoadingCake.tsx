import { Suspense, useEffect, useMemo, useRef } from "react"

import { useGLTF } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Box3, Mesh, Vector3 } from "three"
import type { Group } from "three"

import { loadingCakeModelPath } from "@/app/loadingCakeAssets"

const maxFrameDelta = 0.1
const cakeScale = 2.95
const cakeHoverAmplitude = 0.035
const cakeHoverSpeed = 1.55
const cakeInitialAngleDelaySeconds = 0.72
const cakeAngleIntervalSeconds = 0.9
const cakeBasePitch = 0.42
const cakeBaseRoll = 0.03
const cakeBaseYaw = -0.22

interface LoadingCakeMotion {
  elapsed: number
  nextAngleAt: number
  pitchOffset: number
  rollOffset: number
  yawOffset: number
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function resolveNextAngle(current: number, min: number, max: number, minShift: number) {
  let next = randomBetween(min, max)

  if (Math.abs(next - current) < minShift) {
    next += next >= current ? minShift : -minShift
  }

  return Math.min(max, Math.max(min, next))
}

function CakeModel() {
  const groupRef = useRef<Group | null>(null)
  const shouldReduceMotionRef = useRef(false)
  const motionRef = useRef<LoadingCakeMotion>({
    elapsed: 0,
    nextAngleAt: cakeInitialAngleDelaySeconds,
    pitchOffset: 0,
    rollOffset: 0,
    yawOffset: 0,
  })
  const { scene } = useGLTF(loadingCakeModelPath)
  const cakeModel = useMemo(() => {
    const clonedScene = scene.clone(true)
    const bounds = new Box3()
    let hasBounds = false

    clonedScene.updateWorldMatrix(true, true)
    clonedScene.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return
      }

      object.geometry.computeBoundingBox()
      const meshBounds = object.geometry.boundingBox
      if (!meshBounds) {
        return
      }

      bounds.union(meshBounds.clone().applyMatrix4(object.matrixWorld))
      hasBounds = true
    })

    if (!hasBounds) {
      return clonedScene
    }

    const visualCenter = new Vector3()
    bounds.getCenter(visualCenter)
    clonedScene.position.sub(visualCenter)

    return clonedScene
  }, [scene])

  useEffect(() => {
    cakeModel.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return
      }

      object.frustumCulled = false
    })
  }, [cakeModel])

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")

    function updateMotionPreference() {
      shouldReduceMotionRef.current = query.matches
    }

    updateMotionPreference()
    query.addEventListener("change", updateMotionPreference)

    return () => {
      query.removeEventListener("change", updateMotionPreference)
    }
  }, [])

  useFrame((_, frameDelta) => {
    const group = groupRef.current
    if (!group) {
      return
    }

    if (shouldReduceMotionRef.current) {
      group.position.y = 0
      group.rotation.set(cakeBasePitch, cakeBaseYaw, cakeBaseRoll)
      return
    }

    const delta = Math.min(frameDelta, maxFrameDelta)
    const motion = motionRef.current
    motion.elapsed += delta

    if (motion.elapsed >= motion.nextAngleAt) {
      motion.pitchOffset = resolveNextAngle(motion.pitchOffset, -0.1, 0.12, 0.06)
      motion.rollOffset = resolveNextAngle(motion.rollOffset, -0.1, 0.1, 0.05)
      motion.yawOffset = resolveNextAngle(motion.yawOffset, -0.34, 0.34, 0.14)
      motion.nextAngleAt += cakeAngleIntervalSeconds

      while (motion.nextAngleAt <= motion.elapsed) {
        motion.nextAngleAt += cakeAngleIntervalSeconds
      }
    }

    group.position.y = Math.sin(motion.elapsed * cakeHoverSpeed) * cakeHoverAmplitude
    group.rotation.set(
      cakeBasePitch + motion.pitchOffset,
      cakeBaseYaw + motion.yawOffset,
      cakeBaseRoll + motion.rollOffset,
    )
  })

  return (
    <group ref={groupRef} scale={cakeScale}>
      <primitive object={cakeModel} dispose={null} />
    </group>
  )
}

function LoadingCakeCamera() {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    camera.lookAt(0, 0, 0)
  }, [camera])

  return null
}

export function LoadingCake() {
  return (
    <Canvas
      className="scene-loading__cake-canvas"
      camera={{ fov: 34, position: [0, 1.05, 4.35] }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    >
      <LoadingCakeCamera />
      <ambientLight intensity={1.35} />
      <directionalLight color="#fff3cf" intensity={2.8} position={[-2.4, 3.2, 3.8]} />
      <pointLight color="#88c7c7" intensity={6.5} position={[2.3, 0.7, 2.1]} />
      <Suspense fallback={null}>
        <CakeModel />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(loadingCakeModelPath)
