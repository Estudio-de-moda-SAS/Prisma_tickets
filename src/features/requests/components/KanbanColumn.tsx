// src/features/requests/components/KanbanColumn.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useColumnStyle } from '../hooks/useCustomizationStyles';
import { useCustomizationStore } from '@/store/customizationStore';
import { RequestCard } from './RequestCard';
import type { KanbanColumna, Request } from '../types';
import type { Notification } from '@/types/commons';

type Props = {
  id:                  KanbanColumna;
  titulo:              string;
  requests:            Request[];
  isOver:              boolean;
  onCardClick:         (card: Request) => void;
  onAddClick:          (columna: KanbanColumna) => void;
  unreadByRequestId?:  Map<string, Notification[]>;
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

export function KanbanColumn({ id, titulo, requests, isOver, onCardClick, onAddClick, unreadByRequestId }: Props) {
  const { setNodeRef } = useDroppable({ id });
  const { containerStyle, titleStyle, emoji } = useColumnStyle(id);
  const { getCustomization } = useCustomizationStore();

  const colStyle: React.CSSProperties = {
    ...containerStyle,
    ...(!getCustomization(id).showBoardBg
      ? { background: 'transparent', borderColor: 'transparent' }
      : {}),
  };

  // Contador de horas estimadas — solo para la columna "To do"
  const totalHours = id === 'todo'
    ? requests.reduce((acc, r) => acc + (r.estimatedHours ?? 0), 0)
    : 0;
  const showHours = id === 'todo' && totalHours > 0;

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
          <span className="kanban__col-title" style={titleStyle}>
            {emoji && (
              <span style={{ marginRight: 5, fontSize: 12 }}>{emoji}</span>
            )}
            {titulo}
          </span>
          <span className="kanban__col-count">{requests.length}</span>

          {/* Contador de horas estimadas — solo en To do */}
          {showHours && (
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
        <p className="kanban__drop-hint">↓ Asignar al equipo</p>
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
      </div>
    </div>
  );
}