import type { ReactNode } from 'react';
import './EmptyState.css';

type EmptyStateProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon = '📭',
  eyebrow = 'Sin resultados',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <section className="section-empty-state" aria-live="polite">
      <div className="section-empty-state__ambient" aria-hidden="true">
        <span className="section-empty-state__line" />
      </div>

      <div className="section-empty-state__visual" aria-hidden="true">
        <span>{icon}</span>
      </div>

      <div className="section-empty-state__body">
        <span className="section-empty-state__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {actionLabel && onAction && (
        <button
          className="section-empty-state__button"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </section>
  );
}