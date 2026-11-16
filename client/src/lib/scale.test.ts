import { describe, expect, it } from 'vitest'
import { niceScale } from './scale'

describe('niceScale', () => {
  it('gera marcas redondas que cobrem o intervalo', () => {
    expect(niceScale(36.62, 48.2)).toEqual({ min: 35, max: 50, ticks: [35, 40, 45, 50], decimals: 0 })
  })

  it('usa casas decimais quando o passo é fracionário', () => {
    const scale = niceScale(10.1, 10.9)
    expect(scale.decimals).toBe(1)
    expect(scale.min).toBeLessThanOrEqual(10.1)
    expect(scale.max).toBeGreaterThanOrEqual(10.9)
  })

  it('não colapsa com série constante', () => {
    const scale = niceScale(40, 40)
    expect(scale.max).toBeGreaterThan(scale.min)
  })
})
