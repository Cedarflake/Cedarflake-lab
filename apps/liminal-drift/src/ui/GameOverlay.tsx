import { useCallback, useEffect, useMemo, useState } from "react"

import { playBackgroundMusic } from "@/app/backgroundMusic"
import {
  EndedDialog,
  PausedDialog,
  RaceControlButton,
  StartDialog,
} from "@/ui/game-overlay/OverlayDialogs"
import { useDialogFocusTrap } from "@/ui/game-overlay/focusTrap"
import {
  resolveGamepadStatusText,
  useGamepadOverlayControls,
} from "@/ui/game-overlay/gamepadOverlayControls"
import { useOverlayShortcuts } from "@/ui/game-overlay/overlayShortcuts"
import type { RunStatsData } from "@/ui/game-overlay/types"
import { useGameStore } from "@/game/useGameStore"
import type { GameStatus } from "@/shared/types"

const dialogExitMs = 160

type DialogStatus = Exclude<GameStatus, "running">

interface DialogSnapshot {
  gamepadStatusText: string
  hasNewBest: boolean
  stats: RunStatsData
  status: DialogStatus
}

function isDialogStatus(status: GameStatus): status is DialogStatus {
  return status !== "running"
}

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const bestDriftScore = useGameStore((state) => state.bestDriftScore)
  const bestScore = useGameStore((state) => state.bestScore)
  const checkpointCount = useGameStore((state) => state.checkpointCount)
  const combo = useGameStore((state) => state.combo)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const score = useGameStore((state) => state.score)
  const topSpeed = useGameStore((state) => state.topSpeed)
  const hasNewBest = useGameStore((state) => state.hasNewBest)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)
  const dialogRef = useDialogFocusTrap(status)
  const [isDialogExiting, setIsDialogExiting] = useState(false)
  const stats = useMemo<RunStatsData>(
    () => ({
      bestDriftScore,
      bestScore,
      checkpointCount,
      combo,
      distance,
      integrity,
      score,
      topSpeed,
    }),
    [bestDriftScore, bestScore, checkpointCount, combo, distance, integrity, score, topSpeed],
  )

  const playMusicFromGesture = useCallback(() => {
    void playBackgroundMusic().catch(() => undefined)
  }, [])

  const runWithDialogExit = useCallback((action: () => void) => {
    setIsDialogExiting(true)
    action()
  }, [])

  const handleStart = useCallback(() => {
    playMusicFromGesture()
    runWithDialogExit(start)
  }, [playMusicFromGesture, runWithDialogExit, start])

  const handleResume = useCallback(() => {
    playMusicFromGesture()
    runWithDialogExit(resume)
  }, [playMusicFromGesture, resume, runWithDialogExit])

  const handleRestart = useCallback(() => {
    playMusicFromGesture()
    runWithDialogExit(restart)
  }, [playMusicFromGesture, restart, runWithDialogExit])

  const gamepadStatus = useGamepadOverlayControls({
    onPause: pause,
    onRestart: handleRestart,
    onResume: handleResume,
    onStart: handleStart,
    status,
  })
  const gamepadStatusText = resolveGamepadStatusText(gamepadStatus)
  const [dialogSnapshot, setDialogSnapshot] = useState<DialogSnapshot | null>(() =>
    isDialogStatus(status)
      ? {
          gamepadStatusText,
          hasNewBest,
          stats,
          status,
        }
      : null,
  )
  const activeDialogSnapshot = isDialogStatus(status)
    ? {
        gamepadStatusText,
        hasNewBest,
        stats,
        status,
      }
    : dialogSnapshot

  useOverlayShortcuts({
    onPause: pause,
    onResume: handleResume,
    status,
  })

  useEffect(() => {
    if (!isDialogStatus(status)) {
      return
    }

    setDialogSnapshot({
      gamepadStatusText,
      hasNewBest,
      stats,
      status,
    })
    setIsDialogExiting(false)
  }, [gamepadStatusText, hasNewBest, stats, status])

  useEffect(() => {
    if (status !== "running" || dialogSnapshot === null) {
      return
    }

    setIsDialogExiting(true)

    const timeoutId = window.setTimeout(() => {
      setDialogSnapshot(null)
      setIsDialogExiting(false)
    }, dialogExitMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [dialogSnapshot, status])

  const dialog =
    activeDialogSnapshot?.status === "paused" ? (
      <PausedDialog
        dialogRef={dialogRef}
        isExiting={isDialogExiting}
        onRestart={handleRestart}
        onResume={handleResume}
        stats={activeDialogSnapshot.stats}
      />
    ) : activeDialogSnapshot?.status === "ended" ? (
      <EndedDialog
        dialogRef={dialogRef}
        hasNewBest={activeDialogSnapshot.hasNewBest}
        isExiting={isDialogExiting}
        onRestart={handleRestart}
        stats={activeDialogSnapshot.stats}
      />
    ) : activeDialogSnapshot?.status === "ready" ? (
      <StartDialog
        dialogRef={dialogRef}
        gamepadStatusText={activeDialogSnapshot.gamepadStatusText}
        isExiting={isDialogExiting}
        onStart={handleStart}
      />
    ) : null

  return (
    <>
      {status === "running" ? (
        <RaceControlButton
          onPause={pause}
          onResume={handleResume}
          onStart={handleStart}
          status={status}
        />
      ) : null}
      {dialog}
    </>
  )
}
