import { create } from "zustand"

import { willEndRunAfterDamage } from "@/game/runState"
import { resolveScoreFeedback } from "@/game/scoring"
import type { FeedbackKind, ScoreEvent } from "@/game/scoring"
import type { GameStatus } from "@/shared/types"

import { readBestScore, saveBestScore } from "./bestScoreStorage"

interface GameState {
  status: GameStatus
  score: number
  speed: number
  distance: number
  integrity: number
  combo: number
  bestScore: number
  topSpeed: number
  checkpointCount: number
  bestDriftScore: number
  hasNewBest: boolean
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
  addScore: (score: number, event: ScoreEvent) => void
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
  topSpeed: 0,
  checkpointCount: 0,
  bestDriftScore: 0,
  hasNewBest: false,
  driftCharge: 0,
  lastEvent: "The exit is not where it was",
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

export const useGameStore = create<GameState>((set) => ({
  status: "ready",
  bestScore: readBestScore(),
  runId: 0,
  ...initialRunState,
  start: () => set({ status: "running", ...initialRunState }),
  pause: () => set((state) => (state.status === "running" ? { status: "paused" } : state)),
  resume: () => set((state) => (state.status === "paused" ? { status: "running" } : state)),
  restart: () =>
    set((state) => ({ status: "running", runId: state.runId + 1, ...initialRunState })),
  setTelemetry: (telemetry) =>
    set((state) => ({
      ...telemetry,
      topSpeed: Math.max(state.topSpeed, telemetry.speed),
    })),
  addScore: (score, event) =>
    set((state) => {
      const nextScore = state.score + Math.round(score * state.combo)
      const nextCombo = Math.min(state.combo + 0.08, 5)
      const feedbackKind = resolveScoreFeedback(event)
      const feedbackPoints = nextScore - state.score
      const hasNewBest = state.hasNewBest || nextScore > state.bestScore

      return {
        score: nextScore,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        hasNewBest,
        combo: nextCombo,
        checkpointCount:
          feedbackKind === "checkpoint" ? state.checkpointCount + 1 : state.checkpointCount,
        lastEvent: event.label,
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
        lastEvent: driftCharge > 180 ? "The tires remember water" : state.lastEvent,
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
      const hasNewBest = state.hasNewBest || nextScore > state.bestScore

      return {
        score: nextScore,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        hasNewBest,
        combo: Math.min(state.combo + 0.35, 5),
        bestDriftScore: Math.max(state.bestDriftScore, driftScore),
        driftCharge: 0,
        lastEvent: `The road paid back +${driftScore}`,
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
