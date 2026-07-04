import { Component, lazy, Suspense, useEffect, useState } from "react"
import type { ReactNode } from "react"

import {
  disposeBackgroundMusic,
  pauseBackgroundMusic,
  resetBackgroundMusic,
} from "@/app/backgroundMusic"
import { preloadLoadingCakeAssets } from "@/app/loadingCakeAssets"
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

function loadLoadingCake() {
  return import("@/app/LoadingCake").then((module) => ({
    default: module.LoadingCake,
  }))
}

preloadLoadingCakeAssets()
void loadLoadingCake()

const LoadingCake = lazy(loadLoadingCake)

const minimumSceneLoadingMs = 3000
const sceneLoadingFadeMs = 600

interface SceneErrorBoundaryProps {
  children: ReactNode
  onError: () => void
}

interface LoadingVisualBoundaryProps {
  children: ReactNode
}

interface SceneErrorBoundaryState {
  hasError: boolean
}

interface LoadingVisualBoundaryState {
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

class LoadingVisualBoundary extends Component<
  LoadingVisualBoundaryProps,
  LoadingVisualBoundaryState
> {
  override state: LoadingVisualBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): LoadingVisualBoundaryState {
    return { hasError: true }
  }

  override render() {
    if (this.state.hasError) {
      return <div className="scene-loading__cake-fallback" />
    }

    return this.props.children
  }
}

interface SceneLoadingProps {
  isExiting: boolean
}

function SceneLoading({ isExiting }: SceneLoadingProps) {
  return (
    <div
      className="scene-loading"
      data-exiting={isExiting ? "true" : "false"}
      role="status"
      aria-label="Loading 3D racing scene"
    >
      <div className="scene-loading__cake" aria-hidden="true">
        <LoadingVisualBoundary>
          <Suspense fallback={<div className="scene-loading__cake-fallback" />}>
            <LoadingCake />
          </Suspense>
        </LoadingVisualBoundary>
      </div>
      <div className="scene-loading__copy">
        <strong>Liminal Drift</strong>
        <span>The cake remembers the road</span>
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
  const [hasSceneFrame, setHasSceneFrame] = useState(false)
  const [hasMinimumLoadingElapsed, setHasMinimumLoadingElapsed] = useState(false)
  const [isLoadingVisible, setIsLoadingVisible] = useState(true)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const canExitLoading = hasSceneFrame && hasMinimumLoadingElapsed
  const isSceneReady = !isLoadingVisible

  useKeyboardInput()
  useBackgroundMusic(status)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasMinimumLoadingElapsed(true)
    }, minimumSceneLoadingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!canExitLoading) {
      return
    }

    setIsLoadingExiting(true)

    const timeoutId = window.setTimeout(() => {
      setIsLoadingVisible(false)
    }, sceneLoadingFadeMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [canExitLoading])

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
        <SceneErrorBoundary onError={() => setHasSceneFrame(true)}>
          <Suspense fallback={null}>
            <LiminalRacerScene onReady={() => setHasSceneFrame(true)} />
          </Suspense>
        </SceneErrorBoundary>
      </div>
      {isLoadingVisible ? <SceneLoading isExiting={isLoadingExiting} /> : null}
      <DrivingFeedback />
      <Hud />
      {isSceneReady ? <GameOverlay /> : null}
    </main>
  )
}
