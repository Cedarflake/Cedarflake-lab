export type GameStatus = "ready" | "running" | "paused" | "ended"

export interface PlayerInput {
  steer: number
  throttle: number
  brake: number
  isDrifting: boolean
}

export interface Obstacle {
  id: string
  lane: number
  distance: number
  width: number
  kind: "pillar" | "pool" | "arch"
}

export interface Checkpoint {
  id: string
  distance: number
  width: number
}

export interface BoostGate {
  id: string
  lane: number
  distance: number
  width: number
}

export interface MemoryShard {
  id: string
  lane: number
  distance: number
}
