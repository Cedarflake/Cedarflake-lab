import { useEffect, useRef } from "react"

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

function resolveAxis(value: number | undefined, deadzone = 0.16) {
  if (!value || Math.abs(value) < deadzone) return 0

  return value
}

function resolveButton(button: GamepadButton | undefined) {
  if (!button) return 0

  return button.pressed ? 1 : button.value
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

function resolveGamepadInput(gamepads: readonly (Gamepad | null)[]): PlayerInput {
  const gamepad = gamepads.find((item) => item?.connected)

  if (!gamepad) {
    return {
      steer: 0,
      throttle: 0,
      brake: 0,
      isDrifting: false,
    }
  }

  const leftStickX = resolveAxis(gamepad.axes[0])
  const steerLeft = resolveButton(gamepad.buttons[14])
  const steerRight = resolveButton(gamepad.buttons[15])
  const throttle = Math.max(resolveButton(gamepad.buttons[7]), resolveButton(gamepad.buttons[0]))
  const brake = Math.max(resolveButton(gamepad.buttons[6]), resolveButton(gamepad.buttons[1]))

  return {
    steer: leftStickX || steerRight - steerLeft,
    throttle,
    brake,
    isDrifting: resolveButton(gamepad.buttons[4]) > 0 || resolveButton(gamepad.buttons[5]) > 0,
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

    function updateInput() {
      setKeyboardInput(resolveKeyboardInput(keysRef.current))
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()

      if (useGameStore.getState().status === "running" && drivingKeys.has(key)) {
        event.preventDefault()
      }

      keysRef.current.add(key)
      updateInput()
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase()

      if (useGameStore.getState().status === "running" && drivingKeys.has(key)) {
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
        const gamepads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : []

        setGamepadInput(resolveGamepadInput(gamepads))
      } else {
        resetGamepadInput()
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
