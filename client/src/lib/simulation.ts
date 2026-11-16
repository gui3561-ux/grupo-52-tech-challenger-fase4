import { CHECKING_CATEGORIES, type CheckingCategory, type DriftSimulationParams } from '../api/types'

/** Pesos inteiros (0–100) por categoria, editados nos sliders; a API normaliza. */
export type CheckingWeights = Record<CheckingCategory, number>

/** Estado do formulário: os pesos ficam guardados mesmo com a redistribuição desligada. */
export interface SimulationForm {
  creditInflation: number
  creditNoiseStd: number
  ageShiftYears: number
  redistributeChecking: boolean
  checkingWeights: CheckingWeights
  randomState: number
}

export interface Preset {
  id: 'none' | 'official' | 'severe'
  label: string
  description: string
  form: SimulationForm
}

const OFFICIAL_WEIGHTS: CheckingWeights = { little: 45, moderate: 15, no_account: 35, rich: 5 }

export const PRESETS: Preset[] = [
  {
    id: 'none',
    label: 'Sem choque',
    description: 'Controle: produção igual à produção-base.',
    form: {
      creditInflation: 1,
      creditNoiseStd: 0,
      ageShiftYears: 0,
      redistributeChecking: false,
      checkingWeights: OFFICIAL_WEIGHTS,
      randomState: 42,
    },
  },
  {
    id: 'official',
    label: 'Oficial',
    description: 'Cenário da Etapa 2: inflação de 60%, base 10 anos mais jovem e recessão.',
    form: {
      creditInflation: 1.6,
      creditNoiseStd: 0.1,
      ageShiftYears: 10,
      redistributeChecking: true,
      checkingWeights: OFFICIAL_WEIGHTS,
      randomState: 42,
    },
  },
  {
    id: 'severe',
    label: 'Severo',
    description: 'Inflação de 120%, base 18 anos mais jovem e recessão profunda.',
    form: {
      creditInflation: 2.2,
      creditNoiseStd: 0.2,
      ageShiftYears: 18,
      redistributeChecking: true,
      checkingWeights: { little: 65, moderate: 5, no_account: 30, rich: 0 },
      randomState: 42,
    },
  },
]

export const DEFAULT_FORM = PRESETS[1].form

export function toParams(form: SimulationForm): DriftSimulationParams {
  return {
    credit_inflation: form.creditInflation,
    credit_noise_std: form.creditNoiseStd,
    age_shift_years: form.ageShiftYears,
    checking_distribution: form.redistributeChecking ? { ...form.checkingWeights } : null,
    random_state: form.randomState,
  }
}

/** Pesos normalizados (somam 1); todos zero resultam em zero. */
export function normalizeWeights(weights: CheckingWeights): CheckingWeights {
  const total = CHECKING_CATEGORIES.reduce((sum, category) => sum + weights[category], 0)
  return Object.fromEntries(
    CHECKING_CATEGORIES.map((category) => [category, total > 0 ? weights[category] / total : 0]),
  ) as CheckingWeights
}

/** A API rejeita uma distribuição cuja soma de pesos é zero. */
export function formError(form: SimulationForm): string | null {
  const total = CHECKING_CATEGORIES.reduce((sum, category) => sum + form.checkingWeights[category], 0)
  if (form.redistributeChecking && total <= 0) return 'Defina ao menos um peso maior que zero em Checking account.'
  if (!Number.isInteger(form.randomState)) return 'A semente deve ser um número inteiro.'
  return null
}

/** Preset cujo formulário é idêntico ao atual, para destacar no seletor. */
export function matchPreset(form: SimulationForm): Preset['id'] | null {
  return PRESETS.find((preset) => sameForm(preset.form, form))?.id ?? null
}

function sameForm(a: SimulationForm, b: SimulationForm): boolean {
  const scalarsMatch =
    a.creditInflation === b.creditInflation &&
    a.creditNoiseStd === b.creditNoiseStd &&
    a.ageShiftYears === b.ageShiftYears &&
    a.redistributeChecking === b.redistributeChecking &&
    a.randomState === b.randomState
  // Com a redistribuição desligada, os pesos não vão para a API e não diferenciam presets.
  const weightsMatch = !a.redistributeChecking || CHECKING_CATEGORIES.every((c) => a.checkingWeights[c] === b.checkingWeights[c])
  return scalarsMatch && weightsMatch
}

/** Rótulos de `Checking account` e o slot categórico fixo de cada categoria (a cor segue a categoria). */
export const CHECKING_LABELS: Record<CheckingCategory, string> = {
  little: 'Saldo baixo',
  moderate: 'Saldo moderado',
  no_account: 'Sem conta',
  rich: 'Saldo alto',
}

export const checkingSlot = (category: CheckingCategory) => CHECKING_CATEGORIES.indexOf(category) + 1

/**
 * Ruído a partir do qual o choque passa a gerar créditos ≤ 0 num lote de ~1.500 linhas:
 * P(N(1, σ) ≤ 0) = Φ(−1/σ) ≥ 1/1.500 quando σ ≳ 0,31. Esses registros são barrados pelo contrato.
 */
export const NOISE_CONTRACT_RISK = 0.3
