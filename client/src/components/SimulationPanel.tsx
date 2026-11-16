import { useState } from 'react'
import { CHECKING_CATEGORIES, type CheckingCategory, type DriftSimulationResult } from '../api/types'
import { formatNumber, formatPercent, formatSignedPercent } from '../lib/format'
import {
  CHECKING_LABELS,
  checkingSlot,
  DEFAULT_FORM,
  formError,
  matchPreset,
  NOISE_CONTRACT_RISK,
  normalizeWeights,
  PRESETS,
  type SimulationForm,
} from '../lib/simulation'
import { ErrorMessage } from './ErrorMessage'
import { RangeField } from './RangeField'
import { SegmentedBar, SegmentLegend, type Segment } from './SegmentedBar'
import { StatusIcon } from './StatusIcon'

interface SimulationPanelProps {
  locked: boolean
  /** Passo em andamento ("Simulando…", "Validando contrato…"), ou null. */
  progress: string | null
  error: Error | null
  onDismissError: () => void
  result: DriftSimulationResult | null
  onApply: (form: SimulationForm) => void
}

export function SimulationPanel({ locked, progress, error, onDismissError, result, onApply }: SimulationPanelProps) {
  const [form, setForm] = useState<SimulationForm>(DEFAULT_FORM)
  const presetId = matchPreset(form)
  const preset = PRESETS.find((candidate) => candidate.id === presetId)
  const validation = formError(form)
  const shares = normalizeWeights(form.checkingWeights)
  const update = (patch: Partial<SimulationForm>) => setForm((current) => ({ ...current, ...patch }))
  const setWeight = (category: CheckingCategory, value: number) =>
    setForm((current) => ({ ...current, checkingWeights: { ...current.checkingWeights, [category]: value } }))

  return (
    <section className="card" aria-labelledby="simulation-title">
      <header className="card-header">
        <div>
          <p className="eyebrow">Choque macroeconômico</p>
          <h2 id="simulation-title">Simulação de drift</h2>
        </div>
      </header>

      <form
        className="simulation-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!validation) onApply(form)
        }}
      >
        <fieldset className="field-group">
          <legend>Cenário</legend>
          <div className="segmented" role="group" aria-label="Cenários prontos">
            {PRESETS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={presetId === candidate.id}
                onClick={() => setForm(candidate.form)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <p className="muted small">{preset ? preset.description : 'Personalizado: parâmetros ajustados manualmente.'}</p>
        </fieldset>

        <RangeField
          id="credit-inflation"
          label="Inflação do crédito"
          value={form.creditInflation}
          min={0.5}
          max={3}
          step={0.05}
          display={`×${formatNumber(form.creditInflation, 2)} (${formatSignedPercent(form.creditInflation - 1, 0)})`}
          onChange={(value) => update({ creditInflation: value })}
        />
        <RangeField
          id="credit-noise"
          label="Ruído no valor do crédito"
          value={form.creditNoiseStd}
          min={0}
          max={1}
          step={0.01}
          display={`σ ${formatNumber(form.creditNoiseStd, 2)}`}
          onChange={(value) => update({ creditNoiseStd: value })}
          hint={
            form.creditNoiseStd >= NOISE_CONTRACT_RISK ? (
              <span className="hint-warning">
                <StatusIcon tone="warning" /> Com σ ≥ {formatNumber(NOISE_CONTRACT_RISK, 2)} surgem créditos ≤ 0: o contrato
                Pandera deve bloquear o lote.
              </span>
            ) : undefined
          }
        />
        <RangeField
          id="age-shift"
          label="Rejuvenescimento da base"
          value={form.ageShiftYears}
          min={-20}
          max={30}
          step={1}
          display={describeAgeShift(form.ageShiftYears)}
          onChange={(value) => update({ ageShiftYears: value })}
        />

        <fieldset className="field-group">
          <legend className="switch-row">
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.redistributeChecking}
                onChange={(event) => update({ redistributeChecking: event.target.checked })}
              />
              <span className="switch-track" aria-hidden="true" />
              Redistribuir Checking account (recessão)
            </label>
          </legend>
          {form.redistributeChecking ? (
            <div className="weights">
              <SegmentedBar title="Distribuição alvo" segments={toSegments(shares)} variant="thin" />
              {CHECKING_CATEGORIES.map((category) => (
                <RangeField
                  key={category}
                  id={`weight-${category}`}
                  label={CHECKING_LABELS[category]}
                  swatch={checkingSlot(category)}
                  value={form.checkingWeights[category]}
                  min={0}
                  max={100}
                  step={1}
                  display={formatPercent(shares[category], 0)}
                  onChange={(value) => setWeight(category, value)}
                />
              ))}
            </div>
          ) : (
            <p className="muted small">Desligado: mantém a distribuição original de Checking account.</p>
          )}
        </fieldset>

        <div className="inline-field">
          <label htmlFor="random-state">Semente aleatória</label>
          <input
            id="random-state"
            type="number"
            step={1}
            value={form.randomState}
            onChange={(event) => update({ randomState: Number(event.target.value) })}
          />
        </div>

        {validation && <p className="field-error">{validation}</p>}
        <button type="submit" className="primary block" disabled={locked || validation !== null}>
          Aplicar simulação
        </button>
        <p className="muted small">Simula, valida o lote no contrato Pandera e recalcula a detecção, como no pipeline.</p>
      </form>

      {progress && (
        <p className="progress" role="status">
          <StatusIcon tone="running" /> {progress}
        </p>
      )}
      {error && <ErrorMessage error={error} onDismiss={onDismissError} />}
      {result && <SimulationEffect result={result} />}
    </section>
  )
}

function SimulationEffect({ result }: { result: DriftSimulationResult }) {
  return (
    <div className="effect" aria-labelledby="effect-title">
      <h3 id="effect-title">Efeito da última simulação</h3>
      <p className="muted small">{formatNumber(result.rows)} linhas de produção alteradas.</p>
      <dl className="effect-list">
        {result.numeric_changes.map((change) => (
          <div key={change.feature} className="effect-row">
            <dt>{change.feature} · média</dt>
            <dd>
              {formatNumber(change.mean_before, 1)} → <strong>{formatNumber(change.mean_after, 1)}</strong>
              <span className="muted"> ({formatSignedPercent(relativeChange(change.mean_before, change.mean_after))})</span>
            </dd>
          </div>
        ))}
      </dl>
      {result.categorical_changes.map((change) => {
        const before = toSegments(change.before)
        const after = toSegments(change.after)
        return (
          <figure key={change.feature} className="chart-figure">
            <figcaption className="chart-caption">
              <span className="chart-title">{change.feature}</span>
              <span className="muted small">Participação de cada categoria antes e depois</span>
            </figcaption>
            <div className="segbar-pair">
              <span className="segbar-row-label">Antes</span>
              <SegmentedBar title="Antes da simulação" segments={before} />
              <span className="segbar-row-label">Depois</span>
              <SegmentedBar title="Depois da simulação" segments={after} />
            </div>
            <SegmentLegend segments={after} />
            <details className="table-view">
              <summary>Ver dados em tabela</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Categoria</th>
                    <th scope="col">Antes</th>
                    <th scope="col">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {after.map((segment, index) => (
                    <tr key={segment.key}>
                      <td>
                        {segment.label} <code>{segment.key}</code>
                      </td>
                      <td>{formatPercent(before[index].value)}</td>
                      <td>{formatPercent(segment.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </figure>
        )
      })}
    </div>
  )
}

/** Segmentos na ordem fixa das categorias (a cor de cada uma nunca muda). */
function toSegments(shares: Partial<Record<string, number>>): Segment[] {
  return CHECKING_CATEGORIES.map((category) => ({
    key: category,
    label: CHECKING_LABELS[category],
    value: shares[category] ?? 0,
    slot: checkingSlot(category),
  }))
}

function relativeChange(before: number, after: number): number {
  return before === 0 ? 0 : (after - before) / before
}

function describeAgeShift(years: number): string {
  if (years === 0) return 'sem mudança'
  return years > 0 ? `${years} anos mais jovem` : `${-years} anos mais velha`
}
