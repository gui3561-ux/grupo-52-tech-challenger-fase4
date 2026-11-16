import type { FeatureDistribution } from '../api/types'
import { largestShift, VERDICT_VIEW } from '../lib/drift'
import { formatNumber, formatPercent, formatPoints } from '../lib/format'
import { niceScale } from '../lib/scale'
import { AxisTicks, Gridlines } from './AxisTicks'
import { StatusIcon } from './StatusIcon'

interface DistributionChartProps {
  distribution: FeatureDistribution
}

/**
 * Barras horizontais agrupadas (Referência × Produção) por faixa ou categoria, na mesma
 * discretização do PSI. Horizontal porque os rótulos das faixas numéricas são longos.
 */
export function DistributionChart({ distribution }: DistributionChartProps) {
  const { bins } = distribution
  const scale = niceScale(0, Math.max(...bins.flatMap((bin) => [bin.reference, bin.production]), 0.01))
  const percent = (value: number) => `${(value / scale.max) * 100}%`
  const peak = largestShift(bins)
  const verdict = VERDICT_VIEW[distribution.psi_verdict]
  const unit = distribution.type === 'numeric' ? 'faixa (quantis da referência)' : 'categoria'

  return (
    <figure className="chart-figure hbar-chart distribution-chart">
      <figcaption className="chart-caption">
        <span className="chart-title">
          Distribuição de {distribution.feature}
          <span className="title-meta">
            PSI {formatNumber(distribution.psi, 2)} · <StatusIcon tone={verdict.tone} /> {verdict.label}
          </span>
        </span>
        <span className="muted small">Proporção dos registros por {unit} · rótulos na maior mudança</span>
      </figcaption>

      <ul className="legend" aria-label="Legenda">
        <li>
          <i className="swatch slot-1" aria-hidden="true" />
          Referência (treino)
        </li>
        <li>
          <i className="swatch slot-2" aria-hidden="true" />
          Produção (com drift)
        </li>
      </ul>

      <div className="hbar">
        <div className="hbar-overlay" aria-hidden="true">
          <Gridlines ticks={scale.ticks} max={scale.max} />
        </div>
        {bins.map((bin, index) => {
          const delta = bin.production - bin.reference
          const description = `${bin.label}: referência ${formatPercent(bin.reference)}, produção ${formatPercent(bin.production)}, ${formatPoints(delta)}`
          return (
            <div key={bin.label} className="hbar-row" tabIndex={0} aria-label={description}>
              <span className="hbar-label">{bin.label}</span>
              <span className="hbar-track grouped">
                <span className="bar series-1" style={{ width: percent(bin.reference) }}>
                  {index === peak && <span className="bar-value">{formatPercent(bin.reference)}</span>}
                </span>
                <span className="bar series-2" style={{ width: percent(bin.production) }}>
                  {index === peak && <span className="bar-value">{formatPercent(bin.production)}</span>}
                </span>
                <span className="tooltip" style={{ left: percent(Math.max(bin.reference, bin.production)) }} aria-hidden="true">
                  <strong>{formatPoints(delta)}</strong>
                  <span>
                    <i className="line-key slot-1" /> Referência {formatPercent(bin.reference)}
                  </span>
                  <span>
                    <i className="line-key slot-2" /> Produção {formatPercent(bin.production)}
                  </span>
                </span>
              </span>
              <span />
            </div>
          )
        })}
      </div>
      <AxisTicks ticks={scale.ticks} max={scale.max} format={(tick) => formatPercent(tick, Math.max(0, scale.decimals - 2))} />

      <details className="table-view">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{distribution.type === 'numeric' ? 'Faixa' : 'Categoria'}</th>
              <th scope="col">Referência</th>
              <th scope="col">Produção</th>
              <th scope="col">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.label}>
                <td>{bin.label}</td>
                <td>{formatPercent(bin.reference)}</td>
                <td>{formatPercent(bin.production)}</td>
                <td>{formatPoints(bin.production - bin.reference)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
