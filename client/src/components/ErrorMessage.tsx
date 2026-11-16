import { ApiError } from '../api/client'

interface ErrorMessageProps {
  error: Error
  onDismiss?: () => void
}

export function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  const details = error instanceof ApiError ? error.details : []
  return (
    <div className="error-box" role="alert">
      <span className="status-icon tone-critical" aria-hidden="true">✕</span>
      <div className="error-body">
        <p>{error.message}</p>
        {details.length > 0 && (
          <ul>
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="icon-button" onClick={onDismiss} aria-label="Fechar mensagem de erro">
          ✕
        </button>
      )}
    </div>
  )
}
