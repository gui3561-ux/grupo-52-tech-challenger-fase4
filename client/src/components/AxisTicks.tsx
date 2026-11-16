interface AxisTicksProps {
  ticks: number[]
  max: number
  format: (value: number) => string
}

/** Linha de marcas do eixo x, alinhada à coluna das barras de um gráfico `.hbar`. */
export function AxisTicks({ ticks, max, format }: AxisTicksProps) {
  return (
    <div className="hbar-axis" aria-hidden="true">
      <span />
      <span className="hbar-axis-track">
        {ticks.map((tick) => (
          <span key={tick} className="tick" style={{ left: `${(tick / max) * 100}%` }}>
            {format(tick)}
          </span>
        ))}
      </span>
      <span />
    </div>
  )
}

/** Linhas de grade verticais (hairline sólida) sobre a coluna das barras. */
export function Gridlines({ ticks, max }: { ticks: number[]; max: number }) {
  return (
    <>
      {ticks.map((tick) => (
        <span key={tick} className="gridline" style={{ left: `${(tick / max) * 100}%` }} />
      ))}
    </>
  )
}
