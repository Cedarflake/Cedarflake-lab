import type { PlayerInput } from "../shared/types"

export type TouchControlId = "brake" | "drift" | "go" | "left" | "right"

export function resolveTouchInput(activeControls: ReadonlySet<TouchControlId>): PlayerInput {
  const steerLeft = activeControls.has("left")
  const steerRight = activeControls.has("right")

  return {
    steer: Number(steerRight) - Number(steerLeft),
    throttle: Number(activeControls.has("go")),
    brake: Number(activeControls.has("brake")),
    isDrifting: activeControls.has("drift"),
  }
}
