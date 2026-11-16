import { formatPercent } from '../lib/format'

export interface Segment {
  key: string
  label: string
  /** Proporção (0–1). */
  value: number
  slot: number
}

interface SegmentedBarProps {
  /** Nome acessível do todo (ex.: "Antes da simulação"). */
  title: string
  segments: Segment[]
  /** `tall` imprime a fatia dentro do bloco quando cabe; `thin` é só a forma (8px). */
  variant?: 'tall' | 'thin'
}

// Abaixo desta fatia o rótulo não cabe com folga no bloco: o valor fica no tooltip e na tabela.
const MIN_LABELED_SHARE = 0.12

/** Um todo dividido em partes; largura proporcional e 2px de superfície entre os blocos. */
export function SegmentedBar({ title, segments, variant = 'tall' }: SegmentedBarProps) {
  const visible = segments.filter((segment) => segment.value > 0)
  const description = segments.map((segment) => `${segment.label} ${formatPercent(segment.value)}`).join(', ')
  return (
    <div className={`segbar segbar-${variant}`} role="img" aria-label={`${title}: ${description}`}>
      {visible.map((segment) => (
        <span key={segment.key} className={`segbar-part slot-${segment.slot}`} style={{ flexGrow: segment.value }}>
          {variant === 'tall' && segment.value >= MIN_LABELED_SHARE && (
            <span className="segbar-label">{formatPercent(segment.value, 0)}</span>
          )}
          <span className="tooltip" aria-hidden="true">
            <strong>{formatPercent(segment.value)}</strong>
            <span>{segment.label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

export function SegmentLegend({ segments }: { segments: Segment[] }) {
  return (
    <ul className="legend" aria-label="Legenda">
      {segments.map((segment) => (
        <li key={segment.key}>
          <i className={`swatch slot-${segment.slot}`} aria-hidden="true" />
          {segment.label}
        </li>
      ))}
    </ul>
  )
}
