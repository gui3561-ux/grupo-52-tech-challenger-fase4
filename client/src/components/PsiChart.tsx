import type { FeatureDistribution, FeatureDrift, FeatureName } from '../api/types'
import { PSI_THRESHOLDS, VERDICT_VIEW } from '../lib/drift'
import { formatNumber } from '../lib/format'
import { niceScale } from '../lib/scale'
import { AxisTicks, Gridlines } from './AxisTicks'
import { StatusIcon } from './StatusIcon'

interface PsiChartProps {
  distributions: FeatureDistribution[]
  selected: FeatureName
  onSelect: (feature: FeatureName) => void
  /** Estatísticas KS da última detecção (só quando ela reflete os dados atuais). */
  ks: Map<FeatureName, FeatureDrift> | null
}

/** Barras horizontais ranqueadas: magnitude do PSI em um único tom, limiares como referência. */
export function PsiChart({ distributions, selected, onSelect, ks }: PsiChartProps) {
  const ranked = [...distributions].sort((a, b) => b.psi - a.psi)
  // O domínio sempre inclui o limiar crítico, para a régua de 0,25 aparecer mesmo sem drift.
  const scale = niceScale(0, Math.max(ranked[0]?.psi ?? 0, PSI_THRESHOLDS.critical * 1.2))
  const percent = (value: number) => `${(Math.min(value, scale.max) / scale.max) * 100}%`
  // As réguas ficam próximas quando a escala é larga (ex.: PSI 1,08): em vez de rótulos sobre
  // as linhas, que colidiriam, cada uma tem um traço próprio explicado na legenda.
  const thresholds = [
    { key: 'moderate', value: PSI_THRESHOLDS.moderate, label: `PSI ${formatNumber(PSI_THRESHOLDS.moderate, 2)} · moderado` },
    { key: 'critical', value: PSI_THRESHOLDS.critical, label: `PSI ${formatNumber(PSI_THRESHOLDS.critical, 2)} · crítico` },
  ]

  return (
    <figure className="chart-figure hbar-chart psi-chart">
      <figcaption className="chart-caption">
        <span className="chart-title">Estabilidade por feature (PSI)</span>
        <span className="muted small">Referência × Produção, do maior desvio para o menor · selecione para ver a distribuição</span>
      </figcaption>

      <ul className="legend" aria-label="Limiares">
        {thresholds.map((threshold) => (
          <li key={threshold.key}>
            <i className={`threshold-key threshold-${threshold.key}`} aria-hidden="true" />
            {threshold.label}
          </li>
        ))}
      </ul>

      <div className="hbar">
        <div className="hbar-overlay" aria-hidden="true">
          <Gridlines ticks={scale.ticks} max={scale.max} />
          {thresholds.map((threshold) => (
            <span key={threshold.key} className={`threshold threshold-${threshold.key}`} style={{ left: percent(threshold.value) }} />
          ))}
        </div>

        {ranked.map((item) => {
          const verdict = VERDICT_VIEW[item.psi_verdict]
          const stats = ks?.get(item.feature)
          return (
            <button
              key={item.feature}
              type="button"
              className="hbar-row"
              aria-pressed={selected === item.feature}
              onClick={() => onSelect(item.feature)}
              aria-label={`${item.feature}: PSI ${formatNumber(item.psi, 3)}, ${verdict.label}`}
            >
              <span className="hbar-label">{item.feature}</span>
              <span className="hbar-track">
                <span className="bar series-1" style={{ width: percent(item.psi) }} />
                <span className="tooltip" style={{ left: percent(item.psi) }} aria-hidden="true">
                  <strong>PSI {formatNumber(item.psi, 3)}</strong>
                  <span>{verdict.label}</span>
                  {stats?.ks_pvalue != null && <span>KS p-valor {formatPValue(stats.ks_pvalue)}</span>}
                </span>
              </span>
              <span className="hbar-tail">
                <span className="value">{formatNumber(item.psi, 2)}</span>
                <span className="verdict">
                  <StatusIcon tone={verdict.tone} />
                  {verdict.label}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <AxisTicks ticks={scale.ticks} max={scale.max} format={(tick) => formatNumber(tick, scale.decimals)} />

      <details className="table-view">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Tipo</th>
              <th scope="col">PSI</th>
              <th scope="col">Veredito</th>
              <th scope="col">KS p-valor</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item) => {
              const pvalue = ks?.get(item.feature)?.ks_pvalue
              return (
                <tr key={item.feature}>
                  <td>{item.feature}</td>
                  <td>{item.type === 'numeric' ? 'numérica' : 'categórica'}</td>
                  <td>{formatNumber(item.psi, 4)}</td>
                  <td>{VERDICT_VIEW[item.psi_verdict].label}</td>
                  <td>{pvalue == null ? '—' : formatPValue(pvalue)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function formatPValue(value: number): string {
  return value < 0.001 ? '< 0,001' : formatNumber(value, 3)
}
