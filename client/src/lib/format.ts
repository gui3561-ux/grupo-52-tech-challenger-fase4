const formatters = new Map<string, Intl.NumberFormat>()

function formatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options)
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat('pt-BR', options)
    formatters.set(key, cached)
  }
  return cached
}

/** Número com casas fixas: 3.332 · 0,852. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return formatter({ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value)
}

/** Proporção (0–1) como porcentagem: 0,251 → 25,1%. */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return formatter({
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio)
}

/** Variação relativa com sinal: 0,607 → +60,7%. */
export function formatSignedPercent(ratio: number, fractionDigits = 1): string {
  return formatter({
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: 'exceptZero',
  }).format(ratio)
}

/** Diferença entre proporções em pontos percentuais: 0,128 → +12,8 p.p. (`signed=false` → 12,8 p.p.). */
export function formatPoints(delta: number, fractionDigits = 1, signed = true): string {
  const value = formatter({
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(delta * 100)
  return `${value} p.p.`
}

export function formatSeconds(seconds: number): string {
  return `${formatNumber(seconds, seconds < 10 ? 1 : 0)} s`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
