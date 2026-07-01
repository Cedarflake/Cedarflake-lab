import { create } from "zustand"

import type { GameStatus } from "@/shared/types"

interface GameState {
  status: GameStatus
  score: number
  speed: number
  distance: number
  integrity: number
  combo: number
  bestScore: number
  lastEvent: string
  impactId: number
  start: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  setTelemetry: (telemetry: GameTelemetry) => void
  addScore: (score: number, event: string) => void
  damage: (amount: number) => void
}

interface GameTelemetry {
  speed: number
  distance: number
}

const initialRunState = {
  score: 0,
  speed: 0,
  distance: 0,
  integrity: 100,
  combo: 1,
  lastEvent: "Find the exit ramp",
  impactId: 0,
}

export const useGameStore = create<GameState>((set) => ({
  status: "ready",
  bestScore: 0,
  ...initialRunState,
  start: () => set({ status: "running", ...initialRunState }),
  pause: () => set((state) => (state.status === "running" ? { status: "paused" } : state)),
  resume: () => set((state) => (state.status === "paused" ? { status: "running" } : state)),
  restart: () => set({ status: "running", ...initialRunState }),
  setTelemetry: (telemetry) => set(telemetry),
  addScore: (score, event) =>
    set((state) => {
      const nextScore = state.score + Math.round(score * state.combo)
      const nextCombo = Math.min(state.combo + 0.08, 5)

      return {
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
        combo: nextCombo,
        lastEvent: event,
      }
    }),
  damage: (amount) =>
    set((state) => {
      const integrity = Math.max(0, state.integrity - amount)
      const nextScore = Math.max(0, state.score - 120)

      return {
        integrity,
        score: nextScore,
        combo: 1,
        status: integrity <= 0 ? "ended" : state.status,
        bestScore: Math.max(state.bestScore, nextScore),
        lastEvent: integrity <= 0 ? "The road folded in on itself" : "Static in the headlights",
        impactId: state.impactId + 1,
      }
    }),
}))
