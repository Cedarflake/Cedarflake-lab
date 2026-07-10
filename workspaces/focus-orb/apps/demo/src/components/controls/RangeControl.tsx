import { type ChangeEvent, useId } from "react"

interface RangeControlProps {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}

export function RangeControl({ label, max, min, onChange, step, value }: RangeControlProps) {
  const id = useId()
  const precision = step >= 1 ? 0 : step < 0.001 ? 4 : step < 0.01 ? 3 : 2

  return (
    <label className="control" htmlFor={id}>
      <span className="control__row">
        <span className="control__label">{label}</span>
        <span className="control__value">{value.toFixed(precision)}</span>
      </span>
      <input
        id={id}
        max={max}
        min={min}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(Number(event.currentTarget.value))
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}
