export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

export function wrapDistance(distance: number, interval: number) {
  return ((distance % interval) + interval) % interval
}
