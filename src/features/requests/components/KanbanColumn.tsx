// src/features/requests/components/KanbanColumn.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useColumnStyle } from '../hooks/useCustomizationStyles';
import { useCustomizationStore } from '@/store/customizationStore';
import { RequestCard } from './RequestCard';
import type { KanbanColumna, Request } from '../types';
import type { Notification } from '@/types/commons';
import { useRef, useEffect } from 'react';

type Props = {
  id:                  string;
  titulo:              string;
  color?:              string;
  titleColor?:         string;
  requests:            Request[];
totalCount?:         number;
  isOver:              boolean;
  onCardClick:         (card: Request) => void;
  onAddClick:          (columna: string) => void;
  unreadByRequestId?:  Map<string, Notification[]>;
  onLoadMore?:         () => void;
  hasMore?:            boolean;
  isLoadingMore?:      boolean;  
};

const COL_CLASS: Record<KanbanColumna, string> = {
  sin_categorizar:  'kanban__col--sin-categorizar',
  icebox:           'kanban__col--icebox',
  backlog:          'kanban__col--backlog',
  todo:             'kanban__col--todo',
  en_progreso:      'kanban__col--en-progreso',
  en_revision_qas:  'kanban__col--en-revision-qas',
  cliente_review:   'kanban__col--cliente-review',
  ready_to_deploy:  'kanban__col--ready-to-deploy',
  hecho:            'kanban__col--hecho',
  historial:        'kanban__col--historial',
};

/** Formatea horas decimales → "4h 30m", "2h", "45m" */
function formatHours(totalHours: number): string {
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)          return `${h}h`;
  return `${m}m`;
}

export function KanbanColumn({ id, titulo, color, titleColor, requests, totalCount, isOver, onCardClick, onAddClick, unreadByRequestId, onLoadMore, hasMore, isLoadingMore }: Props) {
const { setNodeRef } = useDroppable({ id });
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) onLoadMore();
      },
      { root: el.closest('.kanban__col-body'), threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);  
  const { containerStyle, titleStyle, emoji } = useColumnStyle(id);
  const { getCustomization } = useCustomizationStore();

  const showBg = getCustomization(id).showBoardBg;
  const colStyle: React.CSSProperties = {
    ...containerStyle,
    // Color dinámico desde TBL_Board_Columns — overrides el color hardcodeado del CSS
    ...(color && showBg ? {
      background:  `${color}12`,
      borderColor: `${color}30`,
    } : {}),
    ...(!showBg ? { background: 'transparent', borderColor: 'transparent' } : {}),
  };
  const effectiveTitleStyle: React.CSSProperties = {
    ...titleStyle,
    ...(titleColor ? { color: titleColor } : (color ? { color } : {})),
  };
  // Contador de horas estimadas — solo para la columna "To do"
const totalHours    = (id === 'todo' || id === 'en_progreso')
  ? requests.reduce((acc, r) => acc + (r.estimatedHours ?? 0), 0)
  : 0;
const consumedHours = id === 'en_progreso'
  ? requests.reduce((acc, r) => acc + (r.loggedHours ?? 0), 0)
  : 0;
  if (id === 'en_progreso') {
}
const showHours     = (id === 'todo' || id === 'en_progreso') && totalHours > 0;
const isEnProgreso  = id === 'en_progreso';
  return (
    <div
      ref={setNodeRef}
      className={[
        'kanban__col',
        COL_CLASS[id],
        isOver ? 'kanban__col--over' : '',
      ].join(' ')}
      style={{
        ...colStyle,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '100%',
      }}
    >
      <div className="kanban__col-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span className="kanban__col-title" style={effectiveTitleStyle}>

            {emoji && (
              <span style={{ marginRight: 5, fontSize: 12 }}>{emoji}</span>
            )}
            {titulo}
          </span>
          <span className="kanban__col-count">
            {requests.length}{totalCount != null ? ` / ${totalCount}` : ''}
          </span>

          {/* Contador de horas estimadas — solo en To do */}
{showHours && (
  <>
    {/* Horas estimadas totales */}
    <span
      title="Suma de horas estimadas (responde a filtros activos)"
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--txt-muted)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        padding: '1px 6px',
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      ⏱ {formatHours(totalHours)}
    </span>

    {/* Horas consumidas — solo en En Progreso */}
    {isEnProgreso && consumedHours > 0 && (
      <span
        title="Horas ya consumidas según el progreso reportado de cada card"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--danger)',
          background: 'rgba(255,71,87,0.08)',
          border: '1px solid rgba(255,71,87,0.30)',
          borderRadius: 4,
          padding: '1px 6px',
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        🔥 {formatHours(consumedHours)}
      </span>
    )}
  </>
)}
        </div>

        <button
          type="button"
          onClick={() => onAddClick(id)}
          aria-label={`Agregar actividad en ${titulo}`}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--txt-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.background = 'rgba(0,200,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.color = 'var(--txt-muted)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          +
        </button>
      </div>

      {id === 'sin_categorizar' && (
        <p className=""></p>
      )}

      <div className="kanban__col-body">
        <SortableContext
          items={requests.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onClick={() => onCardClick(r)}
              unreadNotifications={unreadByRequestId?.get(r.id) ?? []}
            />
          ))}
        </SortableContext>

{requests.length === 0 && (
          <div className="kanban__col-empty">
            <span>Sin solicitudes</span>
          </div>
        )}

        {onLoadMore && (
          <div ref={sentinelRef} style={{ padding: '6px 2px' }}>
            {hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                style={{
                  width: '100%',
                  height: 28,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: isLoadingMore ? 'var(--txt-dim)' : 'var(--txt-muted)',
                  cursor: isLoadingMore ? 'default' : 'pointer',
                  fontSize: 10,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {isLoadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : requests.length > 0 ? (
              <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--txt-dim)', padding: 4, letterSpacing: 0.5 }}>
                Fin del historial
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}