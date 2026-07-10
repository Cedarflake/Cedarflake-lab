import { useEffect, useRef, useState } from "react"

import {
  resolveActiveGamepad,
  resolveGamepadOverlayInput,
  resolveGamepadStatus,
  type GamepadLike,
  type GamepadStatus,
} from "@/game/gamepadInput"
import type { GameStatus } from "@/shared/types"

interface GamepadOverlayControlsInput {
  onPause: () => void
  onRestart: () => void
  onResume: () => void
  onStart: () => void
  status: GameStatus
}

function readGamepads(): readonly (GamepadLike | null)[] {
  return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
    ? navigator.getGamepads()
    : []
}

function areGamepadStatusesEqual(a: GamepadStatus, b: GamepadStatus) {
  return (
    a.id === b.id &&
    a.index === b.index &&
    a.isConnected === b.isConnected &&
    a.isSupported === b.isSupported &&
    a.mapping === b.mapping
  )
}

export function resolveGamepadStatusText(status: GamepadStatus) {
  if (!status.isSupported) {
    return "Gamepad API is unavailable in this browser"
  }

  if (!status.isConnected) {
    return "Press any Xbox controller button to connect"
  }

  const mapping = status.mapping === "standard" ? "standard" : "custom"

  return `Gamepad detected: ${status.id || "Controller"} (${mapping})`
}

export function useGamepadOverlayControls({
  onPause,
  onRestart,
  onResume,
  onStart,
  status,
}: GamepadOverlayControlsInput) {
  const activeGamepadIndexRef = useRef<number | null>(null)
  const previousInputRef = useRef(
    resolveGamepadOverlayInput(readGamepads(), activeGamepadIndexRef.current),
  )
  const [gamepadStatus, setGamepadStatus] = useState(() =>
    resolveGamepadStatus(readGamepads(), activeGamepadIndexRef.current),
  )

  useEffect(() => {
    let animationFrame = 0

    function syncGamepadOverlayInput() {
      const gamepads = readGamepads()
      const activeGamepad = resolveActiveGamepad(gamepads, activeGamepadIndexRef.current)
      activeGamepadIndexRef.current = activeGamepad?.index ?? null
      const nextStatus = resolveGamepadStatus(gamepads, activeGamepadIndexRef.current)
      const input = resolveGamepadOverlayInput(gamepads, activeGamepadIndexRef.current)
      const confirmPressed = input.confirm && !previousInputRef.current.confirm
      const pausePressed = input.pause && !previousInputRef.current.pause

      setGamepadStatus((currentStatus) =>
        areGamepadStatusesEqual(currentStatus, nextStatus) ? currentStatus : nextStatus,
      )

      if (status === "running" && pausePressed) {
        onPause()
      } else if (status === "paused" && (confirmPressed || pausePressed)) {
        onResume()
      } else if (status === "ready" && confirmPressed) {
        onStart()
      } else if (status === "ended" && confirmPressed) {
        onRestart()
      }

      previousInputRef.current = input
      animationFrame = window.requestAnimationFrame(syncGamepadOverlayInput)
    }

    animationFrame = window.requestAnimationFrame(syncGamepadOverlayInput)

    function handleGamepadConnected(event: GamepadEvent) {
      activeGamepadIndexRef.current = event.gamepad.index
      setGamepadStatus(resolveGamepadStatus(readGamepads(), event.gamepad.index))
    }

    function handleGamepadDisconnected(event: GamepadEvent) {
      if (activeGamepadIndexRef.current === event.gamepad.index) {
        activeGamepadIndexRef.current = null
      }

      setGamepadStatus(resolveGamepadStatus(readGamepads(), activeGamepadIndexRef.current))
    }

    window.addEventListener("gamepadconnected", handleGamepadConnected)
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected)

    return () => {
      window.removeEventListener("gamepadconnected", handleGamepadConnected)
      window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [onPause, onRestart, onResume, onStart, status])

  return gamepadStatus
}
