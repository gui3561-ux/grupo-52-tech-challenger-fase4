/** Escala com marcas "redondas" (1, 2, 2,5 ou 5 × 10ⁿ) cobrindo [min, max]. */
export function niceScale(minValue: number, maxValue: number, targetTicks = 4) {
  const span = maxValue - minValue || Math.abs(maxValue) || 1
  const rawStep = span / targetTicks
  let magnitude = 10 ** Math.floor(Math.log10(rawStep))
  // Tolerância: ex. (10,9 − 10,1) / 4 = 0,2000000000000002 não pode descartar o passo 0,2.
  const target = rawStep * (1 - 1e-9)
  let multiplier = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= target) ?? 10
  if (multiplier === 10) {
    multiplier = 1
    magnitude *= 10
  }
  const step = multiplier * magnitude
  const min = Math.floor(minValue / step) * step
  let max = Math.ceil(maxValue / step) * step
  if (max === min) max = min + step

  const count = Math.round((max - min) / step)
  const ticks = Array.from({ length: count + 1 }, (_, index) => min + index * step)
  const decimals = Math.max(0, Math.round(-Math.log10(magnitude))) + (Number.isInteger(multiplier) ? 0 : 1)
  return { min, max, ticks, decimals }
}
