import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useCardClasses,
  useCardVisibility,
  useCardStyle,
  usePriorityColor,
} from '../hooks/useCustomizationStyles';
import type { Request } from '../types';

type Props = {
  request:     Request;
  isDragging?: boolean;
  onClick?:    () => void;
};

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

const PRIORIDAD_LABEL: Record<Request['prioridad'], string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  critica: 'Crítica',
};

export function RequestCard({ request, isDragging = false, onClick }: Props) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: request.id });

  const isBeingDragged  = isSortableDragging || isDragging;
  const progreso        = request.progreso ?? 0;
  const showProgressCol = request.columna === 'en_progreso' || request.columna === 'hecho';

  const cardClasses                             = useCardClasses(request.prioridad);
  const { showDesc, showProgress, showAvatars,
          showCategory }                        = useCardVisibility();
  const cardStyle                               = useCardStyle();
  const priorityColor                           = usePriorityColor(request.prioridad);
  const shouldShowProgress                      = showProgressCol && showProgress;

  // Borde izquierdo con el color de prioridad personalizado
  const priorityBorderStyle: React.CSSProperties = {
    '--priority-color': priorityColor,
  } as React.CSSProperties;

  // Badge con color personalizado
  const badgeStyle: React.CSSProperties = {
    background: `${priorityColor}20`,
    color:       priorityColor,
    border:      `1px solid ${priorityColor}40`,
  };

  function handleClick(e: React.MouseEvent) {
    if (isSortableDragging) return;
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...cardStyle,
        ...priorityBorderStyle,
      }}
      className={[
        cardClasses,
        isBeingDragged ? 'request-card--dragging' : '',
      ].filter(Boolean).join(' ')}
      {...attributes}
      {...listeners}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="request-card__header">
        <span className="request-card__id">
          #{request.id.slice(-6).toUpperCase()}
        </span>
        {showCategory && request.categoria && (
          <span className="request-card__cat">{request.categoria}</span>
        )}
      </div>

      {/* Título */}
      <p className="request-card__title">{request.titulo}</p>

      {/* Descripción */}
      {showDesc && request.descripcion && (
        <p className="request-card__desc">
          {request.descripcion.length > 80
            ? request.descripcion.slice(0, 80) + '…'
            : request.descripcion}
        </p>
      )}

      {/* Progreso */}
      {shouldShowProgress && (
        <div className="request-card__progress">
          <div className="request-card__progress-track">
            <div
              className={[
                'request-card__progress-fill',
                progreso >= 100 ? 'request-card__progress-fill--done' : '',
              ].join(' ')}
              style={{ width: `${progreso}%` }}
            />
          </div>
          <span className="request-card__progress-pct">
            {progreso >= 100 ? '✓' : `${progreso}%`}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="request-card__footer">
        <span className="request-card__badge" style={badgeStyle}>
          {PRIORIDAD_LABEL[request.prioridad]}
        </span>

        {showAvatars && (
          <div className="request-card__people">
            {request.solicitante && (
              <div
                className="request-card__avatar request-card__avatar--requester"
                title={`Solicitante: ${request.solicitante}`}
              >
                {initials(request.solicitante)}
              </div>
            )}
            {request.resolutor && (
              <div
                className="request-card__avatar request-card__avatar--resolver"
                title={`Resolutor: ${request.resolutor}`}
              >
                {initials(request.resolutor)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}