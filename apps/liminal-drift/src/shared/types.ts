export type GameStatus = "ready" | "running" | "paused" | "ended"
export type BoostLane = -1 | 0 | 1
export type RoadLane = -2 | -1 | 0 | 1 | 2

export interface PlayerInput {
  steer: number
  throttle: number
  brake: number
  isDrifting: boolean
}

export interface Obstacle {
  id: string
  lane: RoadLane
  distance: number
  width: number
  kind: "pillar" | "hole" | "wall"
}

export interface Checkpoint {
  id: string
  distance: number
  width: number
}

export interface BoostGate {
  id: string
  lane: BoostLane
  distance: number
  width: number
}

export interface MemoryShard {
  id: string
  lane: RoadLane
  distance: number
}
