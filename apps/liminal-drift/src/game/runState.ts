import { clamp } from "./number"

interface CollisionDamageOptions {
  baseDamage: number
  speed: number
  speedReference: number
  minSpeedDamageMultiplier: number
  maxSpeedDamageMultiplier: number
  isDrifting: boolean
  driftDamageMultiplier: number
}

export function isCollisionRecovering(
  elapsedTime: number,
  lastCollisionAt: number,
  recoverySeconds: number,
) {
  return elapsedTime - lastCollisionAt < recoverySeconds
}

export function willEndRunAfterDamage(integrity: number, damage: number) {
  return Math.max(0, integrity - damage) <= 0
}

export function resolveCollisionDamage({
  baseDamage,
  speed,
  speedReference,
  minSpeedDamageMultiplier,
  maxSpeedDamageMultiplier,
  isDrifting,
  driftDamageMultiplier,
}: CollisionDamageOptions) {
  const speedDamageMultiplier = clamp(
    speed / speedReference,
    minSpeedDamageMultiplier,
    maxSpeedDamageMultiplier,
  )
  const driftMultiplier = isDrifting ? driftDamageMultiplier : 1

  return Math.round(baseDamage * speedDamageMultiplier * driftMultiplier)
}
