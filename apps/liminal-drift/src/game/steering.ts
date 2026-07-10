import { trackConfig } from "./gameConfig"
import { clamp } from "./number"

export const steeringEngageSpeed = 18

export function resolveSteeringVelocity(steer: number, speed: number, maxSpeed: number) {
  const steeringSpeedRatio = clamp(speed / steeringEngageSpeed, 0, 1)

  return steer * trackConfig.steering * steeringSpeedRatio * (0.55 + Math.max(speed, 0) / maxSpeed)
}
