import { useState } from 'react'
import { DRIFT_REPORT_URL } from '../api/client'

interface ReportPanelProps {
  /** Muda a cada detecção, para o iframe recarregar o relatório regravado. */
  revision: string | null
}

export function ReportPanel({ revision }: ReportPanelProps) {
  const [open, setOpen] = useState(false)
  const src = revision ? `${DRIFT_REPORT_URL}?v=${encodeURIComponent(revision)}` : DRIFT_REPORT_URL

  return (
    <section className="card" aria-labelledby="report-title">
      <header className="card-header">
        <div>
          <p className="eyebrow">Evidently AI</p>
          <h2 id="report-title">Relatório completo</h2>
        </div>
        <a className="button-link" href={src} target="_blank" rel="noreferrer">
          Abrir em nova aba <span aria-hidden="true">↗</span>
        </a>
      </header>
      <p className="muted small">
        Data Drift por feature e qualidade de classificação (Referência × Produção), regravado a cada detecção.
      </p>
      <details className="report-embed" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Mostrar o relatório aqui</summary>
        {/* Só carrega quando aberto: o HTML do Evidently tem alguns MB. */}
        {open && <iframe src={src} title="Relatório de drift do Evidently" loading="lazy" />}
      </details>
    </section>
  )
}
