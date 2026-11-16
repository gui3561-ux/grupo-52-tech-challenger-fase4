import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM, formError, matchPreset, normalizeWeights, PRESETS, toParams } from './simulation'

describe('simulação', () => {
  it('o formulário padrão é o cenário oficial da API', () => {
    expect(matchPreset(DEFAULT_FORM)).toBe('official')
    expect(toParams(DEFAULT_FORM)).toEqual({
      credit_inflation: 1.6,
      credit_noise_std: 0.1,
      age_shift_years: 10,
      checking_distribution: { little: 45, moderate: 15, no_account: 35, rich: 5 },
      random_state: 42,
    })
  })

  it('sem redistribuição envia checking_distribution nulo', () => {
    const none = PRESETS.find((preset) => preset.id === 'none')!
    expect(toParams(none.form).checking_distribution).toBeNull()
  })

  it('ajuste manual deixa de corresponder a um preset', () => {
    expect(matchPreset({ ...DEFAULT_FORM, creditInflation: 1.65 })).toBeNull()
  })

  it('normaliza os pesos para somarem 1', () => {
    const shares = normalizeWeights({ little: 1, moderate: 1, no_account: 2, rich: 0 })
    expect(shares).toEqual({ little: 0.25, moderate: 0.25, no_account: 0.5, rich: 0 })
  })

  it('bloqueia distribuição com todos os pesos zerados', () => {
    const zeroed = { ...DEFAULT_FORM, checkingWeights: { little: 0, moderate: 0, no_account: 0, rich: 0 } }
    expect(formError(zeroed)).not.toBeNull()
    expect(formError({ ...zeroed, redistributeChecking: false })).toBeNull()
  })
})
