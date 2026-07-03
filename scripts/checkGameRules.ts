import { readBestScore } from "../src/game/bestScoreStorage"
import { resolveRunDifficulty } from "../src/game/difficulty"
import { trackConfig } from "../src/game/gameConfig"
import { clamp, lerp, wrapDistance } from "../src/game/number"
import { isCollisionRecovering, willEndRunAfterDamage } from "../src/game/runState"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
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

console.log("game rules ok")
