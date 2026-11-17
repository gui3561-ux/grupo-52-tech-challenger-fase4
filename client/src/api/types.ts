// Contrato de `GET /openapi.json` da "Credit Scoring MLOps API" 0.1.0 (src/api/main.py).
// Mantenha estes tipos alinhados aos schemas Pydantic de src/api/schemas.py ao alterar a API.

/** Etapas do pipeline, na ordem de execução (enum StageName). */
export const STAGE_NAMES = [
  'data_validation',
  'ingestion_gate',
  'data_split',
  'model_training',
  'drift_simulation',
  'production_ingestion_gate',
  'drift_detection',
] as const
export type StageName = (typeof STAGE_NAMES)[number]

/** Features do modelo (enum FeatureName). */
export const FEATURE_NAMES = [
  'Age',
  'Credit amount',
  'Duration',
  'Sex',
  'Job',
  'Housing',
  'Saving accounts',
  'Checking account',
  'Purpose',
] as const
export type FeatureName = (typeof FEATURE_NAMES)[number]

/** Categorias de `Checking account` aceitas pelo contrato Pandera. */
export const CHECKING_CATEGORIES = ['little', 'moderate', 'no_account', 'rich'] as const
export type CheckingCategory = (typeof CHECKING_CATEGORIES)[number]

export type ExecutionStatus = 'running' | 'succeeded' | 'failed'
export type FeatureType = 'numeric' | 'categorical'
/** Vereditos de PSI de src/credit/drift/detect.py (< 0,10 · 0,10–0,25 · ≥ 0,25). */
export type PsiVerdict = 'estável' | 'moderado' | 'significativo'

/** `GET /health` */
export interface HealthResponse {
  status: string
  busy: boolean
}

// --- Pipeline -------------------------------------------------------------------

/** components.schemas.StageExecution — `result` varia por etapa. */
export interface StageExecution {
  stage: StageName
  status: ExecutionStatus
  started_at: string
  finished_at: string | null
  duration_seconds: number | null
  result: unknown
  error: string | null
}

/** components.schemas.StageInfo */
export interface StageInfo {
  name: StageName
  order: number
  description: string
  requires: string[]
  missing: string[]
  ready: boolean
  last_execution: StageExecution | null
}

/** Resumo devolvido por `run_pipeline` em `PipelineJob.result`. */
export interface PipelineSummary {
  run_id: string
  total_latency_seconds: number
  roc_auc_holdout: number
  /** ROC-AUC do modelo na Produção-base (antes do choque): baseline da queda. */
  roc_auc_baseline: number
  drift_critical_alerts: number
  roc_auc_production: number
  roc_auc_drop: number
}

/** components.schemas.PipelineJob */
export interface PipelineJob {
  id: string
  status: ExecutionStatus
  started_at: string
  finished_at: string | null
  duration_seconds: number | null
  result: PipelineSummary | null
  error: string | null
}

// --- Simulação ------------------------------------------------------------------

/** components.schemas.DriftSimulationParams — `checking_distribution: null` mantém a original. */
export interface DriftSimulationParams {
  credit_inflation: number
  credit_noise_std: number
  age_shift_years: number
  checking_distribution: Partial<Record<CheckingCategory, number>> | null
  random_state: number
}

export interface NumericChange {
  feature: string
  mean_before: number
  mean_after: number
  median_before: number
  median_after: number
}

export interface CategoricalChange {
  feature: string
  before: Record<string, number>
  after: Record<string, number>
}

/** components.schemas.DriftSimulationResult */
export interface DriftSimulationResult {
  rows: number
  parameters: DriftSimulationParams
  numeric_changes: NumericChange[]
  categorical_changes: CategoricalChange[]
}

// --- Detecção e visualização ----------------------------------------------------

export interface FeatureDrift {
  feature: FeatureName
  type: FeatureType
  psi: number
  psi_verdict: PsiVerdict
  ks_statistic: number | null
  ks_pvalue: number | null
  ks_drift: boolean | null
}

export interface Performance {
  roc_auc: number
  accuracy: number
}

/** components.schemas.DriftDetectionResult */
export interface DriftDetectionResult {
  features: FeatureDrift[]
  data_drift: { detected: boolean; critical_features: FeatureName[] }
  concept_drift: {
    reference: Performance
    production: Performance
    roc_auc_drop: number
    accuracy_drop: number
    degraded: boolean
  }
  thresholds: { psi_moderate: number; psi_critical: number; roc_auc_drop_alert: number }
  report_url: string
}

export interface DistributionBin {
  /** Faixa numérica (quantis da referência) ou categoria. */
  label: string
  reference: number
  production: number
}

/** components.schemas.FeatureDistribution */
export interface FeatureDistribution {
  feature: FeatureName
  type: FeatureType
  psi: number
  psi_verdict: PsiVerdict
  bins: DistributionBin[]
}

// --- Erros ----------------------------------------------------------------------

/** components.schemas.ValidationError — 422 de validação do FastAPI/Pydantic. */
export interface ValidationError {
  loc: Array<string | number>
  msg: string
  type: string
  input?: unknown
  ctx?: Record<string, unknown>
}

/** 409 de pré-requisito ausente (MissingPrerequisiteError). */
export interface PrerequisiteDetail {
  message: string
  missing: string[]
  run_first: StageName[]
}

export interface ContractViolation {
  column: string | null
  check: string
  failure_case: unknown
  index: number | null
}

/** 422 do contrato Pandera (DataContractViolationError). */
export interface ContractViolationDetail {
  message: string
  violations_count: number
  violations: ContractViolation[]
}
