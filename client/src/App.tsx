import { useCallback, useEffect, useRef, useState } from 'react'
import {
  API_DOCS_URL,
  ApiError,
  detectDrift,
  getDistributions,
  getHealth,
  getPipelineRun,
  getStages,
  listPipelineRuns,
  runStage,
  simulateDrift,
  startPipeline,
} from './api/client'
import type {
  DriftSimulationResult,
  FeatureDistribution,
  FeatureDrift,
  FeatureName,
  HealthResponse,
  PipelineJob,
  StageName,
} from './api/types'
import { DetectionSummary } from './components/DetectionSummary'
import { DistributionChart } from './components/DistributionChart'
import { ErrorMessage } from './components/ErrorMessage'
import { PipelinePanel } from './components/PipelinePanel'
import { PsiChart } from './components/PsiChart'
import { ReportPanel } from './components/ReportPanel'
import { SimulationPanel } from './components/SimulationPanel'
import { StatusIcon } from './components/StatusIcon'
import { toParams, type SimulationForm } from './lib/simulation'
import { latestDetection, STAGE_LABELS } from './lib/stages'
import { useAsync, type AsyncState } from './lib/useAsync'

const POLL_INTERVAL_MS = 1000

/** Origem de cada ação: o erro aparece no painel que a disparou. */
type Source = 'pipeline' | 'simulation' | 'detection'

interface Step {
  label: string
  stage?: StageName
  action: () => Promise<unknown>
}

interface Activity {
  source: Source
  label: string
  stage?: StageName
}

export function App() {
  // Toda ação que grava arquivos incrementa a revisão: etapas, distribuições e saúde recarregam.
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const stages = useAsync(getStages, revision)
  const distributions = useAsync(getDistributions, revision)
  const health = useAsync(getHealth, revision)

  const [activity, setActivity] = useState<Activity | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Source, Error>>>({})
  const [job, setJob] = useState<PipelineJob | null>(null)
  const [simulation, setSimulation] = useState<DriftSimulationResult | null>(null)
  const [selectedFeature, setSelectedFeature] = useState<FeatureName | null>(null)
  const handledJobId = useRef<string | null>(null)

  const setError = useCallback((source: Source, error: unknown) => {
    setErrors((current) => ({ ...current, [source]: error instanceof Error ? error : new Error(String(error)) }))
  }, [])
  const clearError = useCallback((source: Source) => {
    setErrors((current) => ({ ...current, [source]: undefined }))
  }, [])

  /** Executa os passos em sequência; para no primeiro erro e recarrega o estado ao final. */
  const run = useCallback(
    async (source: Source, steps: Step[]) => {
      clearError(source)
      try {
        for (const step of steps) {
          setActivity({ source, label: step.label, stage: step.stage })
          await step.action()
        }
      } catch (error) {
        setError(source, error)
      } finally {
        setActivity(null)
        refresh()
      }
    },
    [clearError, setError, refresh],
  )

  // Ao abrir a página, retoma o job mais recente (a API guarda os jobs em memória).
  useEffect(() => {
    listPipelineRuns()
      .then(([latest]) => {
        if (!latest) return
        setJob((current) => current ?? latest)
        if (latest.status !== 'running') handledJobId.current = latest.id
      })
      .catch(() => undefined) // a indisponibilidade da API já aparece no cabeçalho
  }, [])

  // Polling do job em execução; em erro de rede, tenta de novo no próximo ciclo.
  useEffect(() => {
    if (job?.status !== 'running') return
    const timer = window.setTimeout(() => {
      getPipelineRun(job.id)
        .then(setJob)
        .catch((error: unknown) => {
          setError('pipeline', error)
          setJob((current) => (current ? { ...current } : current))
        })
    }, POLL_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [job, setError])

  // Fim do pipeline: a API não expõe a detecção interna do job, então ela é recalculada
  // (mesmos arquivos, mesmo resultado) para todos os painéis refletirem a nova run.
  useEffect(() => {
    if (!job || job.status === 'running' || handledJobId.current === job.id) return
    handledJobId.current = job.id
    if (job.status === 'succeeded') {
      void run('detection', [{ label: 'Atualizando a detecção com a nova run…', stage: 'drift_detection', action: detectDrift }])
    } else {
      refresh()
    }
  }, [job, run, refresh])

  const handleRunPipeline = async () => {
    clearError('pipeline')
    try {
      setJob(await startPipeline())
    } catch (error) {
      setError('pipeline', error)
    }
  }

  const handleRunStage = (stage: StageName) =>
    void run('pipeline', [
      {
        label: `Executando ${STAGE_LABELS[stage]}…`,
        stage,
        action: async () => {
          const execution = await runStage(stage)
          if (stage === 'drift_simulation') setSimulation(execution.result as DriftSimulationResult)
        },
      },
    ])

  // Mesma ordem do pipeline: o lote simulado passa pelo contrato antes da detecção.
  const handleApplySimulation = (form: SimulationForm) =>
    void run('simulation', [
      {
        label: 'Simulando drift…',
        stage: 'drift_simulation',
        action: async () => setSimulation(await simulateDrift(toParams(form))),
      },
      { label: 'Validando o lote no contrato Pandera…', stage: 'production_ingestion_gate', action: () => runStage('production_ingestion_gate') },
      { label: 'Detectando drift…', stage: 'drift_detection', action: detectDrift },
    ])

  const handleDetect = () =>
    void run('detection', [{ label: 'Detectando drift…', stage: 'drift_detection', action: detectDrift }])

  const jobRunning = job?.status === 'running'
  const locked = activity !== null || jobRunning
  const detection = stages.data ? latestDetection(stages.data) : null
  const ks = detection && !detection.stale ? new Map(detection.result.features.map((item) => [item.feature, item])) : null
  const activityText = activity?.label ?? (jobRunning ? 'Pipeline completo em execução…' : '')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Monitor de Drift</h1>
            <p>Credit Scoring · Tech Challenge Fase 4 · Grupo 98</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="activity" aria-live="polite">
            {activityText && (
              <>
                <StatusIcon tone="running" /> {activityText}
              </>
            )}
          </span>
          <ApiStatus health={health} />
          <a className="button-link" href={API_DOCS_URL} target="_blank" rel="noreferrer">
            Swagger <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main className="workspace">
        <div className="controls-column">
          <PipelinePanel
            stages={stages.data}
            loadError={stages.error}
            job={job}
            runningStage={activity?.stage ?? null}
            locked={locked}
            error={errors.pipeline ?? null}
            onDismissError={() => clearError('pipeline')}
            onRunStage={handleRunStage}
            onRunPipeline={handleRunPipeline}
          />
          <SimulationPanel
            locked={locked}
            progress={activity?.source === 'simulation' ? activity.label : null}
            error={errors.simulation ?? null}
            onDismissError={() => clearError('simulation')}
            result={simulation}
            onApply={handleApplySimulation}
          />
        </div>

        <div className="insights-column">
          <DetectionSummary
            snapshot={detection}
            locked={locked}
            error={errors.detection ?? null}
            onDismissError={() => clearError('detection')}
            onDetect={handleDetect}
          />
          <VisualizationCard
            state={distributions}
            selected={selectedFeature}
            onSelect={setSelectedFeature}
            ks={ks}
          />
          <ReportPanel revision={detection?.finishedAt ?? null} />
        </div>
      </main>
    </div>
  )
}

interface VisualizationCardProps {
  state: AsyncState<FeatureDistribution[]>
  selected: FeatureName | null
  onSelect: (feature: FeatureName) => void
  ks: Map<FeatureName, FeatureDrift> | null
}

function VisualizationCard({ state, selected, onSelect, ks }: VisualizationCardProps) {
  const items = state.data ?? []
  // Sem escolha do usuário, abre na feature de maior PSI.
  const current = items.find((item) => item.feature === selected) ?? [...items].sort((a, b) => b.psi - a.psi)[0]
  const missingInputs = state.error instanceof ApiError && state.error.status === 409

  return (
    <section className="card" aria-labelledby="viz-title" aria-busy={state.loading}>
      <header className="card-header">
        <div>
          <p className="eyebrow">Visualização</p>
          <h2 id="viz-title">Referência × Produção</h2>
        </div>
        {current && (
          <div className="inline-field">
            <label htmlFor="feature-select">Feature</label>
            <select id="feature-select" value={current.feature} onChange={(event) => onSelect(event.target.value as FeatureName)}>
              {items.map((item) => (
                <option key={item.feature} value={item.feature}>
                  {item.feature}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {missingInputs && (
        <p className="empty-state">
          Ainda não há Referência e Produção com drift para comparar. Execute as etapas <strong>Split Referência × Produção</strong> e{' '}
          <strong>Simulação de drift</strong> (ou o pipeline completo).
        </p>
      )}
      {state.error && !missingInputs && <ErrorMessage error={state.error} />}
      {current && (
        <div className={`viz-grid${state.loading ? ' is-refreshing' : ''}`}>
          <PsiChart distributions={items} selected={current.feature} onSelect={onSelect} ks={ks} />
          <DistributionChart distribution={current} />
        </div>
      )}
    </section>
  )
}

function ApiStatus({ health }: { health: AsyncState<HealthResponse> }) {
  if (health.error) {
    return (
      <span className="api-status" title={health.error.message}>
        <StatusIcon tone="critical" /> API inacessível
      </span>
    )
  }
  if (!health.data) {
    return (
      <span className="api-status">
        <StatusIcon tone="neutral" fallback="…" /> Verificando API
      </span>
    )
  }
  return health.data.busy ? (
    <span className="api-status">
      <StatusIcon tone="running" /> API ocupada
    </span>
  ) : (
    <span className="api-status">
      <StatusIcon tone="good" /> API online
    </span>
  )
}
