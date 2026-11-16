import type { CSSProperties, ReactNode } from 'react'

interface RangeFieldProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Valor formatado exibido ao lado do rótulo (ex.: "×1,60 (+60%)"). */
  display: string
  onChange: (value: number) => void
  hint?: ReactNode
  /** Slot categórico do swatch que identifica a série controlada. */
  swatch?: number
  disabled?: boolean
}

export function RangeField({ id, label, value, min, max, step, display, onChange, hint, swatch, disabled }: RangeFieldProps) {
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <div className="range-field">
      <div className="range-head">
        <label htmlFor={id}>
          {swatch !== undefined && <i className={`swatch slot-${swatch}`} aria-hidden="true" />}
          {label}
        </label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--fill': fill } as CSSProperties}
      />
      {hint && <div className="range-hint">{hint}</div>}
    </div>
  )
}
