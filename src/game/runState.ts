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
