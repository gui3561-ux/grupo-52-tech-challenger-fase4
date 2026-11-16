import { describe, expect, it } from 'vitest'
import type { StageExecution, StageInfo, StageName } from '../api/types'
import { describeStage, latestDetection, summarizeStage } from './stages'

function execution(stage: StageName, finishedAt: string, result: unknown = {}, status: StageExecution['status'] = 'succeeded'): StageExecution {
  return { stage, status, started_at: finishedAt, finished_at: finishedAt, duration_seconds: 0.5, result, error: status === 'failed' ? 'RuntimeError: falhou' : null }
}

function stage(name: StageName, overrides: Partial<StageInfo> = {}): StageInfo {
  return { name, order: 1, description: '', requires: [], missing: [], ready: true, last_execution: null, ...overrides }
}

const detection = {
  features: [],
  data_drift: { detected: true, critical_features: ['Age', 'Credit amount'] },
  concept_drift: { reference: { roc_auc: 0.852, accuracy: 0.79 }, production: { roc_auc: 0.576, accuracy: 0.63 }, roc_auc_drop: 0.2758, accuracy_drop: 0.16, degraded: true },
  thresholds: { psi_moderate: 0.1, psi_critical: 0.25, roc_auc_drop_alert: 0.05 },
  report_url: '/drift/report',
}

describe('describeStage', () => {
  it('prioriza a execução em andamento', () => {
    expect(describeStage(stage('data_split'), 'data_split')).toMatchObject({ tone: 'running', status: 'Executando' })
  })

  it('mostra o erro da última execução que falhou', () => {
    const failed = stage('production_ingestion_gate', { last_execution: execution('production_ingestion_gate', '2026-11-16T12:00:00Z', null, 'failed') })
    expect(describeStage(failed, null)).toEqual({ tone: 'critical', status: 'Falhou', detail: 'RuntimeError: falhou' })
  })

  it('indica os arquivos que bloqueiam a etapa', () => {
    const blocked = stage('model_training', { ready: false, missing: ['data/reference/reference.csv'] })
    expect(describeStage(blocked, null)).toEqual({ tone: 'neutral', status: 'Bloqueada', detail: 'Requer reference.csv' })
  })
})

describe('summarizeStage', () => {
  it('resume o resultado de cada etapa', () => {
    expect(summarizeStage(execution('data_split', 't', { reference_rows: 3500, production_raw_rows: 1500 }))).toBe('3.500 referência · 1.500 produção')
    expect(summarizeStage(execution('model_training', 't', { roc_auc: 0.852, accuracy: 0.7886 }))).toBe('ROC-AUC 0,852 · acurácia 78,9% (holdout)')
    expect(summarizeStage(execution('drift_detection', 't', detection))).toBe('2 feature(s) crítica(s) · queda de ROC-AUC 0,276')
  })
})

describe('latestDetection', () => {
  it('devolve a última detecção bem-sucedida', () => {
    const stages = [stage('drift_detection', { last_execution: execution('drift_detection', '2026-11-16T12:00:05Z', detection) })]
    expect(latestDetection(stages)).toMatchObject({ finishedAt: '2026-11-16T12:00:05Z', stale: false })
  })

  it('marca como desatualizada quando a produção muda depois da detecção', () => {
    const stages = [
      stage('drift_simulation', { last_execution: execution('drift_simulation', '2026-11-16T12:00:06.5Z') }),
      stage('drift_detection', { last_execution: execution('drift_detection', '2026-11-16T12:00:05Z', detection) }),
    ]
    expect(latestDetection(stages)?.stale).toBe(true)
  })

  it('ignora detecção que falhou', () => {
    const stages = [stage('drift_detection', { last_execution: execution('drift_detection', 't', null, 'failed') })]
    expect(latestDetection(stages)).toBeNull()
  })
})
