import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useColumnStyle } from '../hooks/useCustomizationStyles';
import { useCustomizationStore } from '@/store/customizationStore';
import { RequestCard } from './RequestCard';
import type { KanbanColumna, Request } from '../types';

type Props = {
  id:          KanbanColumna;
  titulo:      string;
  requests:    Request[];
  isOver:      boolean;
  onCardClick: (card: Request) => void;
  onAddClick:  (columna: KanbanColumna) => void;
};

const COL_CLASS: Record<KanbanColumna, string> = {
  sin_categorizar: 'kanban__col--sin-categorizar',
  icebox:          'kanban__col--icebox',
  backlog:         'kanban__col--backlog',
  todo:            'kanban__col--todo',
  en_progreso:     'kanban__col--en-progreso',
  hecho:           'kanban__col--hecho',
};

export function KanbanColumn({ id, titulo, requests, isOver, onCardClick, onAddClick }: Props) {
  const { setNodeRef } = useDroppable({ id });
  const { containerStyle, titleStyle, emoji } = useColumnStyle(id);
  const { getCustomization } = useCustomizationStore();

  const colStyle: React.CSSProperties = {
    ...containerStyle,
    ...(!getCustomization(id).showBoardBg ? { background: 'transparent', borderColor: 'transparent' } : {}),
  };

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
}}
    >
      <div className="kanban__col-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="kanban__col-title" style={titleStyle}>
            {emoji && (
              <span style={{ marginRight: 5, fontSize: 12 }}>{emoji}</span>
            )}
            {titulo}
          </span>
          <span className="kanban__col-count">{requests.length}</span>
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