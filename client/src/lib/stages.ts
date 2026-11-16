import type { DriftDetectionResult, StageExecution, StageInfo, StageName } from '../api/types'
import { formatNumber, formatPercent, formatSeconds } from './format'

export const STAGE_LABELS: Record<StageName, string> = {
  data_validation: 'Validação do dataset base',
  ingestion_gate: 'Ingestion Gate (lote corrompido)',
  data_split: 'Split Referência × Produção',
  model_training: 'Treino do baseline',
  drift_simulation: 'Simulação de drift',
  production_ingestion_gate: 'Contrato no lote de produção',
  drift_detection: 'Detecção de drift',
}

/** Estados visuais compartilhados (cor de status sempre acompanhada de ícone e texto). */
export type Tone = 'good' | 'critical' | 'warning' | 'running' | 'neutral'

export interface StageView {
  tone: Tone
  status: string
  detail: string | null
}

export function describeStage(stage: StageInfo, runningStage: StageName | null): StageView {
  const last = stage.last_execution
  if (runningStage === stage.name) return { tone: 'running', status: 'Executando', detail: null }
  if (last?.status === 'failed') return { tone: 'critical', status: 'Falhou', detail: last.error }
  if (last?.status === 'succeeded') return { tone: 'good', status: 'Concluída', detail: summarizeStage(last) }
  if (!stage.ready) {
    const files = stage.missing.map((path) => path.split('/').pop()).join(', ')
    return { tone: 'neutral', status: 'Bloqueada', detail: `Requer ${files}` }
  }
  return { tone: 'neutral', status: 'Pronta', detail: null }
}

/** Uma linha legível com o resultado de cada etapa (o `result` varia por etapa). */
export function summarizeStage(execution: StageExecution): string {
  const result = isRecord(execution.result) ? execution.result : {}
  const n = (key: string) => (typeof result[key] === 'number' ? (result[key] as number) : NaN)
  const fallback = execution.duration_seconds === null ? 'Concluída' : `Concluída em ${formatSeconds(execution.duration_seconds)}`

  switch (execution.stage) {
    case 'data_validation':
    case 'production_ingestion_gate':
      return `${formatNumber(n('rows'))} linhas aprovadas no contrato`
    case 'ingestion_gate':
      return `Lote bloqueado: ${formatNumber(n('contract_rejected_rows'))} linhas, ${formatNumber(n('contract_violations_count'))} violações`
    case 'data_split':
      return `${formatNumber(n('reference_rows'))} referência · ${formatNumber(n('production_raw_rows'))} produção`
    case 'model_training':
      return `ROC-AUC ${formatNumber(n('roc_auc'), 3)} · acurácia ${formatPercent(n('accuracy'))} (holdout)`
    case 'drift_simulation':
      return `${formatNumber(n('rows'))} linhas com drift injetado`
    case 'drift_detection': {
      const detection = execution.result as DriftDetectionResult
      const critical = detection.data_drift?.critical_features.length ?? 0
      return `${critical} feature(s) crítica(s) · queda de ROC-AUC ${formatNumber(detection.concept_drift?.roc_auc_drop ?? NaN, 3)}`
    }
    default:
      return fallback
  }
}

export interface DetectionSnapshot {
  result: DriftDetectionResult
  finishedAt: string
  /** Referência, modelo ou produção mudaram depois desta detecção. */
  stale: boolean
}

// Etapas que regravam arquivos lidos pela detecção.
const INVALIDATING_STAGES: StageName[] = ['data_split', 'model_training', 'drift_simulation']

/** Última detecção bem-sucedida, a partir do histórico de etapas da API. */
export function latestDetection(stages: StageInfo[]): DetectionSnapshot | null {
  const byName = new Map(stages.map((stage) => [stage.name, stage]))
  const last = byName.get('drift_detection')?.last_execution
  if (!last || last.status !== 'succeeded' || !last.finished_at) return null

  const detectedAt = Date.parse(last.finished_at)
  const stale = INVALIDATING_STAGES.some((name) => {
    const execution = byName.get(name)?.last_execution
    return execution?.status === 'succeeded' && execution.finished_at !== null && Date.parse(execution.finished_at) > detectedAt
  })
  return { result: last.result as DriftDetectionResult, finishedAt: last.finished_at, stale }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
