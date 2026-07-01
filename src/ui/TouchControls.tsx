import type { PointerEvent } from "react"

import { useInputStore } from "@/game/useInputStore"
import type { PlayerInput } from "@/shared/types"

type InputPatch = Partial<PlayerInput>

interface ControlButtonProps {
  label: string
  press: InputPatch
  release: InputPatch
  className?: string
}

function ControlButton({ label, press, release, className }: ControlButtonProps) {
  const setInput = useInputStore((state) => state.setInput)

  function handlePress(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setInput(press)
  }

  function handleRelease(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setInput(release)
  }

  return (
    <button
      type="button"
      className={className}
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
