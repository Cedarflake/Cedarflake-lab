import { type MouseEvent as ReactMouseEvent } from "react"
import { ChevronDown, RotateCcw } from "lucide-react"

interface ControlSummaryProps {
  label: string
  onReset: () => void
  resetLabel: string
}

export function ControlSummary({ label, onReset, resetLabel }: ControlSummaryProps) {
  function resetWithoutToggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onReset()
  }

  return (
    <summary>
      <span>{label}</span>
      <span className="control-disclosure__actions">
        <button
          aria-label={resetLabel}
          className="summary-reset-button"
          onClick={resetWithoutToggle}
          title={resetLabel}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="summary-reset-button__icon" />
        </button>
        <ChevronDown aria-hidden="true" className="control-disclosure__icon" />
      </span>
    </summary>
  )
}
