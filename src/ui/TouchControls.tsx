import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"

import { pulseHaptics } from "@/game/haptics"
import { resolveTouchInput } from "@/game/touchInput"
import type { TouchControlId } from "@/game/touchInput"
import { useGameStore } from "@/game/useGameStore"
import { useInputStore } from "@/game/useInputStore"

interface ControlButtonProps {
  label: string
  controlId: TouchControlId
  onActiveChange: (controlId: TouchControlId, isActive: boolean) => void
  className?: string
}

function ControlButton({ label, controlId, onActiveChange, className }: ControlButtonProps) {
  const activePointersRef = useRef<Set<number>>(new Set())
  const [isPressed, setIsPressed] = useState(false)
  const buttonClassName = [className, isPressed ? "touch-controls__button--pressed" : ""]
    .filter(Boolean)
    .join(" ")

  function handlePress(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pulseHaptics(10)

    const wasPressed = activePointersRef.current.size > 0
    activePointersRef.current.add(event.pointerId)
    setIsPressed(true)

    if (!wasPressed) {
      onActiveChange(controlId, true)
    }
  }

  function handleRelease(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    activePointersRef.current.delete(event.pointerId)

    if (activePointersRef.current.size === 0) {
      setIsPressed(false)
      onActiveChange(controlId, false)
    }
  }

  return (
    <button
      type="button"
      className={buttonClassName || undefined}
      aria-label={label}
      aria-pressed={isPressed}
      onPointerDown={handlePress}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onLostPointerCapture={handleRelease}
    >
      {label}
    </button>
  )
}

export function TouchControls() {
  const status = useGameStore((state) => state.status)
  const setTouchInput = useInputStore((state) => state.setTouchInput)
  const resetTouchInput = useInputStore((state) => state.resetTouchInput)
  const activeControlsRef = useRef<Set<TouchControlId>>(new Set())

  const handleActiveChange = useCallback(
    (controlId: TouchControlId, isActive: boolean) => {
      if (isActive) {
        activeControlsRef.current.add(controlId)
      } else {
        activeControlsRef.current.delete(controlId)
      }

      setTouchInput(resolveTouchInput(activeControlsRef.current))
    },
    [setTouchInput],
  )

  const resetActiveControls = useCallback(() => {
    activeControlsRef.current.clear()
    resetTouchInput()
  }, [resetTouchInput])

  useEffect(() => {
    if (status !== "running") {
      resetActiveControls()

      return
    }

    return resetActiveControls
  }, [resetActiveControls, status])

  if (status !== "running") {
    return null
  }

  return (
    <section className="touch-controls" aria-label="Touch driving controls">
      <div className="touch-controls__steer">
        <ControlButton label="Left" controlId="left" onActiveChange={handleActiveChange} />
        <ControlButton label="Right" controlId="right" onActiveChange={handleActiveChange} />
      </div>
      <div className="touch-controls__drive">
        <ControlButton
          label="Drift"
          controlId="drift"
          onActiveChange={handleActiveChange}
          className="touch-controls__drift"
        />
        <ControlButton label="Brake" controlId="brake" onActiveChange={handleActiveChange} />
        <ControlButton
          label="Go"
          controlId="go"
          onActiveChange={handleActiveChange}
          className="touch-controls__go"
        />
      </div>
    </section>
  )
}
