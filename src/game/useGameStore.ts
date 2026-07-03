import { create } from "zustand"

import { willEndRunAfterDamage } from "@/game/runState"
import type { GameStatus } from "@/shared/types"

import { readBestScore, saveBestScore } from "./bestScoreStorage"

type FeedbackKind = "boost" | "checkpoint" | "drift" | "near-miss" | "shard"

interface GameState {
  status: GameStatus
  score: number
  speed: number
  distance: number
  integrity: number
  combo: number
  bestScore: number
  driftCharge: number
  lastEvent: string
  impactId: number
  feedbackId: number
  feedbackKind: FeedbackKind | null
  feedbackPoints: number
  runId: number
  start: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  setTelemetry: (telemetry: GameTelemetry) => void
  addScore: (score: number, event: string) => void
  addDriftCharge: (score: number) => void
  cashOutDrift: () => void
  damage: (amount: number) => void
  repair: (amount: number) => void
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
  driftCharge: 0,
  lastEvent: "Find the exit ramp",
  impactId: 0,
  feedbackId: 0,
  feedbackKind: null,
  feedbackPoints: 0,
}

function resolveBestScore(currentBest: number, nextScore: number) {
  const bestScore = Math.max(currentBest, nextScore)

  if (bestScore > currentBest) {
    saveBestScore(bestScore)
  }

  return bestScore
}

function resolveFeedbackKind(event: string): FeedbackKind | null {
  if (event === "Signal boost") return "boost"
  if (event === "Near miss") return "near-miss"
  if (event === "Memory shard") return "shard"
  if (event.startsWith("Checkpoint")) return "checkpoint"
  if (event.startsWith("Drift cashed")) return "drift"

  return null
}

export const useGameStore = create<GameState>((set) => ({
  status: "ready",
  bestScore: readBestScore(),
  runId: 0,
  ...initialRunState,
  start: () => set((state) => ({ status: "running", runId: state.runId + 1, ...initialRunState })),
  pause: () => set((state) => (state.status === "running" ? { status: "paused" } : state)),
  resume: () => set((state) => (state.status === "paused" ? { status: "running" } : state)),
  restart: () =>
    set((state) => ({ status: "running", runId: state.runId + 1, ...initialRunState })),
  setTelemetry: (telemetry) => set(telemetry),
  addScore: (score, event) =>
    set((state) => {
      const nextScore = state.score + Math.round(score * state.combo)
      const nextCombo = Math.min(state.combo + 0.08, 5)
      const feedbackKind = resolveFeedbackKind(event)
      const feedbackPoints = nextScore - state.score

      return {
        score: nextScore,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        combo: nextCombo,
        lastEvent: event,
        feedbackId: feedbackKind ? state.feedbackId + 1 : state.feedbackId,
        feedbackKind: feedbackKind ?? state.feedbackKind,
        feedbackPoints: feedbackKind ? feedbackPoints : state.feedbackPoints,
      }
    }),
  addDriftCharge: (score) =>
    set((state) => {
      const driftCharge = Math.min(state.driftCharge + score, 1600)

      return {
        driftCharge,
        lastEvent: driftCharge > 180 ? "Liminal drift" : state.lastEvent,
      }
    }),
  cashOutDrift: () =>
    set((state) => {
      if (state.driftCharge < 120) {
        return {
          driftCharge: 0,
        }
      }

      const driftScore = Math.round(state.driftCharge * state.combo)
      const nextScore = state.score + driftScore

      return {
        score: nextScore,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        combo: Math.min(state.combo + 0.35, 5),
        driftCharge: 0,
        lastEvent: `Drift cashed +${driftScore}`,
        feedbackId: state.feedbackId + 1,
        feedbackKind: "drift",
        feedbackPoints: driftScore,
      }
    }),
  damage: (amount) =>
    set((state) => {
      const willEndRun = willEndRunAfterDamage(state.integrity, amount)
      const integrity = Math.max(0, state.integrity - amount)
      const nextScore = Math.max(0, state.score - 120)

      return {
        integrity,
        score: nextScore,
        combo: 1,
        driftCharge: 0,
        status: willEndRun ? "ended" : state.status,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        lastEvent: willEndRun ? "The road folded in on itself" : "Static in the headlights",
        impactId: state.impactId + 1,
      }
    }),
  repair: (amount) =>
    set((state) => ({
      integrity: Math.min(100, state.integrity + amount),
    })),
}))
