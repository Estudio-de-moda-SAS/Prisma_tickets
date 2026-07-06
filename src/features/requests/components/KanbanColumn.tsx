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
  boardId:             string;
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

export function KanbanColumn({ id, boardId, titulo, color, titleColor, requests, totalCount, isOver, onCardClick, onAddClick, unreadByRequestId, onLoadMore, hasMore, isLoadingMore }: Props) {
  const {
    getCustomization,
    getEstimatedHoursColumns,
    getConsumedHoursColumns,
    getCollapsedColumns,
    toggleCollapsedColumn,
  } = useCustomizationStore();

  const isCollapsed = getCollapsedColumns(boardId, [id]).includes(id);

  // Droppable deshabilitado cuando la columna está colapsada (no es drop target)
  const { setNodeRef } = useDroppable({ id, disabled: isCollapsed });

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore || isCollapsed) return;
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
  }, [onLoadMore, hasMore, isLoadingMore, isCollapsed]);

  const { containerStyle, titleStyle, emoji } = useColumnStyle(id);

  const showBg = getCustomization(boardId).showBoardBg;
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

  /* ── Contadores de horas en el header — configurables por columna ── */
  const showEstimated = getEstimatedHoursColumns(boardId, [id]).includes(id);
  const showConsumed  = getConsumedHoursColumns(boardId, [id]).includes(id);

  const totalHours = showEstimated
    ? requests.reduce((acc, r) => acc + (r.estimatedHours ?? 0), 0)
    : 0;
  const consumedHours = showConsumed
    ? requests.reduce((acc, r) => acc + (r.loggedHours ?? 0), 0)
    : 0;

  /* ══════════════════════════════════════════════
     Render colapsado — barra vertical estilo Airtable
     ══════════════════════════════════════════════ */
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        className={[
          'kanban__col',
          'kanban__col--collapsed',
          COL_CLASS[id as KanbanColumna],
        ].join(' ')}
        style={colStyle}
        onClick={() => toggleCollapsedColumn(boardId, id)}
        title={`Expandir ${titulo}`}
      >
        <div className="kanban__col-collapsed-inner">
          <span
            className="kanban__col-expand-btn"
            aria-label={`Expandir ${titulo}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="kanban__col-collapsed-title" style={effectiveTitleStyle}>
            {emoji && <span style={{ marginBottom: 4 }}>{emoji}</span>}
            {titulo}
          </span>
          <span className="kanban__col-collapsed-count">
            {totalCount != null ? totalCount : requests.length}
          </span>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════
     Render normal
     ══════════════════════════════════════════════ */
  return (
    <div
      ref={setNodeRef}
      className={[
        'kanban__col',
        COL_CLASS[id as KanbanColumna],
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

          {/* Horas estimadas totales — ⏱ */}
          {showEstimated && totalHours > 0 && (
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
          )}

          {/* Horas consumidas — 🔥 */}
          {showConsumed && consumedHours > 0 && (
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* Colapsar columna */}
          <button
            type="button"
            onClick={() => toggleCollapsedColumn(boardId, id)}
            aria-label={`Colapsar ${titulo}`}
            title={`Colapsar ${titulo}`}
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
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Agregar actividad */}
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