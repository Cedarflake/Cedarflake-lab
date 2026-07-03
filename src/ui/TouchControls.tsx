import { useEffect, useState } from "react"
import type { PointerEvent } from "react"

import { pulseHaptics } from "@/game/haptics"
import { useGameStore } from "@/game/useGameStore"
import { useInputStore } from "@/game/useInputStore"
import type { PlayerInput } from "@/shared/types"

import "./TouchControls.css"

type InputPatch = Partial<PlayerInput>

interface ControlButtonProps {
  label: string
  press: InputPatch
  release: InputPatch
  className?: string
}

function ControlButton({ label, press, release, className }: ControlButtonProps) {
  const setTouchInput = useInputStore((state) => state.setTouchInput)
  const [isPressed, setIsPressed] = useState(false)
  const buttonClassName = [className, isPressed ? "touch-controls__button--pressed" : ""]
    .filter(Boolean)
    .join(" ")

  function handlePress(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPressed(true)
    pulseHaptics(10)
    setTouchInput(press)
  }

  function handleRelease(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsPressed(false)
    setTouchInput(release)
  }

  return (
    <button
      type="button"
      className={buttonClassName || undefined}
      aria-label={label}
      onPointerDown={handlePress}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onPointerLeave={handleRelease}
    >
      {label}
    </button>
  )
}

export function TouchControls() {
  const status = useGameStore((state) => state.status)
  const resetTouchInput = useInputStore((state) => state.resetTouchInput)

  useEffect(() => {
    if (status !== "running") {
      resetTouchInput()

      return
    }

    return resetTouchInput
  }, [resetTouchInput, status])

  if (status !== "running") {
    return null
  }

  return (
    <section className="touch-controls" aria-label="Touch driving controls">
      <div className="touch-controls__steer">
        <ControlButton label="Left" press={{ steer: -1 }} release={{ steer: 0 }} />
        <ControlButton label="Right" press={{ steer: 1 }} release={{ steer: 0 }} />
      </div>
      <div className="touch-controls__drive">
        <ControlButton
          label="Drift"
          press={{ isDrifting: true }}
          release={{ isDrifting: false }}
          className="touch-controls__drift"
        />
        <ControlButton label="Brake" press={{ brake: 1 }} release={{ brake: 0 }} />
        <ControlButton
          label="Go"
          press={{ throttle: 1 }}
          release={{ throttle: 0 }}
          className="touch-controls__go"
        />
      </div>
    </section>
  )
}
