import { lazy, Suspense } from "react"

import { useKeyboardInput } from "@/game/useInput"
import { DrivingFeedback } from "@/ui/DrivingFeedback"
import { GameOverlay } from "@/ui/GameOverlay"
import { Hud } from "@/ui/Hud"
import { TouchControls } from "@/ui/TouchControls"

import "./App.css"

const LiminalRacerScene = lazy(() =>
  import("@/scenes/LiminalRacerScene").then((module) => ({
    default: module.LiminalRacerScene,
  })),
)

export function App() {
  useKeyboardInput()

  return (
    <main className="game-shell" tabIndex={-1}>
      <Suspense
        fallback={
          <div className="scene-loading" role="status" aria-label="Loading 3D racing scene" />
        }
      >
        <LiminalRacerScene />
      </Suspense>
      <DrivingFeedback />
      <Hud />
      <TouchControls />
      <GameOverlay />
    </main>
  )
}
