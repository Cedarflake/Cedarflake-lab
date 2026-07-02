export function willEndRunAfterDamage(integrity: number, damage: number) {
  return Math.max(0, integrity - damage) <= 0
}
