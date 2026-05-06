import type { ReactNode } from 'react';
import './ErrorState.css';

type ErrorStateProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({
  icon = '⚠️',
  eyebrow = 'Error de carga',
  title = 'No pudimos cargar la información',
  description = 'Intenta nuevamente en unos segundos.',
  retryLabel = 'Reintentar',
  onRetry,
}: ErrorStateProps) {
  return (
    <section className="section-error-state" role="alert">
      <div className="section-error-state__visual" aria-hidden="true">
        <span>{icon}</span>
      </div>

      <div className="section-error-state__body">
        <span className="section-error-state__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {onRetry && (
        <button className="section-error-state__button" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </section>
  );
}