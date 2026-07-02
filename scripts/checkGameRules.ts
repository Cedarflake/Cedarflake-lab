import { willEndRunAfterDamage } from "../src/game/runState"
import { readBestScore } from "../src/game/bestScoreStorage"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(!willEndRunAfterDamage(23, 22), "Expected non-fatal damage above the threshold")
assert(willEndRunAfterDamage(22, 22), "Expected exact-threshold damage to end the run")
assert(willEndRunAfterDamage(12, 22), "Expected overkill damage to end the run")
assert(readBestScore() === 0, "Expected best score storage to initialize outside the browser")

console.log("game rules ok")
