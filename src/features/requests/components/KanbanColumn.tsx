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
};

const COL_CLASS: Record<KanbanColumna, string> = {
  sin_categorizar: 'kanban__col--sin-categorizar',
  icebox:          'kanban__col--icebox',
  backlog:         'kanban__col--backlog',
  todo:            'kanban__col--todo',
  en_progreso:     'kanban__col--en-progreso',
  hecho:           'kanban__col--hecho',
};

export function KanbanColumn({ id, titulo, requests, isOver, onCardClick }: Props) {
  const { setNodeRef } = useDroppable({ id });
  const { containerStyle, titleStyle, emoji } = useColumnStyle(id);
  const { getCustomization } = useCustomizationStore();

  // Cuando showBoardBg está desactivado, eliminamos el background de la columna
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
      style={colStyle}
    >
      <div className="kanban__col-header">
        <span className="kanban__col-title" style={titleStyle}>
          {emoji && (
            <span style={{ marginRight: 5, fontSize: 12 }}>{emoji}</span>
          )}
          {titulo}
        </span>
        <span className="kanban__col-count">{requests.length}</span>
      </div>

      {id === 'sin_categorizar' && (
        <p className="kanban__drop-hint">↓ Asignar al equipo</p>
      )}

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
  );
}