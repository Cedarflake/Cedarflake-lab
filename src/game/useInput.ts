import { useEffect, useRef } from "react"

import { useInputStore } from "@/game/useInputStore"
import type { PlayerInput } from "@/shared/types"

const keyboardListenerOptions = { capture: true } as const

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
    const { resetKeyboardInput, resetTouchInput, setKeyboardInput } = useInputStore.getState()

    function updateInput() {
      setKeyboardInput(resolveKeyboardInput(keysRef.current))
    }

    function handleKeyDown(event: KeyboardEvent) {
      keysRef.current.add(event.key.toLowerCase())
      updateInput()
    }

    function handleKeyUp(event: KeyboardEvent) {
      keysRef.current.delete(event.key.toLowerCase())
      updateInput()
    }

    function resetInput() {
      keysRef.current.clear()
      resetKeyboardInput()
      resetTouchInput()
    }

    function resetWhenHidden() {
      if (document.visibilityState === "hidden") {
        resetInput()
      }
    }

    document.addEventListener("keydown", handleKeyDown, keyboardListenerOptions)
    document.addEventListener("keyup", handleKeyUp, keyboardListenerOptions)
    document.addEventListener("visibilitychange", resetWhenHidden)
    window.addEventListener("keydown", handleKeyDown, keyboardListenerOptions)
    window.addEventListener("keyup", handleKeyUp, keyboardListenerOptions)
    window.addEventListener("blur", resetInput)

    return () => {
      document.removeEventListener("keydown", handleKeyDown, keyboardListenerOptions)
      document.removeEventListener("keyup", handleKeyUp, keyboardListenerOptions)
      document.removeEventListener("visibilitychange", resetWhenHidden)
      window.removeEventListener("keydown", handleKeyDown, keyboardListenerOptions)
      window.removeEventListener("keyup", handleKeyUp, keyboardListenerOptions)
      window.removeEventListener("blur", resetInput)
    }
  }, [])
}
