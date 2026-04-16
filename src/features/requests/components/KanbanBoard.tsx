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
import { KANBAN_COLUMNAS, COLUMNAS_BOARD } from '../types';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';

type Props = {
  board:  BoardData;
  equipo: Equipo;
  onMove: (id: string, columna: KanbanColumna) => void;
};

const COLUMN_IDS = new Set<string>([
  'sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'hecho',
]);

export function KanbanBoard({ board, equipo, onMove }: Props) {
  const [activeCard, setActiveCard] = useState<Request | null>(null);
  const [overColumn, setOverColumn] = useState<KanbanColumna | null>(null);
  const [modalId,    setModalId]    = useState<string | null>(null);  // ← solo el id

  // Siempre fresco desde el board (conectado al cache de React Query)
  const modalCard = modalId
    ? Object.values(board).flat().find((r) => r.id === modalId) ?? null
    : null;

  const { ref: scrollRef, handlers: scrollHandlers } = useDragScroll();
  const { kanbanStyle } = useBoardStyle();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function findColumn(id: string): KanbanColumna | null {
    for (const [col, items] of Object.entries(board)) {
      if (items.some((r) => r.id === id)) return col as KanbanColumna;
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const card = Object.values(board).flat().find((r) => r.id === active.id);
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

    const overId     = String(over.id);
    const targetCol  = COLUMN_IDS.has(overId) ? (overId as KanbanColumna) : findColumn(overId);
    const currentCol = findColumn(String(active.id));

    if (!targetCol || !currentCol || targetCol === currentCol) return;
    onMove(String(active.id), targetCol);
  }

  function handleModalMove(id: string, columna: KanbanColumna) {
    onMove(id, columna);
    // No hace falta setModalCard — modalCard se recalcula solo desde board
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
              titulo={KANBAN_COLUMNAS[col]}
              requests={board[col] ?? []}
              isOver={overColumn === col}
              onCardClick={(card) => setModalId(card.id)}  // ← solo guarda el id
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
          onClose={() => setModalId(null)}        // ← setModalId
          onMove={handleModalMove}
        />
      )}
    </>
  );
}