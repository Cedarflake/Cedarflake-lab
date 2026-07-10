import { clamp } from "./number"

interface DrivingSpeedInput {
  acceleration: number
  drag: number
  frameDelta: number
  speed: number
  speedLimit: number
}

export function resolveBoostedSpeed(currentSpeed: number, boostAmount: number, speedLimit: number) {
  return Math.max(currentSpeed, Math.min(currentSpeed + boostAmount, speedLimit + boostAmount))
}

export function resolveDrivingSpeed({
  acceleration,
  drag,
  frameDelta,
  speed,
  speedLimit,
}: DrivingSpeedInput) {
  const nextSpeed = speed + acceleration * frameDelta - drag * frameDelta

  if (nextSpeed > speedLimit) {
    return Math.max(speedLimit, speed - drag * frameDelta * 0.85)
  }

  return clamp(nextSpeed, 0, speedLimit)
}
