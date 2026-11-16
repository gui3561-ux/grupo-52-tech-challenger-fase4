import { STAGE_LABELS } from '../lib/stages'
import type {
  ContractViolation,
  DriftDetectionResult,
  DriftSimulationParams,
  DriftSimulationResult,
  FeatureDistribution,
  HealthResponse,
  PipelineJob,
  StageExecution,
  StageInfo,
  StageName,
  ValidationError,
} from './types'

/** Base usada pelo browser. Padrão `/api`: o proxy do Vite repassa para a API (sem CORS). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

/** Endereço real da API (o destino do proxy quando a base é relativa). */
export const API_TARGET = /^https?:\/\//.test(API_BASE_URL) ? API_BASE_URL : __API_PROXY_TARGET__

/** Swagger UI direto na API: via proxy o `/docs` quebraria (ele busca `/openapi.json` na raiz). */
export const API_DOCS_URL = `${API_TARGET}/docs`

/** Relatório HTML do Evidently, pela mesma origem do app (pode ser embutido em iframe). */
export const DRIFT_REPORT_URL = `${API_BASE_URL}/drift/report`

/** Quantas violações do contrato listar na mensagem; o total vem em `violations_count`. */
const MAX_LISTED_VIOLATIONS = 5

export class ApiError extends Error {
  /** `null` quando a API não respondeu (falha de rede). */
  readonly status: number | null
  /** Linhas complementares: campos inválidos, etapas a executar antes ou violações do contrato. */
  readonly details: string[]

  constructor(message: string, status: number | null, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro inesperado.'
}

export function formatValidationError(error: ValidationError): string {
  const location = error.loc.filter((part) => part !== 'body').join('.')
  return location ? `${location}: ${error.msg}` : error.msg
}

// --- Endpoints ------------------------------------------------------------------

export const getHealth = () => requestJson<HealthResponse>('/health', undefined, isRecord)

export const getStages = () => requestJson<StageInfo[]>('/pipeline/stages', undefined, Array.isArray)

export const runStage = (stage: StageName) =>
  requestJson<StageExecution>(`/pipeline/stages/${stage}/run`, { method: 'POST' }, isRecord)

export const startPipeline = () => requestJson<PipelineJob>('/pipeline/runs', { method: 'POST' }, isRecord)

export const listPipelineRuns = () => requestJson<PipelineJob[]>('/pipeline/runs', undefined, Array.isArray)

export const getPipelineRun = (jobId: string) =>
  requestJson<PipelineJob>(`/pipeline/runs/${encodeURIComponent(jobId)}`, undefined, isRecord)

export const simulateDrift = (params: DriftSimulationParams) =>
  requestJson<DriftSimulationResult>('/drift/simulate', jsonBody(params), isRecord)

export const detectDrift = () =>
  requestJson<DriftDetectionResult>('/drift/detect', { method: 'POST' }, (body) => isRecord(body) && Array.isArray(body.features))

export const getDistributions = () => requestJson<FeatureDistribution[]>('/drift/distributions', undefined, Array.isArray)

// --- Infraestrutura -------------------------------------------------------------

function jsonBody(payload: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}

async function requestJson<T>(path: string, init: RequestInit | undefined, isValid: (body: unknown) => boolean): Promise<T> {
  const response = await send(path, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  const body = await readJson(response)
  if (!response.ok) throw errorFromResponse(response.status, body)
  if (!isValid(body)) throw new ApiError(`A resposta de ${path} não segue o contrato da API.`, response.status)
  return body as T
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw unreachableError(null)
  }
  // O proxy do Vite responde 500 sem corpo quando a API está fora do ar;
  // a API sempre envia corpo nos erros, então 5xx vazio indica falha de conexão.
  if (response.status >= 500 && !(await response.clone().text())) {
    throw unreachableError(response.status)
  }
  return response
}

function unreachableError(status: number | null): ApiError {
  return new ApiError(`Não foi possível conectar à API (${API_BASE_URL}). Verifique se ela está em execução.`, status)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function errorFromResponse(status: number, body: unknown): ApiError {
  const detail = isRecord(body) ? body.detail : undefined

  // 422 do Pydantic: lista de erros campo a campo.
  if (status === 422 && Array.isArray(detail)) {
    const details = detail.filter(isValidationError).map(formatValidationError)
    return new ApiError('A API rejeitou os parâmetros (erro de validação).', status, details)
  }
  // 409 de pré-requisito: etapas a executar antes.
  if (isRecord(detail) && Array.isArray(detail.run_first)) {
    const runFirst = (detail.run_first as StageName[]).map((stage) => STAGE_LABELS[stage] ?? stage)
    const missing = Array.isArray(detail.missing) ? (detail.missing as string[]) : []
    const details = [
      ...(runFirst.length > 0 ? [`Execute antes: ${runFirst.join(' → ')}`] : []),
      ...(missing.length > 0 ? [`Arquivos ausentes: ${missing.join(', ')}`] : []),
    ]
    return new ApiError('Faltam resultados de etapas anteriores.', status, details)
  }
  // 422 do contrato Pandera: violações por registro.
  if (isRecord(detail) && Array.isArray(detail.violations)) {
    const total = typeof detail.violations_count === 'number' ? detail.violations_count : detail.violations.length
    const listed = (detail.violations as ContractViolation[]).slice(0, MAX_LISTED_VIOLATIONS).map(formatViolation)
    const remaining = total - listed.length
    const details = remaining > 0 ? [...listed, `… e mais ${remaining} violação(ões)`] : listed
    return new ApiError(`O contrato de dados bloqueou o lote: ${total} violação(ões).`, status, details)
  }
  if (typeof detail === 'string') return new ApiError(detail, status)
  return new ApiError(`A API respondeu com HTTP ${status}.`, status)
}

function formatViolation(violation: ContractViolation): string {
  const where = violation.index === null ? '' : ` (registro ${violation.index})`
  const column = violation.column ?? 'Lote'
  return `${column}${where}: valor ${JSON.stringify(violation.failure_case)} violou ${violation.check}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidationError(value: unknown): value is ValidationError {
  return isRecord(value) && Array.isArray(value.loc) && typeof value.msg === 'string'
}
