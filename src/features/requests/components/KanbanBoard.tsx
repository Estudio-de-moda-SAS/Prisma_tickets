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
import { useDragScroll } from '../hooks/useDragScroll';
import { useBoardStyle } from '../hooks/useCustomizationStyles';
import { KanbanColumn } from './KanbanColumn';
import { RequestCard } from './RequestCard';
import { RequestModal } from './RequestModal';
import { CreateRequestModal } from './CreateRequestModal';
import { COLUMNAS_BOARD } from '../types';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';

type Props = {
  board:  BoardData;
  equipo: Equipo;
  onMove: (id: string, columna: KanbanColumna) => void;
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

export function KanbanBoard({ board, equipo, onMove }: Props) {
  const [activeCard, setActiveCard]     = useState<Request | null>(null);
  const [overColumn, setOverColumn]     = useState<KanbanColumna | null>(null);
  const [modalId, setModalId]           = useState<string | null>(null);
  const [createColumn, setCreateColumn] = useState<KanbanColumna | null>(null);
  const [localCreatedRequests, setLocalCreatedRequests] = useState<Request[]>([]);

  const { ref: scrollRef, handlers: scrollHandlers } = useDragScroll();
  const { kanbanStyle } = useBoardStyle();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const mergedBoard: BoardData = {
    sin_categorizar: [...(board.sin_categorizar ?? []), ...localCreatedRequests.filter((r) => r.columna === 'sin_categorizar')],
    icebox:          [...(board.icebox          ?? []), ...localCreatedRequests.filter((r) => r.columna === 'icebox')],
    backlog:         [...(board.backlog         ?? []), ...localCreatedRequests.filter((r) => r.columna === 'backlog')],
    todo:            [...(board.todo            ?? []), ...localCreatedRequests.filter((r) => r.columna === 'todo')],
    en_progreso:     [...(board.en_progreso     ?? []), ...localCreatedRequests.filter((r) => r.columna === 'en_progreso')],
    hecho:           [...(board.hecho           ?? []), ...localCreatedRequests.filter((r) => r.columna === 'hecho')],
  };

  const modalCard = modalId
    ? Object.values(mergedBoard).flat().find((r) => r.id === modalId) ?? null
    : null;

  function findColumn(id: string): KanbanColumna | null {
    for (const [col, items] of Object.entries(mergedBoard)) {
      if (items.some((r) => r.id === id)) return col as KanbanColumna;
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const card = Object.values(mergedBoard).flat().find((r) => r.id === String(active.id));
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

    const activeId  = String(active.id);
    const overId    = String(over.id);
    const targetCol = COLUMN_IDS.has(overId) ? (overId as KanbanColumna) : findColumn(overId);
    const currentCol = findColumn(activeId);

    if (!targetCol || !currentCol || targetCol === currentCol) return;

    const isLocalCreated = localCreatedRequests.some((r) => r.id === activeId);
    if (isLocalCreated) {
      setLocalCreatedRequests((prev) =>
        prev.map((r) => (r.id === activeId ? { ...r, columna: targetCol } : r)),
      );
      return;
    }

    onMove(activeId, targetCol);
  }

  function handleModalMove(id: string, columna: KanbanColumna) {
    const isLocalCreated = localCreatedRequests.some((r) => r.id === id);
    if (isLocalCreated) {
      setLocalCreatedRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, columna } : r)),
      );
      return;
    }
    onMove(id, columna);
  }

  function handleCreateRequest(newRequest: Request) {
    setLocalCreatedRequests((prev) => [newRequest, ...prev]);
    setCreateColumn(null);
    setModalId(newRequest.id);
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
        <div
          ref={scrollRef}
          className="kanban"
          style={kanbanStyle}
          {...scrollHandlers}
        >
          {columnas.map((col) => (
            <KanbanColumn
              key={col}
              id={col}
              titulo={COLUMN_LABELS[col]}
              requests={mergedBoard[col] ?? []}
              isOver={overColumn === col}
              onCardClick={(card) => setModalId(card.id)}
              onAddClick={(columna) => setCreateColumn(columna)}
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

      {modalCard && (
        <RequestModal
          request={modalCard}
          equipo={equipo}
          onClose={() => setModalId(null)}
          onMove={handleModalMove}
        />
      )}

      {createColumn && (
        <CreateRequestModal
          equipo={equipo}
          initialColumn={createColumn}
          onClose={() => setCreateColumn(null)}
          onCreate={handleCreateRequest}
        />
      )}
    </>
  );
}