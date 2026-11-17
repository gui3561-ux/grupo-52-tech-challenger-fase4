import { formatNumber, formatPercent, formatPoints, formatTime } from '../lib/format'
import type { DetectionSnapshot, Tone } from '../lib/stages'
import { ErrorMessage } from './ErrorMessage'
import { StatusIcon } from './StatusIcon'

interface DetectionSummaryProps {
  snapshot: DetectionSnapshot | null
  locked: boolean
  error: Error | null
  onDismissError: () => void
  onDetect: () => void
}

/** Linha de indicadores da última detecção: Data Drift (PSI) e Concept Drift (desempenho). */
export function DetectionSummary({ snapshot, locked, error, onDismissError, onDetect }: DetectionSummaryProps) {
  return (
    <section className="card" aria-labelledby="detection-title">
      <header className="card-header">
        <div>
          <p className="eyebrow">Diagnóstico</p>
          <h2 id="detection-title">Data drift e concept drift</h2>
        </div>
        <div className="header-actions">
          {snapshot && (
            <span className="muted small">
              {snapshot.stale && (
                <span className="badge tone-warning">
                  <StatusIcon tone="warning" /> Desatualizado
                </span>
              )}{' '}
              Detecção das {formatTime(snapshot.finishedAt)}
            </span>
          )}
          <button type="button" className="secondary" onClick={onDetect} disabled={locked}>
            Detectar drift
          </button>
        </div>
      </header>

      {error && <ErrorMessage error={error} onDismiss={onDismissError} />}
      {snapshot ? (
        <KpiRow snapshot={snapshot} />
      ) : (
        <p className="empty-state">
          Nenhuma detecção ainda. Rode o pipeline completo, aplique uma simulação ou clique em <strong>Detectar drift</strong>.
        </p>
      )}
      {snapshot?.stale && (
        <p className="muted small">
          A referência, o modelo ou a produção mudaram depois desta detecção: os indicadores abaixo não refletem os dados atuais.
        </p>
      )}
    </section>
  )
}

function KpiRow({ snapshot }: { snapshot: DetectionSnapshot }) {
  const { features, data_drift: dataDrift, concept_drift: concept, thresholds } = snapshot.result
  const critical = dataDrift.critical_features
  return (
    <dl className={`kpi-row${snapshot.stale ? ' is-stale' : ''}`}>
      <StatTile
        label="Features com drift crítico"
        value={`${critical.length} de ${features.length}`}
        status={dataDrift.detected ? { tone: 'critical', text: 'Drift detectado' } : { tone: 'good', text: 'Estável' }}
        note={critical.length > 0 ? critical.join(', ') : `Nenhuma com PSI ≥ ${formatNumber(thresholds.psi_critical, 2)}`}
      />
      <StatTile
        label="ROC-AUC em produção"
        value={formatNumber(concept.production.roc_auc, 3)}
        delta={{
          text: `${arrow(-concept.roc_auc_drop)} ${formatNumber(Math.abs(concept.roc_auc_drop), 3)} vs. produção-base ${formatNumber(concept.reference.roc_auc, 3)}`,
          bad: concept.roc_auc_drop > 0,
        }}
      />
      <StatTile
        label="Acurácia em produção"
        value={formatPercent(concept.production.accuracy)}
        delta={{
          text: `${arrow(-concept.accuracy_drop)} ${formatPoints(Math.abs(concept.accuracy_drop), 1, false)} vs. produção-base ${formatPercent(concept.reference.accuracy)}`,
          bad: concept.accuracy_drop > 0,
        }}
      />
      <StatTile
        label="Alerta de desempenho"
        value={concept.degraded ? 'Degradado' : 'Dentro do limite'}
        status={concept.degraded ? { tone: 'critical', text: 'Concept drift' } : { tone: 'good', text: 'OK' }}
        note={`Dispara com queda de ROC-AUC ≥ ${formatNumber(thresholds.roc_auc_drop_alert, 2)} vs. produção-base`}
      />
    </dl>
  )
}

interface StatTileProps {
  label: string
  value: string
  delta?: { text: string; bad: boolean }
  status?: { tone: Tone; text: string }
  note?: string
}

function StatTile({ label, value, delta, status, note }: StatTileProps) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <span className="stat-value">{value}</span>
        {status && (
          <span className="stat-status">
            <StatusIcon tone={status.tone} /> {status.text}
          </span>
        )}
        {delta && <span className={`stat-delta${delta.bad ? ' is-bad' : ''}`}>{delta.text}</span>}
        {note && <span className="stat-note">{note}</span>}
      </dd>
    </div>
  )
}

/** Seta da direção da variação (a cor do delta diz se ela é boa ou ruim). */
function arrow(change: number): string {
  if (change === 0) return '='
  return change > 0 ? '▲' : '▼'
}
