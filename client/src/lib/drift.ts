import type { DistributionBin, PsiVerdict } from '../api/types'
import type { Tone } from './stages'

/** Limiares de src/credit/drift/detect.py: < 0,10 estável · 0,10–0,25 moderado · ≥ 0,25 significativo. */
export const PSI_THRESHOLDS = { moderate: 0.1, critical: 0.25 } as const

export const VERDICT_VIEW: Record<PsiVerdict, { tone: Tone; label: string }> = {
  estável: { tone: 'good', label: 'Estável' },
  moderado: { tone: 'warning', label: 'Moderado' },
  significativo: { tone: 'critical', label: 'Crítico' },
}

/** Índice da faixa com a maior mudança absoluta de proporção (a que recebe rótulo direto). */
export function largestShift(bins: DistributionBin[]): number {
  let best = -1
  let bestDelta = -1
  bins.forEach((bin, index) => {
    const delta = Math.abs(bin.production - bin.reference)
    if (delta > bestDelta) {
      best = index
      bestDelta = delta
    }
  })
  return best
}
