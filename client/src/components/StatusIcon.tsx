import type { Tone } from '../lib/stages'

const ICONS: Partial<Record<Tone, string>> = { good: '✓', critical: '✕', warning: '!' }

interface StatusIconProps {
  tone: Tone
  /** Conteúdo para tons sem ícone próprio (ex.: número da etapa). */
  fallback?: string | number
}

/** Ícone circular de status; o texto do estado fica sempre ao lado, nunca só a cor. */
export function StatusIcon({ tone, fallback }: StatusIconProps) {
  return (
    <span className={`status-icon tone-${tone}`} aria-hidden="true">
      {tone === 'running' ? <span className="spinner" /> : (ICONS[tone] ?? fallback)}
    </span>
  )
}
