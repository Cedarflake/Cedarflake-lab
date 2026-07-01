import { useRef } from "react"

import { Environment, PerspectiveCamera, Stars } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import type { Group } from "three"

import { BoostGates } from "@/entities/BoostGates"
import { Checkpoints } from "@/entities/Checkpoints"
import { DreamObjects } from "@/entities/DreamObjects"
import { PlayerCar } from "@/entities/PlayerCar"
import { Track } from "@/entities/Track"
import {
  createBoostGateAt,
  createObstacleAt,
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleObstacles,
} from "@/game/generation"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { clamp, lerp } from "@/game/number"
import { useGameStore } from "@/game/useGameStore"
import { useInput } from "@/game/useInput"
import { useInputStore } from "@/game/useInputStore"

interface RuntimeState {
  x: number
  velocityX: number
  speed: number
  distance: number
  steering: number
  handledObstacles: Set<string>
  handledCheckpoints: Set<string>
  handledBoostGates: Set<string>
}

const initialRuntime: RuntimeState = {
  x: 0,
  velocityX: 0,
  speed: 0,
  distance: 0,
  steering: 0,
  handledObstacles: new Set(),
  handledCheckpoints: new Set(),
  handledBoostGates: new Set(),
}

function createRuntimeState(): RuntimeState {
  return {
    ...initialRuntime,
    handledObstacles: new Set(),
    handledCheckpoints: new Set(),
    handledBoostGates: new Set(),
  }
}

function pruneHandledEvents(handledEvents: Set<string>, currentIndex: number) {
  for (const id of handledEvents) {
    const index = Number(id.split("-").at(-1))

    if (Number.isFinite(index) && index < currentIndex - 8) {
      handledEvents.delete(id)
    }
  }
}

function RacerWorld() {
  const carRef = useRef<Group | null>(null)
  const runtimeRef = useRef<RuntimeState>(createRuntimeState())
  const wasDriftingRef = useRef(false)
  const inputRef = useInput()
  const status = useGameStore((state) => state.status)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const addScore = useGameStore((state) => state.addScore)
  const damage = useGameStore((state) => state.damage)
  const repair = useGameStore((state) => state.repair)
  const addDriftCharge = useGameStore((state) => state.addDriftCharge)
  const cashOutDrift = useGameStore((state) => state.cashOutDrift)
  const isPortrait = useThree((state) => state.size.width / state.size.height < 0.76)

  useFrame((state, delta) => {
    const runtime = runtimeRef.current

    if (status !== "running") {
      runtime.speed = lerp(runtime.speed, 0, Math.min(delta * 2.2, 1))
      setTelemetry({ speed: runtime.speed, distance: runtime.distance })
      return
    }

    const keyboardInput = inputRef.current
    const touchInput = useInputStore.getState().input
    const input = {
      steer: clamp(keyboardInput.steer + touchInput.steer, -1, 1),
      throttle: Math.max(keyboardInput.throttle, touchInput.throttle),
      brake: Math.max(keyboardInput.brake, touchInput.brake),
      isDrifting: keyboardInput.isDrifting || touchInput.isDrifting,
    }
    const grip = input.isDrifting ? trackConfig.driftGrip : trackConfig.normalGrip
    const acceleration =
      input.throttle * trackConfig.baseAcceleration - input.brake * trackConfig.braking
    runtime.speed = clamp(
      runtime.speed + acceleration * delta - trackConfig.drag * delta,
      input.throttle > 0 ? 12 : 0,
      trackConfig.maxSpeed,
    )
    runtime.velocityX = lerp(
      runtime.velocityX,
      input.steer * trackConfig.steering * (0.55 + runtime.speed / trackConfig.maxSpeed),
      Math.min(delta * 4.6 * grip, 1),
    )
    runtime.x = clamp(
      runtime.x + runtime.velocityX * delta,
      -trackConfig.roadHalfWidth + 1.05,
      trackConfig.roadHalfWidth - 1.05,
    )
    runtime.distance += runtime.speed * delta
    runtime.steering = lerp(runtime.steering, input.steer, Math.min(delta * 7, 1))

    const isScoringDrift =
      input.isDrifting && Math.abs(runtime.velocityX) > 4.2 && runtime.speed > 22
    if (isScoringDrift) {
      addDriftCharge((Math.abs(runtime.velocityX) + runtime.speed * 0.18) * delta * 18)
    }

    if (!input.isDrifting && wasDriftingRef.current) {
      cashOutDrift()
    }
    wasDriftingRef.current = input.isDrifting

    const car = carRef.current
    if (car) {
      car.position.x = lerp(car.position.x, runtime.x, Math.min(delta * 11, 1))
      car.position.y = 0.62 + Math.sin(runtime.distance * 0.12) * 0.035
      car.rotation.y = -runtime.velocityX * 0.018
    }

    state.camera.position.x = lerp(
      state.camera.position.x,
      runtime.x * 0.38,
      Math.min(delta * 2.4, 1),
    )
    const cameraY = isPortrait ? 3.7 + runtime.speed * 0.005 : 5.8 + runtime.speed * 0.015
    const cameraZ = isPortrait ? 5.8 + runtime.speed * 0.008 : 10.5 + runtime.speed * 0.025
    const lookAtZ = isPortrait ? 1.6 : -8

    state.camera.position.y = lerp(state.camera.position.y, cameraY, Math.min(delta * 2.4, 1))
    state.camera.position.z = lerp(state.camera.position.z, cameraZ, Math.min(delta * 2.4, 1))
    state.camera.lookAt(runtime.x * 0.28, isPortrait ? 0.36 : 0.55, lookAtZ)

    const obstacleIndex = Math.max(0, Math.floor((runtime.distance - 90) / 46))
    pruneHandledEvents(runtime.handledObstacles, obstacleIndex)

    for (let index = obstacleIndex; index <= obstacleIndex + 3; index += 1) {
      const obstacle = createObstacleAt(index)
      const distanceToObstacle = obstacle.distance - runtime.distance

      if (
        distanceToObstacle < 1.8 &&
        distanceToObstacle > -4 &&
        !runtime.handledObstacles.has(obstacle.id)
      ) {
        const obstacleX = obstacle.lane * trackConfig.laneWidth
        const hit = Math.abs(runtime.x - obstacleX) < obstacle.width + 0.9

        if (hit) {
          damage(trackConfig.collisionDamage)
        } else if (Math.abs(runtime.x - obstacleX) < obstacle.width + 1.75) {
          addScore(trackConfig.nearMissScore + runtime.speed * 4, "Near miss")
        } else {
          addScore(trackConfig.passScore + runtime.speed * 2, "Clean pass")
        }

        runtime.handledObstacles.add(obstacle.id)
      }
    }

    const boostGateIndex = Math.max(0, Math.floor((runtime.distance - 125) / 138))
    pruneHandledEvents(runtime.handledBoostGates, boostGateIndex)

    for (let index = boostGateIndex; index <= boostGateIndex + 2; index += 1) {
      const boostGate = createBoostGateAt(index)
      const distanceToBoostGate = boostGate.distance - runtime.distance

      if (
        distanceToBoostGate < 1.4 &&
        distanceToBoostGate > -3.2 &&
        !runtime.handledBoostGates.has(boostGate.id)
      ) {
        const boostX = boostGate.lane * trackConfig.laneWidth
        const caughtBoost = Math.abs(runtime.x - boostX) < boostGate.width + 0.55

        if (caughtBoost) {
          runtime.speed = Math.min(runtime.speed + trackConfig.boostSpeed, trackConfig.maxSpeed)
          addScore(trackConfig.boostScore + runtime.speed * 3, "Signal boost")
        }

        runtime.handledBoostGates.add(boostGate.id)
      }
    }

    const checkpointIndex = Math.max(
      0,
      Math.floor(runtime.distance / trackConfig.checkpointSpacing),
    )
    pruneHandledEvents(runtime.handledCheckpoints, checkpointIndex)

    for (let index = checkpointIndex; index <= checkpointIndex + 2; index += 1) {
      const checkpointDistance = trackConfig.checkpointSpacing * (index + 1)
      const checkpointId = `checkpoint-${index}`
      const distanceToCheckpoint = checkpointDistance - runtime.distance

      if (
        distanceToCheckpoint < 1.5 &&
        distanceToCheckpoint > -5 &&
        !runtime.handledCheckpoints.has(checkpointId)
      ) {
        runtime.handledCheckpoints.add(checkpointId)
        addScore(trackConfig.checkpointScore + runtime.speed * 6, "Checkpoint slipped through")
        repair(trackConfig.checkpointRepair)
      }
    }

    setTelemetry({ speed: runtime.speed, distance: runtime.distance })
  })

  const visibleObstacles = createVisibleObstacles(runtimeRef.current.distance)
  const visibleBoostGates = createVisibleBoostGates(runtimeRef.current.distance)
  const visibleCheckpoints = createVisibleCheckpoints(runtimeRef.current.distance)

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5.8, 10.5]} rotation={[-0.28, 0, 0]} fov={54} />
      <color attach="background" args={[dreamPalette.skyTop]} />
      <fog attach="fog" args={[dreamPalette.fog, 24, 170]} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[8, 11, 7]} intensity={2.4} castShadow={!isPortrait} />
      <pointLight position={[0, 5, 2]} color={dreamPalette.carGlow} intensity={10} distance={14} />
      {isPortrait ? null : <Environment preset="sunset" />}
      <Stars
        radius={120}
        depth={42}
        count={isPortrait ? 720 : 1400}
        factor={2.3}
        saturation={0.2}
        fade
        speed={0.28}
      />
      <Track distance={runtimeRef.current.distance} />
      <BoostGates distance={runtimeRef.current.distance} boostGates={visibleBoostGates} />
      <DreamObjects distance={runtimeRef.current.distance} obstacles={visibleObstacles} />
      <Checkpoints distance={runtimeRef.current.distance} checkpoints={visibleCheckpoints} />
      <PlayerCar
        carRef={carRef}
        steering={runtimeRef.current.steering}
        isDrifting={inputRef.current.isDrifting}
      />
    </>
  )
}

export function LiminalRacerScene() {
  return (
    <Canvas shadows dpr={1} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}>
      <RacerWorld />
    </Canvas>
  )
}
