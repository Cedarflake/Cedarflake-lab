import { useEffect, useRef } from "react"

import { resolveGamepadInput } from "@/game/gamepadInput"
import { useGameStore } from "@/game/useGameStore"
import { useInputStore } from "@/game/useInputStore"
import type { PlayerInput } from "@/shared/types"

const keyboardListenerOptions = { capture: true } as const
const drivingKeys = new Set([
  " ",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowup",
  "a",
  "d",
  "s",
  "shift",
  "w",
])
const keyboardCodeMap = new Map([
  ["ArrowDown", "arrowdown"],
  ["ArrowLeft", "arrowleft"],
  ["ArrowRight", "arrowright"],
  ["ArrowUp", "arrowup"],
  ["KeyA", "a"],
  ["KeyD", "d"],
  ["KeyS", "s"],
  ["KeyW", "w"],
  ["ShiftLeft", "shift"],
  ["ShiftRight", "shift"],
  ["Space", " "],
])

function resolveKeyboardKey(event: KeyboardEvent) {
  return keyboardCodeMap.get(event.code) ?? event.key.toLowerCase()
}

function resolveKeyboardInput(keys: Set<string>): PlayerInput {
  const steerLeft = keys.has("arrowleft") || keys.has("a")
  const steerRight = keys.has("arrowright") || keys.has("d")
  const throttle = keys.has("arrowup") || keys.has("w")
  const brake = keys.has("arrowdown") || keys.has("s")

  return {
    steer: Number(steerRight) - Number(steerLeft),
    throttle: Number(throttle),
    brake: Number(brake),
    isDrifting: keys.has(" ") || keys.has("shift"),
  }
}

export function useKeyboardInput() {
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const {
      resetGamepadInput,
      resetKeyboardInput,
      resetTouchInput,
      setGamepadInput,
      setKeyboardInput,
    } = useInputStore.getState()
    let animationFrame = 0
    let wasRunning = false

    function updateInput() {
      setKeyboardInput(resolveKeyboardInput(keysRef.current))
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = resolveKeyboardKey(event)

      if (!drivingKeys.has(key)) {
        return
      }

      if (useGameStore.getState().status !== "running") {
        return
      }

      event.preventDefault()
      keysRef.current.add(key)
      updateInput()
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = resolveKeyboardKey(event)

      if (!drivingKeys.has(key)) {
        return
      }

      if (useGameStore.getState().status === "running") {
        event.preventDefault()
      }

      keysRef.current.delete(key)
      updateInput()
    }

    function resetInput() {
      keysRef.current.clear()
      resetGamepadInput()
      resetKeyboardInput()
      resetTouchInput()
    }

    function resetWhenHidden() {
      if (document.visibilityState === "hidden") {
        resetInput()
      }
    }

    function syncGamepadInput() {
      if (useGameStore.getState().status === "running") {
        wasRunning = true
        const gamepads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : []

        setGamepadInput(resolveGamepadInput(gamepads))
      } else if (wasRunning) {
        wasRunning = false
        resetInput()
      }

      animationFrame = window.requestAnimationFrame(syncGamepadInput)
    }

    document.addEventListener("visibilitychange", resetWhenHidden)
    window.addEventListener("keydown", handleKeyDown, keyboardListenerOptions)
    window.addEventListener("keyup", handleKeyUp, keyboardListenerOptions)
    window.addEventListener("blur", resetInput)
    animationFrame = window.requestAnimationFrame(syncGamepadInput)

    return () => {
      document.removeEventListener("visibilitychange", resetWhenHidden)
      window.removeEventListener("keydown", handleKeyDown, keyboardListenerOptions)
      window.removeEventListener("keyup", handleKeyUp, keyboardListenerOptions)
      window.removeEventListener("blur", resetInput)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [])
}
