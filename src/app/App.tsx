import { Component, lazy, Suspense, useEffect, useState } from "react"
import type { ReactNode } from "react"

import {
  disposeBackgroundMusic,
  pauseBackgroundMusic,
  resetBackgroundMusic,
} from "@/app/backgroundMusic"
import { useGameStore } from "@/game/useGameStore"
import { useKeyboardInput } from "@/game/useInput"
import { DrivingFeedback } from "@/ui/DrivingFeedback"
import { GameOverlay } from "@/ui/GameOverlay"
import { Hud } from "@/ui/Hud"

import "./App.css"

const LiminalRacerScene = lazy(() =>
  import("@/scenes/LiminalRacerScene").then((module) => ({
    default: module.LiminalRacerScene,
  })),
)

interface SceneErrorBoundaryProps {
  children: ReactNode
  onError: () => void
}

interface SceneErrorBoundaryState {
  hasError: boolean
}

class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  override state: SceneErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch() {
    this.props.onError()
  }

  private reload = () => {
    window.location.reload()
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="scene-error" role="alert">
          <strong>Scene failed to load</strong>
          <button type="button" className="ui-button" onClick={this.reload}>
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

function SceneLoading() {
  return (
    <div className="scene-loading" role="status" aria-label="Loading 3D racing scene">
      <div className="scene-loading__track" aria-hidden="true">
        <span className="scene-loading__car" />
      </div>
      <div className="scene-loading__copy">
        <strong>Liminal Drift</strong>
        <span>Warming the road</span>
      </div>
      <div className="scene-loading__meter" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}

function useRequiresDesktop() {
  const [requiresDesktop, setRequiresDesktop] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px), (pointer: coarse)")

    function updateRequiresDesktop() {
      setRequiresDesktop(query.matches)
    }

    updateRequiresDesktop()
    query.addEventListener("change", updateRequiresDesktop)

    return () => {
      query.removeEventListener("change", updateRequiresDesktop)
    }
  }, [])

  return requiresDesktop
}

function DesktopRequired() {
  return (
    <section className="desktop-required" aria-labelledby="desktop-required-title">
      <div className="desktop-required__panel">
        <span className="desktop-required__kicker">Liminal Drift</span>
        <h1 id="desktop-required-title">Desktop required</h1>
        <p>Open this game on a desktop browser with a keyboard.</p>
      </div>
    </section>
  )
}

function useBackgroundMusic(status: string) {
  useEffect(() => {
    return disposeBackgroundMusic
  }, [])

  useEffect(() => {
    if (status === "running") {
      return
    }

    pauseBackgroundMusic()

    if (status === "ready" || status === "ended") {
      resetBackgroundMusic()
    }
  }, [status])
}

export function App() {
  const status = useGameStore((state) => state.status)
  const requiresDesktop = useRequiresDesktop()
  const [isSceneReady, setIsSceneReady] = useState(false)

  useKeyboardInput()
  useBackgroundMusic(status)

  if (requiresDesktop) {
    return (
      <main className="game-shell" data-status="unsupported" tabIndex={-1}>
        <DesktopRequired />
      </main>
    )
  }

  return (
    <main
      className="game-shell"
      data-scene-ready={isSceneReady ? "true" : "false"}
      data-status={status}
      tabIndex={-1}
    >
      <div className="scene-layer">
        <SceneErrorBoundary onError={() => setIsSceneReady(true)}>
          <Suspense fallback={null}>
            <LiminalRacerScene onReady={() => setIsSceneReady(true)} />
          </Suspense>
        </SceneErrorBoundary>
      </div>
      {!isSceneReady ? <SceneLoading /> : null}
      <DrivingFeedback />
      <Hud />
      {isSceneReady ? <GameOverlay /> : null}
    </main>
  )
}
