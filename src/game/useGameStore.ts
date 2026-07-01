import { create } from "zustand"

import type { GameStatus } from "@/shared/types"

type FeedbackKind = "boost" | "checkpoint" | "drift" | "near-miss"

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

const bestScoreKey = "liminal-drift:best-score"

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
}

function readBestScore() {
  const value = window.localStorage.getItem(bestScoreKey)
  const score = Number(value)

  return Number.isFinite(score) ? score : 0
}

function saveBestScore(score: number) {
  window.localStorage.setItem(bestScoreKey, String(score))
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
  if (event.startsWith("Checkpoint")) return "checkpoint"
  if (event.startsWith("Drift cashed")) return "drift"

  return null
}

export const useGameStore = create<GameState>((set) => ({
  status: "ready",
  bestScore: readBestScore(),
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
      const feedbackKind = resolveFeedbackKind(event)

      return {
        score: nextScore,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        combo: nextCombo,
        lastEvent: event,
        feedbackId: feedbackKind ? state.feedbackId + 1 : state.feedbackId,
        feedbackKind: feedbackKind ?? state.feedbackKind,
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
        driftCharge: 0,
        status: integrity <= 0 ? "ended" : state.status,
        bestScore: resolveBestScore(state.bestScore, nextScore),
        lastEvent: integrity <= 0 ? "The road folded in on itself" : "Static in the headlights",
        impactId: state.impactId + 1,
      }
    }),
  repair: (amount) =>
    set((state) => ({
      integrity: Math.min(100, state.integrity + amount),
    })),
}))
