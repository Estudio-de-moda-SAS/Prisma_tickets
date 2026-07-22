// src/pages/BoardPage.tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useBoardStore, ZOOM_MIN, ZOOM_MAX } from '@/store/boardStore';
import { useSearchStore } from '@/store/searchStore';
import { useBoardEquipo, useHistorialLoadMore, useSearchRequests } from '@/features/requests/hooks/useRequests';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { useSubTeams }              from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped } from '@/features/requests/hooks/useSubTeamMembers';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useLabelsByTeamId} from '@/features/requests/hooks/useLabels';
import { useBoardTemplates } from '@/features/requests/hooks/useBoardMetadata';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useQuery } from '@tanstack/react-query';
import { KanbanBoard } from '@/features/requests/components/KanbanBoard';
import { BoardFilters, type FilterDynamicOptions, type TemplateFilterOption, type TemplateFieldOption } from '@/features/requests/components/BoardFilters';
import { BoardSearch } from '@/features/requests/components/BoardSearch';
import { BoardCustomizationTrigger } from '@/features/requests/components/BoardCustomization';
import { MemberHoursBar } from '@/features/requests/components/MemberHoursBar'
import { useFilteredBoard } from '@/features/requests/hooks/useFilteredBoard';
import { config } from '@/config';
import type { KanbanColumna, Request, BoardData } from '@/features/requests/types';
import type { TemplateExtraField, ConditionalField } from '@/features/requests/templates/types';
import { isConditionalField } from '@/features/requests/templates/types';
import KanbanSkeleton from '@/features/requests/components/KanbanSkeleton';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { useTeamColumnConfig } from '@/features/requests/hooks/useKanbanAdmin';
import { sprintYear } from '@/features/requests/hooks/useSprints';
import { useIsMobile } from '@/components/hooks/useMediaQuery';
/** Fallback estático — mismos IDs que la BD, por si columnMap no cargó aún */
const COLUMN_ID_FALLBACK: Record<KanbanColumna, number> = {
  sin_categorizar:  1,
  icebox:           2,
  backlog:          3,
  todo:             4,
  en_progreso:      5,
  en_revision_qas:  8,
  cliente_review:   10,
  ready_to_deploy:  7,
  hecho:            6,
  historial:        9,
};

const EMPTY_REQUESTS: Request[] = [];

function flattenTemplateFields(
  fields: TemplateExtraField[],
  seen:   Set<string>,
  result: TemplateFieldOption[],
): void {
  for (const f of fields) {
    if (isConditionalField(f)) {
      const cf = f as ConditionalField;
      if (cf.key && cf.label?.trim() && !seen.has(cf.key)) {
        seen.add(cf.key);
        result.push({ key: cf.key, label: cf.label, fieldType: 'boolean' });
      }
      flattenTemplateFields(cf.trueBranch,  seen, result);
      flattenTemplateFields(cf.falseBranch, seen, result);
    } else {
      if (!f.key || f.key === '__labels') continue;
      if (seen.has(f.key)) continue;
      if (!f.label?.trim()) continue;
      seen.add(f.key);

      let fieldType: TemplateFieldOption['fieldType'];
      if (f.type === 'select' || f.type === 'radio') fieldType = 'select_radio';
      else if (f.type === 'checkbox')                fieldType = 'boolean';
      else                                           fieldType = 'text';

      result.push({
        key:     f.key,
        label:   f.label,
        fieldType,
        options: (f.type === 'select' || f.type === 'radio') ? (f.options ?? []) : undefined,
      });
    }
  }
}
/* ============================================================
   Control de zoom del Kanban
   ============================================================ */
function KanbanZoomControl() {
  const { kanbanZoom, stepKanbanZoom, resetKanbanZoom } = useBoardStore();

  const atMin = kanbanZoom <= ZOOM_MIN + 0.001;
  const atMax = kanbanZoom >= ZOOM_MAX - 0.001;
  const isDefault = Math.round(kanbanZoom * 100) === 100;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    height:         26,
    width:          26,
    background:     'var(--bg-surface)',
    border:         '1px solid var(--border-subtle)',
    color:          disabled ? 'var(--txt-dim)' : 'var(--txt-muted)',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    padding:        0,
    transition:     'color 0.15s, background 0.15s',
    flexShrink:     0,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {/* Zoom out */}
      <button
        style={{ ...btnStyle(atMin), borderRadius: '6px 0 0 6px' }}
        disabled={atMin}
        onClick={() => stepKanbanZoom(-1)}
        title="Zoom out"
      >
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <path d="M1 1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Porcentaje — clic resetea a 100 % */}
      <span
        onClick={!isDefault ? resetKanbanZoom : undefined}
        title={!isDefault ? 'Restablecer 100%' : undefined}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          height:         26,
          minWidth:       38,
          fontSize:       10,
          fontFamily:     'var(--font-display)',
          letterSpacing:  '0.5px',
          background:     'var(--bg-surface)',
          borderTop:      '1px solid var(--border-subtle)',
          borderBottom:   '1px solid var(--border-subtle)',
          color:          !isDefault ? 'var(--accent)' : 'var(--txt-muted)',
          cursor:         !isDefault ? 'pointer' : 'default',
          userSelect:     'none',
          transition:     'color 0.15s',
        }}
      >
        {Math.round(kanbanZoom * 100)}%
      </span>

      {/* Zoom in */}
      <button
        style={{ ...btnStyle(atMax), borderRadius: '0 6px 6px 0' }}
        disabled={atMax}
        onClick={() => stepKanbanZoom(1)}
        title="Zoom in"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ============================================================
   BoardPage
   ============================================================ */
// DESPUÉS
export function BoardPage() {
  const { equipo: equipoParam = 'desarrollo' } = useParams<{ equipo: string }>();
  const { setEquipoActivo }          = useBoardStore();
  const isMobile                     = useIsMobile();

  // Sincroniza el store con la URL (para el sidebar)
  useEffect(() => {
    setEquipoActivo(equipoParam);
  }, [equipoParam]);

  const equipoActivo = equipoParam; // La URL es la fuente de verdad
  const { data, isLoading, isError } = useBoardEquipo(equipoActivo);
  const { mutate: mover }            = useMoveRequest(equipoActivo);
  const columnMap                    = useColumnMap(config.DEFAULT_BOARD_ID);
  const { Requests }                 = useGraphServices();

  const [externalModalId,   setExternalModalId]   = useState<string | null>(null);
  const [openTicketSignal,  setOpenTicketSignal]  = useState<{ id: string; nonce: number } | null>(null);

const { data: boardTeams = [], isLoading: teamsLoading } = useBoardTeams(config.DEFAULT_BOARD_ID);  const boardTeamId = useMemo(() => {
    const team = boardTeams.find((t) => t.Board_Team_Code === equipoActivo);
    return team?.Board_Team_ID ?? null;
  }, [boardTeams, equipoActivo]);
const { data: columnConfig = [], isPending: columnConfigPending } = useTeamColumnConfig(config.DEFAULT_BOARD_ID, boardTeamId);
// Columnas reales, visibles y ordenadas — para el panel y el conteo de horas
  const boardColumns = useMemo(
    () =>
      (columnConfig ?? [])
        .filter((c) => c.Is_Visible)
        .sort((a, b) => a.Board_Column_Position - b.Board_Column_Position)
        .map((c) => ({
          slug:  c.Board_Column_Slug,
          name:  c.Board_Column_Name,
          color: c.Team_Column_Color ?? c.Board_Column_Color,
        })),
    [columnConfig],
  );
  const { data: users     = [] } = useUsers();
const { data: subTeams  = [] } = useSubTeams(boardTeamId);
const groupedMembers            = useSubTeamMembersGrouped(subTeams);
const { data: sprints   = [] } = useSprints();
  const { data: labels    = [] } = useLabelsByTeamId(config.DEFAULT_BOARD_ID, boardTeamId);

  const { data: externalRequest } = useQuery<Request>({
    queryKey: ['request', externalModalId],
    queryFn:  () => Requests.fetchById(externalModalId!),
    enabled:  !!externalModalId && !config.USE_MOCK && (() => {
      const inBoard = Object.values(data ?? {}).flat().some((r) => r.id === externalModalId);
      return !inBoard;
    })(),
    staleTime: 0,
    retry: 1,
  });

const { data: boardTemplates = [] } = useBoardTemplates(config.DEFAULT_BOARD_ID);

  const templateOptions = useMemo((): TemplateFilterOption[] => {
    return boardTemplates
      .filter((t) => {
        if (!t.Request_Template_Is_Active) return false;
        if (!t.Request_Template_Teams || t.Request_Template_Teams.length === 0) return true;
        if (boardTeamId === null) return true;
        return t.Request_Template_Teams.includes(boardTeamId);
      })
      .map((t) => {
        const seen:   Set<string>           = new Set();
        const fields: TemplateFieldOption[] = [];
        flattenTemplateFields(t.Request_Template_Form_Schema as TemplateExtraField[], seen, fields);
        return {
          id:     t.Request_Template_ID,
          label:  t.Request_Template_Name,
          icon:   t.Request_Template_Icon ?? '📋',
          color:  t.Request_Template_Color ?? undefined,
          fields,
        };
      })
      .filter((t) => t.fields.length > 0);
  }, [boardTemplates, boardTeamId]);
    
  const dynamicOptions = useMemo((): FilterDynamicOptions => ({
    assignee: users.map((u) => ({ value: u.User_Name, label: u.User_Name })),
    assigneeGrouped: groupedMembers
      .filter((g) => !g.isLoading)
      .map((g) => ({
        subTeamId:    String(g.subTeam.Sub_Team_ID),
        subTeamName:  g.subTeam.Sub_Team_Name,
        subTeamColor: g.subTeam.Sub_Team_Color,
        members:      g.members.map((m) => ({
          value: m.User_Name, // el kanban filtra por nombre, no por ID
          label: m.User_Name,
          email: m.User_Email,
        })),
      })),
    subequipo: subTeams.map((s) => ({ value: s.Sub_Team_Name, label: s.Sub_Team_Name })),
    sprint:    sprints.map((s) => ({ value: s.Sprint_Text, label: s.Sprint_Text, year: sprintYear(s), startDate: s.Sprint_Start_Date, endDate: s.Sprint_End_Date })),
    etiqueta:  labels.map((l) => ({ value: l.Label_Name, label: l.Label_Name })),
    templates: templateOptions,
  }), [users, groupedMembers, subTeams, sprints, labels, templateOptions]);
  

const {
    historial: mergedHistorial,
    loadMore:  loadMoreHistorial,
    hasMore:   historialHasMore,
    loading:   historialLoading,
  } = useHistorialLoadMore(equipoActivo, data?.historial ?? EMPTY_REQUESTS);

  const dataWithHistorial = useMemo(
    () => (data ? { ...data, historial: mergedHistorial } : data),
    [data, mergedHistorial],
  );

  const filteredData = useFilteredBoard(equipoActivo, dataWithHistorial);

  // Barra de horas: mismos filtros EXCEPTO resolutor, para que no se
  // colapse a una persona al filtrar y podamos resaltar al activo.
  const hoursData = useFilteredBoard(equipoActivo, dataWithHistorial, ['assignee']);

  /* ── Búsqueda global: materializa resultados que no están cargados
     (p.ej. históricos fuera de la página actual) al tope de su columna,
     solo mientras hay un query activo. Al limpiar, desaparecen. ── */
  const searchQuery = useSearchStore((s) => s.query);
  const { data: searchResults = [] } = useSearchRequests(equipoActivo, searchQuery);

  const boardWithSearch = useMemo(() => {
    if (!filteredData) return filteredData;
    const q = searchQuery.trim();
    if (!q || searchResults.length === 0) return filteredData;

    // IDs ya presentes en cualquier columna del board
    const presentIds = new Set<string>();
    for (const col of Object.values(filteredData)) {
      for (const r of col) presentIds.add(r.id);
    }

    // Agrupa los resultados faltantes por su columna real
    const toInject = new Map<string, Request[]>();
    for (const req of searchResults) {
      if (presentIds.has(req.id) || !req.columna) continue;
      if (!toInject.has(req.columna)) toInject.set(req.columna, []);
      toInject.get(req.columna)!.push(req);
    }

    if (toInject.size === 0) return filteredData;

    const next: BoardData = { ...filteredData };
    for (const [col, reqs] of toInject) {
      next[col] = [...reqs, ...(next[col] ?? [])];
    }
    return next;
  }, [filteredData, searchResults, searchQuery]);
  /* La estructura del kanban (equipos + config de columnas) carga aparte de los
     requests. Mantenemos el skeleton hasta que esté lista para no pintar el board
     con columnas por defecto y que luego "salte" a la estructura administrada. */
  const structureLoading =
    teamsLoading ||
    (boardTeamId !== null && columnConfigPending);

function handleMove(id: string, columna: KanbanColumna, movedBy?: number) {
    const columnId = columnMap?.[columna] ?? COLUMN_ID_FALLBACK[columna];
    mover({ id, columna, columnId, movedBy });
  }

  function handleModalId(id: string | null) {
    if (!id) { setExternalModalId(null); return; }
    const inBoard = Object.values(data ?? {}).flat().some((r) => r.id === id);
    if (!inBoard) setExternalModalId(id);
    else setExternalModalId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
  <BoardSearch
    board={filteredData ?? {}}
    equipo={equipoActivo}
    onSelectTicket={(id) => setOpenTicketSignal({ id, nonce: Date.now() })}
  />
  <BoardFilters boardId={equipoActivo} dynamicOptions={dynamicOptions} />
  <BoardCustomizationTrigger boardId={equipoActivo} columns={boardColumns} />
  {!isMobile && <KanbanZoomControl />}
  <MemberHoursBar
    filteredData={hoursData}
    groupedMembers={groupedMembers}
    boardId={equipoActivo}
    availableSlugs={boardColumns.map((c) => c.slug)}
  />
</div>

        {config.USE_MOCK && (
          <span style={{ fontSize: 10, color: 'var(--warn)', background: 'rgba(255,165,2,0.08)', border: '1px solid rgba(255,165,2,0.2)', borderRadius: 4, padding: '3px 10px', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, flexShrink: 0 }}>
            Modo Demo
          </span>
        )}
      </div>

{((isLoading && !data) || structureLoading) && (
        <KanbanSkeleton columns={boardColumns.length || 10} style={{ flex: 1 }} />
      )}

      {isError && !config.USE_MOCK && (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>
          Error al cargar las solicitudes.
        </p>
      )}

{boardWithSearch && !structureLoading && (
<KanbanBoard
          board={boardWithSearch}
          equipo={equipoActivo}
          columnConfig={columnConfig}
          onMove={handleMove}
          extraRequest={externalRequest ?? null}
          onModalId={handleModalId}
          openTicketSignal={openTicketSignal}
          onLoadMoreHistorial={loadMoreHistorial}
          historialHasMore={historialHasMore}
          historialLoading={historialLoading}
        />
        )}
    </div>
  );
}