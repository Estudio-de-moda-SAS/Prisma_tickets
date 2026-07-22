// src/features/requests/components/KanbanBoard.tsx
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { CreateRequestModal } from './CreateRequestModal';
import { useDragScroll } from '../hooks/useDragScroll';
import { useBoardStyle } from '../hooks/useCustomizationStyles';
import { KanbanColumn } from './KanbanColumn';
import { RequestCard } from './RequestCard';
import { RequestModal } from './RequestModal';
import { ClosureModal } from './ClosureModal';
import type { BoardData, Equipo, Request } from '../types';
import type { ColumnWithConfig } from '../hooks/useKanbanAdmin';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCloseRequest } from '../hooks/useCloseRequest';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useNotifications } from '../hooks/useNotifications';
import { useHistorialCount } from '../hooks/useRequests';
import { useBoardStore } from '@/store/boardStore';
import { config } from '@/config';
import { useIsMobile } from '@/components/hooks/useMediaQuery';
import type { Notification } from '@/types/commons';


/* ── Fallback estático para cuando columnConfig aún no cargó ── */
const COLUMN_ID_FALLBACK: Record<string, number> = {
  sin_categorizar: 1, icebox: 2,       backlog: 3,
  todo: 4,            en_progreso: 5,  hecho: 6,
  ready_to_deploy: 7, en_revision_qas: 8, historial: 9, cliente_review: 10,
};

type PendingClosure = {
  card:                    Request;
  targetColumna:           string;
  targetColumnId:          number;
  sourceRequiresEvidence:  boolean;
  previousClosure:         Request['cierreInfo'] | null;
};

type Props = {
  board:           BoardData;
  equipo:          Equipo;
  columnConfig:    ColumnWithConfig[];
  onMove:          (id: string, columna: string, movedBy?: number) => void;
  extraRequest?:   Request | null;
  onModalId?:      (id: string | null) => void;
  /** Disparador externo: al cambiar la referencia, abre el modal del ticket indicado */
openTicketSignal?: { id: string; nonce: number } | null;
  onLoadMoreHistorial?: () => void;
  historialHasMore?:    boolean;
  historialLoading?:    boolean;
};


export function KanbanBoard({ board, equipo, columnConfig, onMove, extraRequest, onModalId, openTicketSignal, onLoadMoreHistorial, historialHasMore, historialLoading }: Props) {  const [activeCard,     setActiveCard]     = useState<Request | null>(null);
  const [overColumn,     setOverColumn]     = useState<string | null>(null);
  const [modalId,        setModalId]        = useState<string | null>(null);
  const [parentModalId,  setParentModalId]  = useState<string | null>(null);
  const [pendingClosure, setPendingClosure] = useState<PendingClosure | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState<string | null>(null);
  const [mobileColIndex,  setMobileColIndex]  = useState(0);
  const isMobile = useIsMobile();
  const { ref: scrollRef, handlers: scrollHandlers } = useDragScroll();
  const { kanbanStyle } = useBoardStyle();
  const { kanbanZoom }  = useBoardStore();
  const { Requests }    = useGraphServices();
  const { data: currentUser } = useCurrentUser();
  const { data: allTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const currentTeamId = useMemo(
    () => allTeams.find(
      (t) => t.Board_Team_Code === equipo || t.Board_Team_Name === equipo
    )?.Board_Team_ID ?? null,
    [allTeams, equipo],
  );
  const { mutate: closeRequest, isPending: isClosing } = useCloseRequest(equipo);
  const { notifications, markRead } = useNotifications(currentUser?.User_ID ?? null);
const { data: historialCount } = useHistorialCount(equipo);
  /* ============================================================
     Estructuras dinámicas derivadas de columnConfig
     ============================================================ */
  const visibleColumns = useMemo(() =>
    columnConfig.length > 0
      ? columnConfig
          .filter((c) => c.Is_Visible)
          .sort((a, b) => a.Board_Column_Position - b.Board_Column_Position)
      : [], // el board no se vacía — usa las keys del board durante la carga
    [columnConfig],
  );

  /** Slugs en orden de posición */
  const columnSlugs = useMemo(
    () => visibleColumns.map((c) => c.Board_Column_Slug),
    [visibleColumns],
  );

  /** Set rápido para lookup en drag events */
  const columnSlugSet = useMemo(() => new Set(columnSlugs), [columnSlugs]);

  /** slug → nombre display */
  const columnLabels = useMemo(
    () => Object.fromEntries(visibleColumns.map((c) => [c.Board_Column_Slug, c.Board_Column_Name])),
    [visibleColumns],
  );

  /** slug → Board_Column_ID */
  const columnIdMap = useMemo(
    () => Object.fromEntries(visibleColumns.map((c) => [c.Board_Column_Slug, c.Board_Column_ID])),
    [visibleColumns],
  );

  /** Slugs que requieren evidencia (definido en DB por equipo) */
  const columnColors = useMemo(
    () => Object.fromEntries(visibleColumns.map((c) => [c.Board_Column_Slug, c.Team_Column_Color ?? c.Board_Column_Color])),
    [visibleColumns],
  );

  const columnTitleColors = useMemo(
    () => Object.fromEntries(
      visibleColumns.map((c) => [c.Board_Column_Slug, c.Team_Column_Title_Color ?? undefined])
    ) as Record<string, string | undefined>,
    [visibleColumns],
  );

  const evidenceSlugs = useMemo(
    () => new Set(visibleColumns.filter((c) => c.Evidence_Required).map((c) => c.Board_Column_Slug)),
    [visibleColumns],
  );

  /* ── Notificaciones no leídas por ticket ── */
  const unreadByRequestId = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of notifications) {
      if (n.isRead || !n.requestId) continue;
      if (!map.has(n.requestId)) map.set(n.requestId, []);
      map.get(n.requestId)!.push(n);
    }
    return map;
  }, [notifications]);

  const boardUrl  = `/board/${equipo}`;
  const ticketUrl = (id: string) => `/board/${equipo}/ticket/${id}`;

  /* ============================================================
     Modal
     ============================================================ */
  function setModal(id: string | null) {
    setModalId(id);
    setParentModalId(null);
    onModalId?.(id);
    if (id) {
      history.replaceState(null, '', ticketUrl(id));
      (unreadByRequestId.get(id) ?? []).forEach((n) => markRead(n.notificationId));
    } else {
      history.replaceState(null, '', boardUrl);
    }
  }

  const sensors = useSensors(
    // Desktop: arrastrás con mouse tras mover 6px
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Móvil: mantené presionado 200ms para arrastrar; una deslizada normal = scroll
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  /* ── Apertura externa del modal (desde búsqueda) ── */
  useEffect(() => {
    if (!openTicketSignal) return;
    setModalId(openTicketSignal.id);
    setParentModalId(null);
    onModalId?.(openTicketSignal.id);
    history.replaceState(null, '', `/board/${equipo}/ticket/${openTicketSignal.id}`);
    (unreadByRequestId.get(openTicketSignal.id) ?? []).forEach((n) => markRead(n.notificationId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketSignal]);

  const modalCardFromBoard = modalId
    ? (Object.values(board).flat().find((r) => r.id === modalId) ?? extraRequest ?? null)
    : null;

  const { data: modalCardFetched } = useQuery<Request>({
    queryKey:  ['request', modalId],
    queryFn:   () => Requests.fetchById(modalId!),
    enabled:   !!modalId && !config.USE_MOCK,
    staleTime: 60_000,
  });

  const modalCard = modalCardFetched ?? modalCardFromBoard;

  const parentInBoard = parentModalId
    ? Object.values(board).flat().find((r) => r.id === parentModalId) ?? null
    : null;

  const { data: parentFetched } = useQuery<Request>({
    queryKey:  ['request', parentModalId],
    queryFn:   () => Requests.fetchById(parentModalId!),
    enabled:   !!parentModalId && !config.USE_MOCK,
    staleTime: 30_000,
  });

  const parentCard = parentInBoard ?? parentFetched ?? null;

  function openParentModal(parentId: string) {
    setParentModalId(modalId);
    setModalId(parentId);
    history.replaceState(null, '', ticketUrl(parentId));
  }

  /* ============================================================
     Drag & Drop
     ============================================================ */
  function findColumn(id: string): string | null {
    for (const [col, items] of Object.entries(board)) {
      if (items.some((r) => r.id === id)) return col;
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
    setOverColumn(columnSlugSet.has(overId) ? overId : findColumn(overId));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    setOverColumn(null);
    if (!over) return;

    const activeId   = String(active.id);
    const overId     = String(over.id);
    const targetCol  = columnSlugSet.has(overId) ? overId : findColumn(overId);
    const currentCol = findColumn(activeId);

    if (!targetCol || !currentCol || targetCol === currentCol) return;

    const card = Object.values(board).flat().find((r) => r.id === activeId);
    if (!card) return;

    /* ── Evidencia: dinámica desde TBL_Team_Column_Config ── */
    const yaHayClosure      = !!card.fechaCierre;
    const necesitaEvidencia = evidenceSlugs.has(targetCol) && !yaHayClosure;

    if (necesitaEvidencia) {
      const sourceRequiresEvidence = evidenceSlugs.has(currentCol);
      setPendingClosure({
        card,
        targetColumna:          targetCol,
        targetColumnId:         columnIdMap[targetCol] ?? COLUMN_ID_FALLBACK[targetCol] ?? 0,
        sourceRequiresEvidence,
        previousClosure:        sourceRequiresEvidence ? (card.cierreInfo ?? null) : null,
      });
      return;
    }

    onMove(activeId, targetCol, currentUser?.User_ID);
  }

  /* ============================================================
     Cierre con evidencia
     ============================================================ */
  function handleClosureConfirm(note: string, attachments: File[], mode: 'new' | 'reuse' | 'skip', reuseFromClosureId: number | null) {
    if (!pendingClosure || !currentUser) return;
    closeRequest(
      {
        requestId:      pendingClosure.card.id,
        closedBy:       currentUser.User_ID,
        closureNote:    note,
        targetColumnId: pendingClosure.targetColumnId,
        attachments,
        evidenceMode:       mode,
        reuseFromClosureId,
      },
      {
        onSuccess: () => setPendingClosure(null),
        onError:   () => setPendingClosure(null),
      },
    );
  }

  function handleModalMoveWithClosure(
    id: string, columna: string, note: string, attachments: File[],
    mode: 'new' | 'reuse' | 'skip' = 'new',
    reuseFromClosureId: number | null = null,
  ) {
    if (!currentUser) return;
    closeRequest(
      {
        requestId:      id,
        closedBy:       currentUser.User_ID,
        closureNote:    note,
        targetColumnId: columnIdMap[columna] ?? COLUMN_ID_FALLBACK[columna] ?? 0,
        attachments,
        evidenceMode:       mode,
        reuseFromClosureId,
      },
      {
        onSuccess: () => setPendingClosure(null),
        onError:   () => setPendingClosure(null),
      },
    );
  }

  /* ============================================================
     Render
     Mientras carga columnConfig, muestra las columnas del board
     que ya tienen datos (evita pantalla vacía).
     ============================================================ */
  const renderSlugs = columnSlugs.length > 0
    ? columnSlugs
    : Object.keys(board);

  // Índice de columna visible en móvil, siempre dentro de rango
  const clampedColIndex = Math.min(mobileColIndex, Math.max(0, renderSlugs.length - 1));

  // Fábrica única de columna — reusada por desktop (map) y móvil (una sola)
  const renderColumn = (col: string) => (
    <KanbanColumn
      key={col}
      id={col}
      boardId={equipo}
      titulo={columnLabels[col] ?? col}
      color={columnColors[col]}
      titleColor={columnTitleColors[col]}
      requests={board[col] ?? []}
      totalCount={col === 'historial' ? historialCount?.total : undefined}
      isOver={overColumn === col}
      onCardClick={(card) => setModal(card.id)}
      onAddClick={(col) => setCreateModalOpen(col)}
      unreadByRequestId={unreadByRequestId}
      onLoadMore={col === 'historial' ? onLoadMoreHistorial : undefined}
      hasMore={col === 'historial' ? historialHasMore : undefined}
      isLoadingMore={col === 'historial' ? historialLoading : undefined}
    />
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {isMobile ? (
          <div className="kanban-mobile">
            <MobileColumnSelector
              slugs={renderSlugs}
              labels={columnLabels}
              colors={columnColors}
              board={board}
              activeIndex={clampedColIndex}
              onSelect={setMobileColIndex}
            />
            <div className="kanban kanban--mobile" style={kanbanStyle}>
              {renderSlugs[clampedColIndex] && renderColumn(renderSlugs[clampedColIndex])}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="kanban"
            style={{
              ...kanbanStyle,
              zoom:   kanbanZoom,
              height: `calc((100vh - 120px) / ${kanbanZoom})`,
            }}
            {...scrollHandlers}
          >
            {renderSlugs.map(renderColumn)}
          </div>
        )}

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
          targetColumna={pendingClosure.targetColumna as any}
          targetColumnId={pendingClosure.targetColumnId}
          canReuseEvidence={pendingClosure.sourceRequiresEvidence}
          previousClosure={pendingClosure.previousClosure}
          onConfirm={handleClosureConfirm}
          onCancel={() => setPendingClosure(null)}
          isPending={isClosing}
        />
      )}

      {modalCard && !parentCard && (
        <RequestModal
          request={modalCard}
          equipo={equipo}
          onClose={() => setModal(null)}
          onMove={(id, columna) => onMove(id, columna)}
          onMoveWithClosure={handleModalMoveWithClosure}
          onOpenRequest={(id) => {
            if (modalCard.parentId) {
              openParentModal(id);
            } else {
              setParentModalId(modalCard.id);
              setModalId(id);
              history.replaceState(null, '', ticketUrl(id));
            }
          }}
        />
      )}

      {parentCard && modalCard && (
        <RequestModal
          request={modalCard}
          equipo={equipo}
          onClose={() => {
            setModalId(parentModalId);
            setParentModalId(null);
            history.replaceState(null, '', parentModalId ? ticketUrl(parentModalId) : boardUrl);
          }}
onMove={(id, columna) => onMove(id, columna)}
          onMoveWithClosure={handleModalMoveWithClosure}
          onOpenRequest={(id) => openParentModal(id)}          backLabel="← Volver"
          onBack={() => {
            setModalId(parentModalId);
            setParentModalId(null);
            history.replaceState(null, '', parentModalId ? ticketUrl(parentModalId) : boardUrl);
          }}
        />
      )}
      {createModalOpen !== null && (
        <CreateRequestModal
          onClose={() => setCreateModalOpen(null)}
          defaultTeamId={currentTeamId ?? undefined}
          defaultColumnSlug={createModalOpen}
        />
      )}
    </>
  );
}

/* ============================================================
   Selector de columna para móvil — pills + flechas prev/next
   ============================================================ */
function MobileColumnSelector({
  slugs, labels, colors, board, activeIndex, onSelect,
}: {
  slugs:       string[];
  labels:      Record<string, string>;
  colors:      Record<string, string | undefined>;
  board:       BoardData;
  activeIndex: number;
  onSelect:    (i: number) => void;
}) {
  const pillsRef = useRef<HTMLDivElement>(null);

  const go = (dir: -1 | 1) => {
    const next = Math.min(Math.max(activeIndex + dir, 0), slugs.length - 1);
    onSelect(next);
  };

  // Centra la pill activa cuando cambia
  useEffect(() => {
    const el = pillsRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <div className="kanban-mobile__selector">
      <button
        className="kanban-mobile__arrow"
        onClick={() => go(-1)}
        disabled={activeIndex === 0}
        aria-label="Columna anterior"
      >
        {'\u2039'}
      </button>

      <div className="kanban-mobile__pills" ref={pillsRef}>
        {slugs.map((slug, i) => {
          const active = i === activeIndex;
          const color  = colors[slug];
          const count  = board[slug]?.length ?? 0;
          return (
            <button
              key={slug}
              data-active={active}
              className={['kanban-mobile__pill', active ? 'kanban-mobile__pill--active' : ''].join(' ')}
              style={active && color ? { borderColor: `${color}80`, color } : undefined}
              onClick={() => onSelect(i)}
            >
              {labels[slug] ?? slug}
              <span className="kanban-mobile__pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      <button
        className="kanban-mobile__arrow"
        onClick={() => go(1)}
        disabled={activeIndex === slugs.length - 1}
        aria-label="Columna siguiente"
      >
        {'\u203A'}
      </button>
    </div>
  );
}