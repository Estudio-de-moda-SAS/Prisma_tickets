import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDragScroll } from '../hooks/useDragScroll';
import { useBoardStyle } from '../hooks/useCustomizationStyles';
import { KanbanColumn } from './KanbanColumn';
import { RequestCard } from './RequestCard';
import { RequestModal } from './RequestModal';
import { COLUMNAS_BOARD } from '../types';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';

type Props = {
  board:         BoardData;
  equipo:        Equipo;
  onMove:        (id: string, columna: KanbanColumna) => void;
  extraRequest?: Request | null;
  onModalId?:    (id: string | null) => void;
};

const COLUMN_IDS = new Set<string>([
  'sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'hecho',
]);

const COLUMN_LABELS: Record<KanbanColumna, string> = {
  sin_categorizar: 'Sin categorizar',
  icebox:          'Icebox',
  backlog:         'Backlog',
  todo:            'To do',
  en_progreso:     'En progreso',
  hecho:           'Hecho',
};

export function KanbanBoard({ board, equipo, onMove, extraRequest, onModalId }: Props) {
  const [activeCard,      setActiveCard]      = useState<Request | null>(null);
  const [overColumn,      setOverColumn]      = useState<KanbanColumna | null>(null);
  const [modalId,         setModalId]         = useState<string | null>(null);
  // Modal padre apilado encima — siempre readOnly
  const [parentModalId,   setParentModalId]   = useState<string | null>(null);

  const navigate = useNavigate();
  const { ref: scrollRef, handlers: scrollHandlers } = useDragScroll();
  const { kanbanStyle } = useBoardStyle();
  const { Requests }    = useGraphServices();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Request principal (hija o raíz normal)
  const modalCard = modalId
    ? (Object.values(board).flat().find((r) => r.id === modalId) ?? extraRequest ?? null)
    : null;

  // Request padre — fetch si no está en el board local
  const parentInBoard = parentModalId
    ? Object.values(board).flat().find((r) => r.id === parentModalId) ?? null
    : null;

  const { data: parentFetched } = useQuery<Request>({
    queryKey: ['request', parentModalId],
    queryFn:  () => Requests.fetchById(Number(parentModalId)),
    enabled:  !!parentModalId && !parentInBoard && !config.USE_MOCK,
    staleTime: 30_000,
  });

  const parentCard = parentInBoard ?? parentFetched ?? null;

  function setModal(id: string | null) {
    setModalId(id);
    setParentModalId(null); // cerrar padre al cambiar de hija
    onModalId?.(id);
  }

  function openParentModal(parentId: string) {
    setParentModalId(parentId);
  }

  function closeParentModal() {
    setParentModalId(null);
  }

  function findColumn(id: string): KanbanColumna | null {
    for (const [col, items] of Object.entries(board)) {
      if (items.some((r) => r.id === id)) return col as KanbanColumna;
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const card = Object.values(board).flat().find((r) => r.id === String(active.id));
    setActiveCard(card ?? null);
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (!over) { setOverColumn(null); return; }
    const overId = String(over.id);
    setOverColumn(COLUMN_IDS.has(overId) ? (overId as KanbanColumna) : findColumn(overId));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    setOverColumn(null);
    if (!over) return;

    const activeId   = String(active.id);
    const overId     = String(over.id);
    const targetCol  = COLUMN_IDS.has(overId) ? (overId as KanbanColumna) : findColumn(overId);
    const currentCol = findColumn(activeId);

    if (!targetCol || !currentCol || targetCol === currentCol) return;
    onMove(activeId, targetCol);
  }

  const columnas: KanbanColumna[] = ['sin_categorizar', ...COLUMNAS_BOARD];

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div ref={scrollRef} className="kanban" style={kanbanStyle} {...scrollHandlers}>
          {columnas.map((col) => (
            <KanbanColumn
              key={col}
              id={col}
              titulo={COLUMN_LABELS[col]}
              requests={board[col] ?? []}
              isOver={overColumn === col}
              onCardClick={(card) => setModal(card.id)}
              onAddClick={() => navigate('/new')}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeCard && (
            <div style={{ transform: 'rotate(1.5deg)', width: 260 }}>
              <RequestCard request={activeCard} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modal principal (hija o raíz normal) */}
      {modalCard && (
        <RequestModal
          request={modalCard}
          equipo={equipo}
          onClose={() => setModal(null)}
          onMove={(id, columna) => onMove(id, columna)}
onOpenRequest={(id) => {
  // Si la request actual es una hija, el id que llega es el padre → readOnly
  // Si la request actual es una raíz, el id que llega es una hija → editable
  if (modalCard?.parentId !== null) {
    openParentModal(id);   // es el padre → readOnly
  } else {
    setModal(id);          // es una hija → editable normal
  }
}}
        />
      )}

      {/* Modal padre apilado encima — readOnly */}
      {parentCard && (
        <RequestModal
          request={parentCard}
          equipo={equipo}
          readOnly
          onClose={closeParentModal}
          onMove={() => {/* no-op en readOnly */}}
        />
      )}
    </>
  );
}