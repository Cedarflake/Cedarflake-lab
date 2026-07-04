import { useEffect, useMemo, useRef, useState } from "react"

import { PerspectiveCamera as DreiPerspectiveCamera, Stars } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerspectiveCamera as ThreePerspectiveCamera } from "three"
import type { Group } from "three"

import { BoostGates } from "@/entities/BoostGates"
import { CarMotionTrail } from "@/entities/CarMotionTrail"
import { Checkpoints } from "@/entities/Checkpoints"
import { DreadAtmosphere } from "@/entities/DreadAtmosphere"
import { DreamObjects } from "@/entities/DreamObjects"
import { MemoryShards } from "@/entities/MemoryShards"
import { PlayerCar } from "@/entities/PlayerCar"
import { SkyEyes } from "@/entities/SkyEyes"
import { Track } from "@/entities/Track"
import {
  hasMemoryShardPassedPlayer,
  resolveObstacleCollisionHalfWidth,
  resolveObstacleNearMissHalfWidth,
  resolveMemoryShardCollection,
} from "@/game/collision"
import { resolveRunDifficulty } from "@/game/difficulty"
import {
  createBoostGateAt,
  createMemoryShardAt,
  createObstacleAt,
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleMemoryShards,
  createVisibleObstacles,
} from "@/game/generation"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { clamp, lerp } from "@/game/number"
import { isCollisionRecovering, willEndRunAfterDamage } from "@/game/runState"
import {
  resolveRelativeTrackCenter,
  resolveRelativeTrackPose,
  resolveTrackLaneOffset,
} from "@/game/trackPath"
import { resolveSteeringVelocity } from "@/game/steering"
import { useGameStore } from "@/game/useGameStore"
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
  handledMemoryShards: Set<string>
}

interface LiminalRacerSceneProps {
  onReady?: () => void
}

interface SceneReadyNotifierProps {
  onReady: () => void
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
  handledMemoryShards: new Set(),
}
const maxFrameDelta = 0.1
const baseCameraFov = 50
const maxCameraFov = 58
const telemetryIntervalSeconds = 1 / 10
const worldWindowUpdateDistance = 24

function createRuntimeState(): RuntimeState {
  return {
    ...initialRuntime,
    handledObstacles: new Set(),
    handledCheckpoints: new Set(),
    handledBoostGates: new Set(),
    handledMemoryShards: new Set(),
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

function pruneCollectedMemoryShardVisuals(
  collectedMemoryShardEffects: Map<string, number>,
  collectedMemoryShardIds: Set<string>,
  currentIndex: number,
) {
  for (const id of collectedMemoryShardIds) {
    const index = Number(id.split("-").at(-1))

    if (Number.isFinite(index) && index < currentIndex - 8) {
      collectedMemoryShardIds.delete(id)
      collectedMemoryShardEffects.delete(id)
    }
  }
}

function SceneReadyNotifier({ onReady }: SceneReadyNotifierProps) {
  const hasNotifiedRef = useRef(false)

  useFrame(() => {
    if (hasNotifiedRef.current) {
      return
    }

    hasNotifiedRef.current = true
    onReady()
  })

  return null
}

function RacerWorld() {
  const carRef = useRef<Group | null>(null)
  const collectedMemoryShardEffectsRef = useRef<Map<string, number>>(new Map())
  const collectedMemoryShardIdsRef = useRef<Set<string>>(new Set())
  const runtimeRef = useRef<RuntimeState>(createRuntimeState())
  const carXRef = useRef(0)
  const distanceRef = useRef(0)
  const isDriftingRef = useRef(false)
  const speedRef = useRef(0)
  const steeringRef = useRef(0)
  const wasDriftingRef = useRef(false)
  const worldDistanceRef = useRef(0)
  const lastCollisionAtRef = useRef(Number.NEGATIVE_INFINITY)
  const lastTelemetryAtRef = useRef(0)
  const elapsedTimeRef = useRef(0)
  const [worldDistance, setWorldDistance] = useState(0)
  const runId = useGameStore((state) => state.runId)
  const status = useGameStore((state) => state.status)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const addScore = useGameStore((state) => state.addScore)
  const damage = useGameStore((state) => state.damage)
  const repair = useGameStore((state) => state.repair)
  const addDriftCharge = useGameStore((state) => state.addDriftCharge)
  const cashOutDrift = useGameStore((state) => state.cashOutDrift)
  const isPortrait = useThree((state) => state.size.width / state.size.height < 0.76)

  useEffect(() => {
    runtimeRef.current = createRuntimeState()
    carXRef.current = 0
    distanceRef.current = 0
    isDriftingRef.current = false
    speedRef.current = 0
    steeringRef.current = 0
    wasDriftingRef.current = false
    worldDistanceRef.current = 0
    setWorldDistance(0)
    collectedMemoryShardEffectsRef.current = new Map()
    collectedMemoryShardIdsRef.current = new Set()
    lastCollisionAtRef.current = Number.NEGATIVE_INFINITY
    lastTelemetryAtRef.current = 0
    elapsedTimeRef.current = 0
    setTelemetry({ speed: 0, distance: 0 })
  }, [runId, setTelemetry])

  useFrame((state, delta) => {
    const frameDelta = Math.min(delta, maxFrameDelta)
    const runtime = runtimeRef.current
    elapsedTimeRef.current += frameDelta
    const elapsedTime = elapsedTimeRef.current
    distanceRef.current = runtime.distance

    if (status !== "running") {
      isDriftingRef.current = false
      speedRef.current = runtime.speed
      steeringRef.current = runtime.steering
      runtime.speed = lerp(runtime.speed, 0, Math.min(frameDelta * 2.2, 1))
      distanceRef.current = runtime.distance
      if (elapsedTime - lastTelemetryAtRef.current > telemetryIntervalSeconds) {
        lastTelemetryAtRef.current = elapsedTime
        setTelemetry({ speed: runtime.speed, distance: runtime.distance })
      }
      return
    }

    const { gamepadInput, keyboardInput, touchInput } = useInputStore.getState()
    const input = {
      steer: clamp(keyboardInput.steer + gamepadInput.steer + touchInput.steer, -1, 1),
      throttle: Math.max(keyboardInput.throttle, gamepadInput.throttle, touchInput.throttle),
      brake: Math.max(keyboardInput.brake, gamepadInput.brake, touchInput.brake),
      isDrifting: keyboardInput.isDrifting || gamepadInput.isDrifting || touchInput.isDrifting,
    }
    isDriftingRef.current = input.isDrifting
    const grip = input.isDrifting ? trackConfig.driftGrip : trackConfig.normalGrip
    const difficulty = resolveRunDifficulty(runtime.distance)
    const acceleration =
      input.throttle * trackConfig.baseAcceleration - input.brake * trackConfig.braking
    runtime.speed = clamp(
      runtime.speed + acceleration * frameDelta - trackConfig.drag * frameDelta,
      input.throttle > 0 ? 12 : 0,
      difficulty.maxSpeed,
    )
    const targetVelocityX = resolveSteeringVelocity(input.steer, runtime.speed, difficulty.maxSpeed)
    runtime.velocityX = lerp(
      runtime.velocityX,
      targetVelocityX,
      Math.min(frameDelta * 4.6 * grip, 1),
    )
    runtime.x = clamp(
      runtime.x + runtime.velocityX * frameDelta,
      -trackConfig.roadHalfWidth + 1.05,
      trackConfig.roadHalfWidth - 1.05,
    )
    runtime.distance += runtime.speed * frameDelta
    distanceRef.current = runtime.distance
    runtime.steering = lerp(runtime.steering, input.steer, Math.min(frameDelta * 7, 1))
    steeringRef.current = runtime.steering
    speedRef.current = runtime.speed

    if (runtime.distance - worldDistanceRef.current >= worldWindowUpdateDistance) {
      worldDistanceRef.current = runtime.distance
      setWorldDistance(runtime.distance)
    }

    const isScoringDrift =
      input.isDrifting &&
      Math.abs(runtime.velocityX) > trackConfig.driftMinimumVelocity &&
      runtime.speed > trackConfig.driftMinimumSpeed
    if (isScoringDrift) {
      addDriftCharge((Math.abs(runtime.velocityX) + runtime.speed * 0.18) * frameDelta * 18)
    }

    if (!input.isDrifting && wasDriftingRef.current) {
      cashOutDrift()
    }
    wasDriftingRef.current = input.isDrifting

    const car = carRef.current
    if (car) {
      car.position.x = lerp(car.position.x, runtime.x, Math.min(frameDelta * 11, 1))
      carXRef.current = car.position.x
      car.position.y = 0.62 + Math.sin(runtime.distance * 0.12) * 0.035
      car.rotation.y = -runtime.velocityX * 0.018
      car.rotation.x = lerp(car.rotation.x, input.brake > 0 ? -0.035 : 0.018, frameDelta * 6)
      car.rotation.z = lerp(
        car.rotation.z,
        input.isDrifting ? -runtime.steering * 0.12 : -runtime.velocityX * 0.008,
        frameDelta * 8,
      )
    }

    const cameraX = runtime.x * (isPortrait ? 0.28 : 0.18)
    state.camera.position.x = lerp(state.camera.position.x, cameraX, Math.min(frameDelta * 2.4, 1))
    const cameraY = isPortrait ? 5.6 + runtime.speed * 0.004 : 5.2 + runtime.speed * 0.006
    const cameraZ = isPortrait ? 10.2 + runtime.speed * 0.009 : 11.2 + runtime.speed * 0.012
    const lookAtY = isPortrait ? 1.35 : 1.55
    const lookAtZ = isPortrait ? -8.8 : -13.5

    state.camera.position.y = lerp(state.camera.position.y, cameraY, Math.min(frameDelta * 2.4, 1))
    state.camera.position.z = lerp(state.camera.position.z, cameraZ, Math.min(frameDelta * 2.4, 1))
    state.camera.lookAt(runtime.x * 0.2, lookAtY, lookAtZ)

    if (state.camera instanceof ThreePerspectiveCamera) {
      const speedRatio = runtime.speed / difficulty.maxSpeed
      const targetFov = baseCameraFov + (maxCameraFov - baseCameraFov) * speedRatio
      state.camera.fov = lerp(state.camera.fov, targetFov, Math.min(frameDelta * 2.8, 1))
      state.camera.updateProjectionMatrix()
    }

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
        const obstacleX =
          resolveRelativeTrackCenter(obstacle.distance, runtime.distance) +
          obstacle.lane * trackConfig.laneWidth
        const obstacleOffset = Math.abs(runtime.x - obstacleX)
        const hit = obstacleOffset < resolveObstacleCollisionHalfWidth(obstacle)

        if (hit) {
          const isRecovering = isCollisionRecovering(
            elapsedTime,
            lastCollisionAtRef.current,
            trackConfig.collisionRecoverySeconds,
          )

          if (isRecovering) {
            runtime.handledObstacles.add(obstacle.id)
            continue
          }

          const willEndRun = willEndRunAfterDamage(
            useGameStore.getState().integrity,
            trackConfig.collisionDamage,
          )

          lastCollisionAtRef.current = elapsedTime
          runtime.speed *= 0.58
          runtime.velocityX *= -0.28
          damage(trackConfig.collisionDamage)

          if (willEndRun) {
            runtime.handledObstacles.add(obstacle.id)
            return
          }
        } else if (obstacleOffset < resolveObstacleNearMissHalfWidth(obstacle)) {
          addScore(trackConfig.nearMissScore + runtime.speed * 4, {
            label: "Something missed you",
            feedbackKind: "near-miss",
          })
        } else {
          addScore(trackConfig.passScore + runtime.speed * 2, { label: "No contact recorded" })
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
        const boostX =
          resolveRelativeTrackCenter(boostGate.distance, runtime.distance) +
          boostGate.lane * trackConfig.laneWidth
        const caughtBoost = Math.abs(runtime.x - boostX) < boostGate.width + 0.55

        if (caughtBoost) {
          runtime.speed = Math.min(runtime.speed + trackConfig.boostSpeed, difficulty.maxSpeed)
          addScore(trackConfig.boostScore + runtime.speed * 3, {
            label: "Signal returned wrong",
            feedbackKind: "boost",
          })
        }

        runtime.handledBoostGates.add(boostGate.id)
      }
    }

    const memoryShardIndex = Math.max(0, Math.floor((runtime.distance - 70) / 92))
    pruneHandledEvents(runtime.handledMemoryShards, memoryShardIndex)
    pruneCollectedMemoryShardVisuals(
      collectedMemoryShardEffectsRef.current,
      collectedMemoryShardIdsRef.current,
      memoryShardIndex,
    )

    for (let index = memoryShardIndex; index <= memoryShardIndex + 3; index += 1) {
      const memoryShard = createMemoryShardAt(index)
      const pose = resolveRelativeTrackPose(memoryShard.distance, runtime.distance, 2)
      const laneOffset = resolveTrackLaneOffset(
        memoryShard.lane,
        pose.heading,
        trackConfig.laneWidth,
      )
      const shardX = pose.x + laneOffset.x
      const shardZ = pose.z + laneOffset.z

      if (!runtime.handledMemoryShards.has(memoryShard.id)) {
        if (
          resolveMemoryShardCollection({
            playerX: runtime.x,
            playerZ: 0,
            shardX,
            shardZ,
          })
        ) {
          addScore(trackConfig.memoryShardScore + runtime.speed * 2.5, {
            label: "A memory came loose",
            feedbackKind: "shard",
          })
          collectedMemoryShardIdsRef.current.add(memoryShard.id)
          collectedMemoryShardEffectsRef.current.set(memoryShard.id, elapsedTime)
          runtime.handledMemoryShards.add(memoryShard.id)
        } else if (hasMemoryShardPassedPlayer(shardZ)) {
          runtime.handledMemoryShards.add(memoryShard.id)
        }
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
        addScore(trackConfig.checkpointScore + runtime.speed * 6, {
          label: "The exit moved again",
          feedbackKind: "checkpoint",
        })
        repair(trackConfig.checkpointRepair)
      }
    }

    if (elapsedTime - lastTelemetryAtRef.current > telemetryIntervalSeconds) {
      lastTelemetryAtRef.current = elapsedTime
      setTelemetry({ speed: runtime.speed, distance: runtime.distance })
    }
  })

  const visibleObstacles = useMemo(() => createVisibleObstacles(worldDistance), [worldDistance])
  const visibleBoostGates = useMemo(() => createVisibleBoostGates(worldDistance), [worldDistance])
  const visibleCheckpoints = useMemo(() => createVisibleCheckpoints(worldDistance), [worldDistance])
  const visibleMemoryShards = useMemo(
    () => createVisibleMemoryShards(worldDistance),
    [worldDistance],
  )

  return (
    <>
      <DreiPerspectiveCamera
        makeDefault
        position={[0, 5.2, 11.2]}
        rotation={[-0.24, 0, 0]}
        fov={baseCameraFov}
      />
      <color attach="background" args={[dreamPalette.skyTop]} />
      <fog attach="fog" args={[dreamPalette.fog, 34, 190]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight
        color={dreamPalette.dreamPink}
        groundColor={dreamPalette.dreamBlue}
        intensity={0.42}
      />
      <directionalLight
        castShadow
        position={[-9, 14, 10]}
        intensity={2.8}
        shadow-camera-bottom={-42}
        shadow-camera-far={120}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={42}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <pointLight position={[0, 5, 2]} color={dreamPalette.carGlow} intensity={10} distance={14} />
      <pointLight
        position={[-18, 8, -48]}
        color={dreamPalette.dreamPink}
        intensity={7}
        distance={64}
      />
      <pointLight
        position={[20, 7, -78]}
        color={dreamPalette.dreamBlue}
        intensity={5}
        distance={72}
      />
      <Stars
        radius={120}
        depth={42}
        count={isPortrait ? 360 : 720}
        factor={2.3}
        saturation={0.2}
        fade
        speed={0.28}
      />
      <SkyEyes distanceRef={distanceRef} />
      <DreadAtmosphere distanceRef={distanceRef} speedRef={speedRef} />
      <group key={runId}>
        <Track distanceRef={distanceRef} />
        <BoostGates distanceRef={distanceRef} boostGates={visibleBoostGates} />
        <MemoryShards
          collectedMemoryShardEffectsRef={collectedMemoryShardEffectsRef}
          collectedMemoryShardIdsRef={collectedMemoryShardIdsRef}
          distanceRef={distanceRef}
          elapsedTimeRef={elapsedTimeRef}
          memoryShards={visibleMemoryShards}
        />
        <DreamObjects distanceRef={distanceRef} obstacles={visibleObstacles} />
        <Checkpoints distanceRef={distanceRef} checkpoints={visibleCheckpoints} />
        <CarMotionTrail carXRef={carXRef} distanceRef={distanceRef} speedRef={speedRef} />
        <PlayerCar
          carRef={carRef}
          distanceRef={distanceRef}
          isDriftingRef={isDriftingRef}
          steeringRef={steeringRef}
        />
      </group>
    </>
  )
}

export function LiminalRacerScene({ onReady }: LiminalRacerSceneProps) {
  return (
    <Canvas
      aria-label="Liminal Drift 3D racing scene"
      dpr={1}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      shadows="percentage"
    >
      <RacerWorld />
      {onReady ? <SceneReadyNotifier onReady={onReady} /> : null}
    </Canvas>
  )
}
