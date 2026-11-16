import type { PipelineJob, StageInfo, StageName } from '../api/types'
import { formatNumber, formatSeconds, formatTime } from '../lib/format'
import { describeStage, STAGE_LABELS } from '../lib/stages'
import { ErrorMessage } from './ErrorMessage'
import { StatusIcon } from './StatusIcon'

interface PipelinePanelProps {
  stages: StageInfo[] | undefined
  loadError: Error | null
  job: PipelineJob | null
  runningStage: StageName | null
  /** Alguma execução em andamento: a API aceita uma por vez. */
  locked: boolean
  error: Error | null
  onDismissError: () => void
  onRunStage: (stage: StageName) => void
  onRunPipeline: () => void
}

export function PipelinePanel(props: PipelinePanelProps) {
  const { stages, loadError, job, runningStage, locked, error } = props

  return (
    <section className="card" aria-labelledby="pipeline-title">
      <header className="card-header">
        <div>
          <p className="eyebrow">Orquestração</p>
          <h2 id="pipeline-title">Pipeline</h2>
        </div>
        <button type="button" className="primary" onClick={props.onRunPipeline} disabled={locked}>
          Executar pipeline completo
        </button>
      </header>

      {job && <JobStatus job={job} />}
      {error && <ErrorMessage error={error} onDismiss={props.onDismissError} />}
      {loadError && !stages && <ErrorMessage error={loadError} />}

      {stages && (
        <ol className="stepper" aria-label="Etapas do pipeline">
          {stages.map((stage) => {
            const view = describeStage(stage, runningStage)
            const label = STAGE_LABELS[stage.name]
            return (
              <li key={stage.name} className={`step tone-${view.tone}`}>
                <StatusIcon tone={view.tone} fallback={stage.order} />
                <div className="step-body">
                  <div className="step-head">
                    <span className="step-title">{label}</span>
                    <span className="step-status">{view.status}</span>
                  </div>
                  <p className="step-description">{stage.description}</p>
                  {view.detail && <p className="step-detail">{view.detail}</p>}
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => props.onRunStage(stage.name)}
                  disabled={locked || !stage.ready}
                  aria-label={`Executar etapa ${label}`}
                >
                  Executar
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function JobStatus({ job }: { job: PipelineJob }) {
  if (job.status === 'running') {
    return (
      <div className="job-status" role="status">
        <StatusIcon tone="running" />
        <div>
          <p className="job-title">Pipeline completo em execução</p>
          <p className="muted small">Iniciado às {formatTime(job.started_at)} · registrando a run no MLflow</p>
        </div>
      </div>
    )
  }
  if (job.status === 'failed') {
    return (
      <div className="job-status" role="status">
        <StatusIcon tone="critical" />
        <div>
          <p className="job-title">Pipeline falhou</p>
          <p className="muted small">{job.error}</p>
        </div>
      </div>
    )
  }
  const summary = job.result
  return (
    <div className="job-status" role="status">
      <StatusIcon tone="good" />
      <div>
        <p className="job-title">
          Pipeline concluído{job.duration_seconds !== null && ` em ${formatSeconds(job.duration_seconds)}`}
        </p>
        {summary && (
          <p className="muted small">
            ROC-AUC {formatNumber(summary.roc_auc_holdout, 3)} → {formatNumber(summary.roc_auc_production, 3)} ·{' '}
            {summary.drift_critical_alerts} alerta(s) crítico(s) · run MLflow <code>{summary.run_id.slice(0, 8)}</code>
          </p>
        )}
      </div>
    </div>
  )
}
