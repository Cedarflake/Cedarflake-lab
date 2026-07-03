import { readBestScore } from "../src/game/bestScoreStorage"
import {
  playerCollisionHalfWidth,
  resolveObstacleCollisionHalfWidth,
  resolveObstacleHalfWidth,
  resolveObstacleNearMissHalfWidth,
  wallObstacleWidth,
} from "../src/game/collision"
import { resolveRunDifficulty } from "../src/game/difficulty"
import {
  resolveActiveGamepad,
  resolveGamepadInput,
  resolveGamepadOverlayInput,
  type GamepadLike,
} from "../src/game/gamepadInput"
import { trackConfig } from "../src/game/gameConfig"
import { clamp, lerp, wrapDistance } from "../src/game/number"
import { isCollisionRecovering, willEndRunAfterDamage } from "../src/game/runState"
import { resolveScoreFeedback } from "../src/game/scoring"
import { resolveSteeringVelocity } from "../src/game/steering"
import { resolveTouchInput } from "../src/game/touchInput"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function createGamepad(
  buttonValues: Record<number, number>,
  axes: readonly number[] = [],
  options: {
    id?: string
    index?: number
    mapping?: string
  } = {},
) {
  const buttons = Array.from({ length: 16 }, (_, index) => {
    const value = buttonValues[index] ?? 0

    return {
      pressed: value > 0,
      value,
    }
  })

  return {
    axes,
    buttons,
    connected: true,
    ...options,
  } satisfies GamepadLike
}

assert(!willEndRunAfterDamage(23, 22), "Expected non-fatal damage above the threshold")
assert(willEndRunAfterDamage(22, 22), "Expected exact-threshold damage to end the run")
assert(willEndRunAfterDamage(12, 22), "Expected overkill damage to end the run")
assert(
  isCollisionRecovering(10.8, 10, trackConfig.collisionRecoverySeconds),
  "Expected a recent collision to keep the car recovering",
)
assert(
  !isCollisionRecovering(12, 10, trackConfig.collisionRecoverySeconds),
  "Expected recovery to expire after the configured window",
)
assert(readBestScore() === 0, "Expected best score storage to initialize outside the browser")
assert(clamp(-2, 0, 1) === 0, "Expected clamp to honor the lower bound")
assert(clamp(3, 0, 1) === 1, "Expected clamp to honor the upper bound")
assert(clamp(0.4, 0, 1) === 0.4, "Expected clamp to preserve in-range values")
assert(lerp(10, 20, 0.25) === 12.5, "Expected lerp to interpolate linearly")
assert(wrapDistance(23, 10) === 3, "Expected wrapDistance to wrap positive distances")
assert(wrapDistance(-2, 10) === 8, "Expected wrapDistance to wrap negative distances")
assert(resolveRunDifficulty(0).maxSpeed === 58, "Expected base max speed at the run start")
assert(resolveRunDifficulty(800).maxSpeed === 64, "Expected midpoint speed ramp")
assert(resolveRunDifficulty(3200).maxSpeed === 70, "Expected capped max speed ramp")
assert(
  resolveSteeringVelocity(1, 0, trackConfig.maxSpeed) === 0,
  "Expected steering input to avoid moving a stationary car sideways",
)
assert(
  resolveSteeringVelocity(1, 12, trackConfig.maxSpeed) > 0,
  "Expected steering input to engage after the car starts moving",
)
assert(
  resolveObstacleHalfWidth({
    id: "wall-check",
    lane: 0,
    distance: 1,
    width: 1.55,
    kind: "wall",
  }) ===
    wallObstacleWidth / 2,
  "Expected wall collision half width to follow the rendered wall model",
)
assert(
  resolveObstacleCollisionHalfWidth({
    id: "pillar-check",
    lane: 0,
    distance: 1,
    width: 1.8,
    kind: "pillar",
  }) ===
    0.9 + playerCollisionHalfWidth,
  "Expected pillar collision to fit the rendered obstacle plus car body",
)
assert(
  resolveObstacleNearMissHalfWidth({
    id: "hole-check",
    lane: 0,
    distance: 1,
    width: 1.6,
    kind: "hole",
  }) >
    resolveObstacleCollisionHalfWidth({
      id: "hole-check",
      lane: 0,
      distance: 1,
      width: 1.6,
      kind: "hole",
    }),
  "Expected near-miss boundary to sit outside the collision boundary",
)

assert(
  resolveScoreFeedback({ label: "Boost copy can change", feedbackKind: "boost" }) === "boost",
  "Expected score feedback to ignore display copy",
)
assert(
  resolveScoreFeedback({ label: "Checkpoint copy can change", feedbackKind: "checkpoint" }) ===
    "checkpoint",
  "Expected checkpoint feedback to ignore display copy",
)
assert(
  resolveScoreFeedback({ label: "Clean pass" }) === null,
  "Expected plain score events to skip feedback",
)

const activeTouchControls = new Set(["go", "drift", "left", "right"] as const)
assert(
  resolveTouchInput(activeTouchControls).steer === 0,
  "Expected opposite touch steer to cancel",
)
assert(
  resolveTouchInput(activeTouchControls).throttle === 1,
  "Expected touch throttle to stay active",
)
assert(resolveTouchInput(activeTouchControls).isDrifting, "Expected touch drift to stay active")

activeTouchControls.delete("right")
assert(resolveTouchInput(activeTouchControls).steer === -1, "Expected held left touch to survive")

const xboxDrivingInput = resolveGamepadInput([
  createGamepad(
    {
      4: 1,
      7: 1,
    },
    [0.42],
  ),
])
assert(xboxDrivingInput.steer === 0.42, "Expected Xbox left stick to steer")
assert(xboxDrivingInput.throttle === 1, "Expected Xbox RT to drive")
assert(xboxDrivingInput.isDrifting, "Expected Xbox shoulder button to drift")

const xboxBrakeInput = resolveGamepadInput([createGamepad({ 6: 1 })])
assert(xboxBrakeInput.brake === 1, "Expected Xbox LT to brake")

const xboxOverlayInput = resolveGamepadOverlayInput([createGamepad({ 0: 1 })])
assert(xboxOverlayInput.confirm, "Expected Xbox A button to confirm overlays")
assert(!xboxOverlayInput.pause, "Expected Xbox A button to avoid pausing by itself")

const xboxMenuInput = resolveGamepadOverlayInput([createGamepad({ 9: 1 })])
assert(xboxMenuInput.confirm, "Expected Xbox Menu button to confirm overlays")
assert(xboxMenuInput.pause, "Expected Xbox Menu button to pause and resume")

const inactiveVirtualGamepad = createGamepad({}, [], {
  id: "Virtual controller",
  index: 0,
})
const activeXboxGamepad = createGamepad({ 0: 1 }, [], {
  id: "Xbox Wireless Controller",
  index: 1,
  mapping: "standard",
})
assert(
  resolveActiveGamepad([inactiveVirtualGamepad, activeXboxGamepad])?.index === 1,
  "Expected active Xbox controller to win over inactive virtual devices",
)

const axisTriggerInput = resolveGamepadInput([createGamepad({}, [0, 0, 0.72, 0, 0, 0.84])])
assert(axisTriggerInput.throttle === 0.84, "Expected non-standard trigger axis to drive")
assert(axisTriggerInput.brake === 0.72, "Expected non-standard trigger axis to brake")

console.log("game rules ok")
