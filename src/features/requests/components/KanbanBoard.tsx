// src/features/requests/components/KanbanBoard.tsx
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
import { ClosureModal } from './ClosureModal';
import { COLUMNAS_BOARD, COLUMNAS_CIERRE } from '../types';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCloseRequest } from '../hooks/useCloseRequest';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { config } from '@/config';

const COLUMN_ID_MAP: Record<KanbanColumna, number> = {
  sin_categorizar:  1,
  icebox:           2,
  backlog:          3,
  todo:             4,
  en_progreso:      5,
  en_revision_qas:  8,
  ready_to_deploy:  7,
  hecho:            6,
  historial:        9,
};

type Props = {
  board:         BoardData;
  equipo:        Equipo;
  onMove:        (id: string, columna: KanbanColumna) => void;
  extraRequest?: Request | null;
  onModalId?:    (id: string | null) => void;
};

const COLUMN_IDS = new Set<string>([
  'sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso',
  'en_revision_qas', 'ready_to_deploy', 'hecho', 'historial',
]);

const COLUMN_LABELS: Record<KanbanColumna, string> = {
  sin_categorizar:  'Sin categorizar',
  icebox:           'Icebox',
  backlog:          'Backlog',
  todo:             'To do',
  en_progreso:      'En progreso',
  en_revision_qas:  'En revisión QAS',
  ready_to_deploy:  'Ready to Deploy',
  hecho:            'Hecho',
  historial:        'Historial',
};

type PendingClosure = {
  card:            Request;
  targetColumna:   KanbanColumna;
  targetColumnId:  number;
};

export function KanbanBoard({ board, equipo, onMove, extraRequest, onModalId }: Props) {
  const [activeCard,     setActiveCard]     = useState<Request | null>(null);
  const [overColumn,     setOverColumn]     = useState<KanbanColumna | null>(null);
  const [modalId,        setModalId]        = useState<string | null>(null);
  const [parentModalId,  setParentModalId]  = useState<string | null>(null);
  const [pendingClosure, setPendingClosure] = useState<PendingClosure | null>(null);

  const navigate     = useNavigate();
  const { ref: scrollRef, handlers: scrollHandlers } = useDragScroll();
  const { kanbanStyle } = useBoardStyle();
  const { Requests }    = useGraphServices();
  const { data: currentUser } = useCurrentUser();

  const { mutate: closeRequest, isPending: isClosing } = useCloseRequest(equipo);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Buscar en board local primero (instantáneo), luego hidratar con fetchById
  // fetchById genera las signed URLs de los adjuntos de cierre
  const modalCardFromBoard = modalId
    ? (Object.values(board).flat().find((r) => r.id === modalId) ?? extraRequest ?? null)
    : null;

  const { data: modalCardFetched } = useQuery<Request>({
    queryKey: ['request', modalId],
    queryFn:  () => Requests.fetchById(modalId!),
    enabled:  !!modalId && !config.USE_MOCK,
    staleTime: 60_000,
  });

  // Usar la versión hidratada si ya llegó, sino la del board (sin signed URLs)
  const modalCard = modalCardFetched ?? modalCardFromBoard;

  const parentInBoard = parentModalId
    ? Object.values(board).flat().find((r) => r.id === parentModalId) ?? null
    : null;

  const { data: parentFetched } = useQuery<Request>({
    queryKey: ['request', parentModalId],
    queryFn:  () => Requests.fetchById(parentModalId!),
    enabled:  !!parentModalId && !config.USE_MOCK,
    staleTime: 30_000,
  });

  const parentCard = parentInBoard ?? parentFetched ?? null;

  function setModal(id: string | null) {
    setModalId(id);
    setParentModalId(null);
    onModalId?.(id);
  }

  function openParentModal(parentId: string) { setParentModalId(parentId); }
  function closeParentModal()                { setParentModalId(null); }

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

    if (COLUMNAS_CIERRE.has(targetCol)) {
      const card = Object.values(board).flat().find((r) => r.id === activeId);
      if (card) {
        setPendingClosure({
          card,
          targetColumna:  targetCol,
          targetColumnId: COLUMN_ID_MAP[targetCol],
        });
        return;
      }
    }

    onMove(activeId, targetCol);
  }

  function handleClosureConfirm(note: string, attachments: File[]) {
    if (!pendingClosure || !currentUser) return;
    closeRequest(
      {
        requestId:      pendingClosure.card.id,
        closedBy:       currentUser.User_ID,
        closureNote:    note,
        targetColumnId: pendingClosure.targetColumnId,
        attachments,
      },
      {
        onSuccess: () => { onMove(pendingClosure.card.id, pendingClosure.targetColumna); setPendingClosure(null); },
        onError:   () => { setPendingClosure(null); },
      },
    );
  }

  function handleModalMoveWithClosure(
    id: string,
    columna: KanbanColumna,
    note: string,
    attachments: File[],
  ) {
    if (!currentUser) return;
    closeRequest(
      {
        requestId:      id,
        closedBy:       currentUser.User_ID,
        closureNote:    note,
        targetColumnId: COLUMN_ID_MAP[columna],
        attachments,
      },
      {
        onSuccess: () => { onMove(id, columna); setPendingClosure(null); },
        onError:   () => { setPendingClosure(null); },
      },
    );
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

      {pendingClosure && (
        <ClosureModal
          request={pendingClosure.card}
          targetColumna={pendingClosure.targetColumna}
          targetColumnId={pendingClosure.targetColumnId}
          onConfirm={handleClosureConfirm}
          onCancel={() => setPendingClosure(null)}
          isPending={isClosing}
        />
      )}

      {modalCard && (
        <RequestModal
          request={modalCard}
          equipo={equipo}
          onClose={() => setModal(null)}
          onMove={(id, columna) => onMove(id, columna)}
          onMoveWithClosure={handleModalMoveWithClosure}
          onOpenRequest={(id) => {
            if (modalCard?.parentId !== null) {
              openParentModal(id);
            } else {
              setModal(id);
            }
          }}
        />
      )}

      {parentCard && (
        <RequestModal
          request={parentCard}
          equipo={equipo}
          readOnly
          onClose={closeParentModal}
          onMove={() => {/* no-op */}}
          onMoveWithClosure={() => {/* no-op */}}
        />
      )}
    </>
  );
}