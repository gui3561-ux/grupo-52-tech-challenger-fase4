import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, detectDrift, getStages, runStage, simulateDrift, startPipeline } from './client'
import type { DriftSimulationParams } from './types'

function mockFetch(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const fetchMock = vi.fn().mockResolvedValue(new Response(text, { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const params: DriftSimulationParams = {
  credit_inflation: 1.6,
  credit_noise_std: 0.1,
  age_shift_years: 10,
  checking_distribution: { little: 45, moderate: 15, no_account: 35, rich: 5 },
  random_state: 42,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requisições', () => {
  it('envia os parâmetros da simulação em POST /drift/simulate', async () => {
    const fetchMock = mockFetch(200, { rows: 1500, parameters: params, numeric_changes: [], categorical_changes: [] })

    await expect(simulateDrift(params)).resolves.toMatchObject({ rows: 1500 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/drift/simulate')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })
    expect(JSON.parse(init.body)).toEqual(params)
  })

  it('executa uma etapa em POST /pipeline/stages/{stage}/run', async () => {
    const fetchMock = mockFetch(200, { stage: 'data_split', status: 'succeeded', result: {} })

    await runStage('data_split')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/pipeline/stages/data_split/run')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('inicia o pipeline em POST /pipeline/runs (202)', async () => {
    mockFetch(202, { id: 'abc123', status: 'running', started_at: '2026-11-16T12:00:00Z' })

    await expect(startPipeline()).resolves.toMatchObject({ id: 'abc123', status: 'running' })
  })

  it('rejeita resposta fora do contrato', async () => {
    mockFetch(200, { stages: [] })

    const error = await captureError(getStages())
    expect(error.message).toContain('/pipeline/stages')
  })
})

describe('erros da API', () => {
  it('traduz 409 de pré-requisito nas etapas a executar antes', async () => {
    mockFetch(409, {
      detail: {
        message: "Pré-requisitos ausentes para 'drift_detection'",
        missing: ['data/production/production.csv'],
        run_first: ['drift_simulation'],
      },
    })

    const error = await captureError(detectDrift())
    expect(error.status).toBe(409)
    expect(error.message).toBe('Faltam resultados de etapas anteriores.')
    expect(error.details).toEqual([
      'Execute antes: Simulação de drift',
      'Arquivos ausentes: data/production/production.csv',
    ])
  })

  it('resume as violações do contrato Pandera (422) e informa o restante', async () => {
    const violations = Array.from({ length: 7 }, (_, index) => ({
      column: 'Credit amount',
      check: 'greater_than(0)',
      failure_case: -index,
      index,
    }))
    mockFetch(422, { detail: { message: 'Barreira de Ingestão: ...', violations_count: 230, violations } })

    const error = await captureError(runStage('production_ingestion_gate'))
    expect(error.message).toBe('O contrato de dados bloqueou o lote: 230 violação(ões).')
    expect(error.details).toHaveLength(6)
    expect(error.details[0]).toBe('Credit amount (registro 0): valor 0 violou greater_than(0)')
    expect(error.details[5]).toBe('… e mais 225 violação(ões)')
  })

  it('lista os erros de validação do Pydantic (422) por campo', async () => {
    mockFetch(422, {
      detail: [{ loc: ['body', 'checking_distribution'], msg: 'Value error, categorias inválidas', type: 'value_error' }],
    })

    const error = await captureError(simulateDrift(params))
    expect(error.details).toEqual(['checking_distribution: Value error, categorias inválidas'])
  })

  it('repassa o detail textual (409 execução em andamento)', async () => {
    mockFetch(409, { detail: 'Já existe uma execução em andamento.' })

    const error = await captureError(startPipeline())
    expect(error).toMatchObject({ status: 409, message: 'Já existe uma execução em andamento.' })
  })

  it('sinaliza API inacessível em falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await captureError(getStages())
    expect(error.status).toBeNull()
    expect(error.message).toContain('Não foi possível conectar à API')
  })

  it('sinaliza API inacessível quando o proxy responde 5xx sem corpo', async () => {
    mockFetch(500, undefined)

    const error = await captureError(getStages())
    expect(error.status).toBe(500)
    expect(error.message).toContain('Não foi possível conectar à API')
  })
})
