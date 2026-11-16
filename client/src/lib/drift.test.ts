import { describe, expect, it } from 'vitest'
import { largestShift } from './drift'

describe('largestShift', () => {
  it('aponta a faixa com a maior mudança absoluta', () => {
    const bins = [
      { label: '< 25', reference: 0.1, production: 0.4 },
      { label: '[25, 35)', reference: 0.5, production: 0.45 },
      { label: '≥ 35', reference: 0.4, production: 0.15 },
    ]
    expect(largestShift(bins)).toBe(0)
  })

  it('devolve -1 sem faixas', () => {
    expect(largestShift([])).toBe(-1)
  })
})
