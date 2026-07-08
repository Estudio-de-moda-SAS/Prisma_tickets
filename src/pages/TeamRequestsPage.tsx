import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ArrowRight, Clock, User, Inbox, UserCheck, Search, X, Users, Layers, Tag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useSprints } from '@/features/requests/hooks/useSprints';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped } from '@/features/requests/hooks/useSubTeamMembers';
import { useLabelsByTeamId } from '@/features/requests/hooks/useLabels';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS, EQUIPOS, PRIORIDADES } from '@/features/requests/types';
import { teamColors, getTeamIcon } from '@/components/layout/siderbarConstants';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import type { Request, KanbanColumna, Prioridad } from '@/features/requests/types';
import { RequestModal } from '@/features/requests/components/RequestModal';

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar:  'var(--txt-muted)',
  icebox:           '#60a5fa',
  backlog:          'var(--info)',
  todo:             'var(--warn)',
  en_progreso:      'var(--accent)',
  en_revision_qas:  '#fb7121',
  cliente_review:   '#34d399',
  ready_to_deploy:  '#a78bfa',
  hecho:            'var(--success)',
  historial:        'var(--txt-muted)',
};

const COL_BG: Record<KanbanColumna, string> = {
  sin_categorizar:  'rgba(90,106,138,0.08)',
  icebox:           'rgba(96,165,250,0.08)',
  backlog:          'rgba(167,139,250,0.08)',
  todo:             'rgba(255,165,2,0.08)',
  en_progreso:      'rgba(0,200,255,0.08)',
  en_revision_qas:  'rgba(251,113,33,0.08)',
  cliente_review:   'rgba(52,211,153,0.08)',
  ready_to_deploy:  'rgba(167,139,250,0.08)',
  hecho:            'rgba(0,229,160,0.08)',
  historial:        'rgba(90,106,138,0.08)',
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  baja: 'var(--txt-muted)', media: 'var(--info)', alta: 'var(--warn)', critica: 'var(--danger)',
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

type FilterColumna  = KanbanColumna | 'todas';
type FilterPrioridad = Prioridad | 'todas';
type Vista          = 'mias' | 'asignadas';
type SprintFilterItem = number | 'sin_sprint';
type OpenDropdown   = 'sprint' | 'assignees' | 'subteams' | 'labels' | null;

function sprintDotColor(sp: Sprint) {
  if (!sp.Sprint_Start_Date || !sp.Sprint_End_Date) return '#7f77dd'; // histórico
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

function fmtD(iso: string | null) {
  if (!iso) return '—';
  const parts = iso.split('T')[0].split('-');
  if (parts.length < 3) return '—';
  const [y, m, d] = parts;
  return `${d}/${m}/${y.slice(2)}`;
}

export function TeamRequestsPage() {
  const { equipo: equipoParam } = useParams<{ equipo: string }>();
  const navigate                = useNavigate();
  const { Requests }            = useGraphServices();
  const { data: currentUser }   = useCurrentUser();
  const { data: sprints = [] }  = useSprints();

  const equipo = equipoParam ?? '';
  const { data: boardTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const activeTeam = boardTeams.find((t) => t.Board_Team_Code === equipo);
  const label      = activeTeam?.Board_Team_Name ?? EQUIPOS[equipo] ?? equipo;
  const c          = teamColors(activeTeam?.Board_Team_Color ?? '#00c8ff');
  const TeamIcon   = getTeamIcon(activeTeam?.Board_Team_Icon);
  const boardTeamId = activeTeam?.Board_Team_ID ?? null;

  // Data para filtros nuevos
  const { data: subTeams = [] } = useSubTeams(boardTeamId);
  const groupedMembers          = useSubTeamMembersGrouped(subTeams);
  const { data: teamLabels = [] } = useLabelsByTeamId(config.DEFAULT_BOARD_ID, boardTeamId);

  const [vista,          setVista]      = useState<Vista>('mias');
  const [filtroColumna,  setFiltroCol]  = useState<FilterColumna>('todas');
  const [filtroPrio,     setFiltroPrio] = useState<FilterPrioridad>('todas');
  const [filtroSprints,  setFiltroSprints] = useState<SprintFilterItem[]>([]);
  const [filtroAssignees, setFiltroAssignees] = useState<number[]>([]);
  const [filtroSubTeams,  setFiltroSubTeams]  = useState<number[]>([]);
  const [filtroLabels,    setFiltroLabels]    = useState<number[]>([]);
  const [search,         setSearch]     = useState('');
  const [openDropdown,   setOpenDropdown] = useState<OpenDropdown>(null);
  const [selected,       setSelected]   = useState<Request | null>(null);

  // ── Queries ──
  const { data: mias = [], isLoading: loadingMias } = useQuery<Request[]>({
    queryKey: ['team-requests-mias', equipo, currentUser?.User_ID],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(Object.values(MOCK_BOARD).flat().filter((r) => r.equipo.includes(equipo)))
      : () => Requests.fetchByRequestedBy(currentUser!.User_ID),
    enabled:  config.USE_MOCK || !!currentUser,
    staleTime: config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
  });

  const { data: asignadas = [], isLoading: loadingAsignadas } = useQuery<Request[]>({
    queryKey: ['team-requests-asignadas', equipo, currentUser?.User_ID],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(
          Object.values(MOCK_BOARD).flat().filter((r) =>
            r.equipo.includes(equipo) &&
            r.assignees.some((a) => a.userId === currentUser?.User_ID)
          )
        )
      : () => Requests.fetchByAssignedTo(currentUser!.User_ID),
    enabled:  config.USE_MOCK || !!currentUser,
    staleTime: config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
  });

  const isLoading  = vista === 'mias' ? loadingMias : loadingAsignadas;
  const todasRaw   = vista === 'mias' ? mias : asignadas;
  const allRequests = config.USE_MOCK ? todasRaw : todasRaw.filter((r) => r.equipo.includes(equipo));

  // ── Sprint activo por defecto ──
  const sprintActivo = useMemo(() => {
    const now = new Date();
    return sprints.find((s) =>
      s.Sprint_Start_Date && s.Sprint_End_Date &&
      now >= new Date(s.Sprint_Start_Date) && now <= new Date(s.Sprint_End_Date)
    ) ?? null;
  }, [sprints]);

  const [sprintDefaultSet, setSprintDefaultSet] = useState(false);
  if (!sprintDefaultSet && sprintActivo && filtroSprints.length === 0) {
    setFiltroSprints([sprintActivo.Sprint_ID]);
    setSprintDefaultSet(true);
  }

  // ── Sprints que tienen solicitudes (para el selector) ──
  const sprintsConSolicitudes = useMemo(() => {
    const combined = config.USE_MOCK
      ? [...mias, ...asignadas]
      : [...mias, ...asignadas].filter((r) => r.equipo.includes(equipo));
    const ids = new Set(combined.map((r) => r.sprintId).filter(Boolean));
    const hasSinSprint = combined.some((r) => r.sprintId === null);
    return { ids, hasSinSprint };
  }, [mias, asignadas, equipo]);

  // ── Filtrado ──
  const filtradas = useMemo(() => {
    let result = allRequests;

    // Sprint (multi)
    if (filtroSprints.length > 0) {
      const includeSinSprint = filtroSprints.includes('sin_sprint');
      const sprintIdSet = new Set(filtroSprints.filter((x): x is number => typeof x === 'number'));
      result = result.filter((r) =>
        (includeSinSprint && r.sprintId === null) ||
        (r.sprintId !== null && sprintIdSet.has(r.sprintId))
      );
    }

    // Assignees (cualquier match)
    if (filtroAssignees.length > 0) {
      const set = new Set(filtroAssignees);
      result = result.filter((r) => r.assignees.some((a) => set.has(a.userId)));
    }

    // Sub-equipos (cualquier match)
    if (filtroSubTeams.length > 0) {
      const set = new Set(filtroSubTeams);
      result = result.filter((r) => r.subTeamIds.some((id) => set.has(id)));
    }

    // Labels (cualquier match)
    if (filtroLabels.length > 0) {
      const set = new Set(filtroLabels);
      result = result.filter((r) => r.labelIds.some((id) => set.has(id)));
    }

    // Columna
    if (filtroColumna !== 'todas') {
      result = result.filter((r) => r.columna === filtroColumna);
    }

    // Prioridad
    if (filtroPrio !== 'todas') {
      result = result.filter((r) => r.prioridad === filtroPrio);
    }

    // Búsqueda
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) =>
        r.titulo.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        r.solicitante.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allRequests, filtroSprints, filtroAssignees, filtroSubTeams, filtroLabels, filtroColumna, filtroPrio, search]);

  // Conteos para pills de columna/prioridad (sin filtro de columna ni prioridad)
  const baseParaConteos = useMemo(() => {
    let result = allRequests;
    if (filtroSprints.length > 0) {
      const includeSinSprint = filtroSprints.includes('sin_sprint');
      const sprintIdSet = new Set(filtroSprints.filter((x): x is number => typeof x === 'number'));
      result = result.filter((r) =>
        (includeSinSprint && r.sprintId === null) ||
        (r.sprintId !== null && sprintIdSet.has(r.sprintId))
      );
    }
    if (filtroAssignees.length > 0) {
      const set = new Set(filtroAssignees);
      result = result.filter((r) => r.assignees.some((a) => set.has(a.userId)));
    }
    if (filtroSubTeams.length > 0) {
      const set = new Set(filtroSubTeams);
      result = result.filter((r) => r.subTeamIds.some((id) => set.has(id)));
    }
    if (filtroLabels.length > 0) {
      const set = new Set(filtroLabels);
      result = result.filter((r) => r.labelIds.some((id) => set.has(id)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) =>
        r.titulo.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        r.solicitante.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allRequests, filtroSprints, filtroAssignees, filtroSubTeams, filtroLabels, search]);

  const conteos = baseParaConteos.reduce<Partial<Record<KanbanColumna, number>>>((acc, r) => {
    acc[r.columna] = (acc[r.columna] ?? 0) + 1;
    return acc;
  }, {});

  const selectedSprintLabel = useMemo(() => {
    if (filtroSprints.length === 0) return 'Todos los sprints';
    if (filtroSprints.length === 1) {
      const v = filtroSprints[0];
      if (v === 'sin_sprint') return 'Sin sprint';
      const sp = sprints.find((s) => s.Sprint_ID === v);
      return sp?.Sprint_Text ?? 'Sprint';
    }
    return `${filtroSprints.length} sprints`;
  }, [filtroSprints, sprints]);

  const tabColumnas: KanbanColumna[] = ['sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'ready_to_deploy', 'hecho'];

  function handleVista(v: Vista) {
    setVista(v);
    setFiltroCol('todas');
    setFiltroPrio('todas');
  }

  function clearSearch() { setSearch(''); }

  function toggleId(arr: number[], id: number): number[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  const hasActiveFilters =
    filtroColumna !== 'todas' ||
    filtroPrio !== 'todas' ||
    search.trim() !== '' ||
    filtroAssignees.length > 0 ||
    filtroSubTeams.length > 0 ||
    filtroLabels.length > 0;

  function clearAllFilters() {
    setFiltroCol('todas');
    setFiltroPrio('todas');
    setSearch('');
    setFiltroAssignees([]);
    setFiltroSubTeams([]);
    setFiltroLabels([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, margin: '0 auto', width: '100%', padding: '4px 30px 48px' }}>

      <button onClick={() => navigate('/')}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt-muted)'; }}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--txt-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0', transition: 'color 0.12s' }}
      >
        <ArrowLeft size={13} /> Volver al Kanban
      </button>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: c.dot + '18', border: `1px solid ${c.dot}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TeamIcon size={16} style={{ color: c.dot }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}>
              {vista === 'mias' ? 'Solicitudes' : 'Asignadas a mí'} — <span style={{ color: c.dot }}>{label}</span>
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--txt-muted)' }}>
              {isLoading ? 'Cargando…' : `${filtradas.length} solicitud${filtradas.length !== 1 ? 'es' : ''} · ${selectedSprintLabel}`}
            </p>
          </div>
        </div>

        {/* Selector de sprint (multi) */}
        <SprintDropdown
          isOpen={openDropdown === 'sprint'}
          onToggle={() => setOpenDropdown((o) => o === 'sprint' ? null : 'sprint')}
          onClose={() => setOpenDropdown(null)}
          accent={c.dot}
          selectedSprintLabel={selectedSprintLabel}
          filtroSprints={filtroSprints}
          setFiltroSprints={setFiltroSprints}
          sprints={sprints}
          sprintsConSolicitudes={sprintsConSolicitudes}
        />
      </div>

      {/* ── Toggle vista ── */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <VistaBtn active={vista === 'mias'} icon={<Inbox size={13} />} label="Mis solicitudes"
          count={config.USE_MOCK ? mias.length : mias.filter((r) => r.equipo.includes(equipo)).length}
          color={c.dot} onClick={() => handleVista('mias')} />
        <VistaBtn active={vista === 'asignadas'} icon={<UserCheck size={13} />} label="Asignadas a mí"
          count={config.USE_MOCK ? asignadas.length : asignadas.filter((r) => r.equipo.includes(equipo)).length}
          color={c.dot} onClick={() => handleVista('asignadas')} />
      </div>

      {/* ── Buscador ── */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: search ? 'var(--accent)' : 'var(--txt-muted)', pointerEvents: 'none', transition: 'color 0.15s' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, descripción, solicitante o ID…"
          style={{ width: '100%', padding: '10px 36px 10px 34px', borderRadius: 8, border: `1px solid ${search ? 'rgba(0,200,255,0.35)' : 'var(--border-subtle)'}`, background: 'var(--bg-card)', color: 'var(--txt)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = search ? 'rgba(0,200,255,0.35)' : 'var(--border-subtle)'; }}
        />
        {search && (
          <button onClick={clearSearch} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--txt)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt-muted)'; }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Filtros multi-select: Asignados / Subequipos / Etiquetas ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Asignados */}
        <MultiFilterDropdown
          icon={<Users size={12} />}
          label="Asignados"
          accent={c.dot}
          selectedCount={filtroAssignees.length}
          isOpen={openDropdown === 'assignees'}
          onToggle={() => setOpenDropdown((o) => o === 'assignees' ? null : 'assignees')}
          onClose={() => setOpenDropdown(null)}
          onClear={() => setFiltroAssignees([])}
          emptyMsg="Sin miembros para este equipo"
        >
          {groupedMembers.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>
              Sin miembros para este equipo
            </div>
          )}
          {groupedMembers.map((g) => (
            <div key={g.subTeam.Sub_Team_ID}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px 4px', fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--txt-muted)', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.subTeam.Sub_Team_Color, display: 'inline-block' }} />
                {g.subTeam.Sub_Team_Name}
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 600, color: 'var(--txt-dim)' }}>{g.members.length}</span>
              </div>
              {g.isLoading && (
                <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Cargando…</div>
              )}
              {!g.isLoading && g.members.length === 0 && (
                <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin miembros</div>
              )}
              {g.members.map((m) => {
                const active = filtroAssignees.includes(m.User_ID);
                return (
                  <button key={m.User_ID}
                    onClick={() => setFiltroAssignees((arr) => toggleId(arr, m.User_ID))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 14px 7px 22px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? c.dot + '14' : 'transparent', color: active ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: active ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${active ? c.dot : 'var(--border)'}`, background: active ? c.dot : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4.2L3 5.7L6.5 2.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.User_Name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </MultiFilterDropdown>

        {/* Sub-equipos */}
        <MultiFilterDropdown
          icon={<Layers size={12} />}
          label="Sub-equipos"
          accent={c.dot}
          selectedCount={filtroSubTeams.length}
          isOpen={openDropdown === 'subteams'}
          onToggle={() => setOpenDropdown((o) => o === 'subteams' ? null : 'subteams')}
          onClose={() => setOpenDropdown(null)}
          onClear={() => setFiltroSubTeams([])}
          emptyMsg="Sin sub-equipos"
        >
          {subTeams.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>
              Sin sub-equipos
            </div>
          )}
          {subTeams.map((st) => {
            const active = filtroSubTeams.includes(st.Sub_Team_ID);
            return (
              <button key={st.Sub_Team_ID}
                onClick={() => setFiltroSubTeams((arr) => toggleId(arr, st.Sub_Team_ID))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? c.dot + '14' : 'transparent', color: active ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: active ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${active ? c.dot : 'var(--border)'}`, background: active ? c.dot : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4.2L3 5.7L6.5 2.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.Sub_Team_Color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{st.Sub_Team_Name}</span>
              </button>
            );
          })}
        </MultiFilterDropdown>

        {/* Etiquetas */}
        <MultiFilterDropdown
          icon={<Tag size={12} />}
          label="Etiquetas"
          accent={c.dot}
          selectedCount={filtroLabels.length}
          isOpen={openDropdown === 'labels'}
          onToggle={() => setOpenDropdown((o) => o === 'labels' ? null : 'labels')}
          onClose={() => setOpenDropdown(null)}
          onClear={() => setFiltroLabels([])}
          emptyMsg="Sin etiquetas"
        >
          {teamLabels.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>
              Sin etiquetas
            </div>
          )}
          {teamLabels.map((l) => {
            const active = filtroLabels.includes(l.Label_ID);
            return (
              <button key={l.Label_ID}
                onClick={() => setFiltroLabels((arr) => toggleId(arr, l.Label_ID))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? c.dot + '14' : 'transparent', color: active ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: active ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${active ? c.dot : 'var(--border)'}`, background: active ? c.dot : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4.2L3 5.7L6.5 2.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={{ fontSize: 12 }}>{l.Label_Icon}</span>
                <span style={{ flex: 1, color: active ? c.dot : l.Label_Color }}>{l.Label_Name}</span>
              </button>
            );
          })}
        </MultiFilterDropdown>
      </div>

      {/* ── Filtros: columna + prioridad ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Pills columna */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, flex: 1 }}>
          <TabBtn active={filtroColumna === 'todas'} label="Todas" count={baseParaConteos.length} color="var(--txt)" onClick={() => setFiltroCol('todas')} />
          {tabColumnas.map((col) => {
            const count = conteos[col] ?? 0;
            if (count === 0) return null;
            return <TabBtn key={col} active={filtroColumna === col} label={KANBAN_COLUMNAS[col]} count={count} color={COL_COLOR[col]} bg={COL_BG[col]} onClick={() => setFiltroCol(col)} />;
          })}
        </div>

        {/* Pills prioridad */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, flexShrink: 0 }}>
          {(['todas', 'critica', 'alta', 'media', 'baja'] as (FilterPrioridad)[]).map((p) => {
            const active = filtroPrio === p;
            const color  = p === 'todas' ? 'var(--txt-muted)' : PRIORIDAD_COLOR[p as Prioridad];
            const count  = p === 'todas' ? baseParaConteos.length : baseParaConteos.filter((r) => r.prioridad === p).length;
            if (p !== 'todas' && count === 0) return null;
            return (
              <button key={p} onClick={() => setFiltroPrio(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: active ? 700 : 400, background: active ? `${color}18` : 'transparent', border: active ? `1px solid ${color}40` : '1px solid transparent', color: active ? color : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                {p !== 'todas' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />}
                {p === 'todas' ? 'Todas' : PRIORIDADES[p as Prioridad]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset filtros */}
      {hasActiveFilters && (
        <button onClick={clearAllFilters}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt-muted)'; }}>
          <X size={11} /> Limpiar filtros
        </button>
      )}

      {isLoading && <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>}

      {!isLoading && filtradas.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13 }}>
          {search.trim()
            ? `Sin resultados para "${search}".`
            : hasActiveFilters
              ? 'Sin solicitudes con estos filtros.'
              : vista === 'mias'
                ? `No tienes solicitudes en ${selectedSprintLabel}.`
                : `No tienes solicitudes asignadas en ${selectedSprintLabel}.`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtradas.map((r) => <RequestRow key={r.id} request={r} onClick={() => setSelected(r)} />)}
      </div>

      {selected && (
        <RequestModal
          request={selected}
          equipo={equipo}
          onClose={() => setSelected(null)}
          onMove={() => { /* no-op */ }}
          onMoveWithClosure={() => { /* no-op */ }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Sprint Dropdown — multi-select
   ============================================================ */
function SprintDropdown({
  isOpen, onToggle, onClose, accent,
  selectedSprintLabel, filtroSprints, setFiltroSprints,
  sprints, sprintsConSolicitudes,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  accent: string;
  selectedSprintLabel: string;
  filtroSprints: SprintFilterItem[];
  setFiltroSprints: React.Dispatch<React.SetStateAction<SprintFilterItem[]>>;
  sprints: Sprint[];
  sprintsConSolicitudes: { ids: Set<number | null>; hasSinSprint: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, onClose]);

  function toggleItem(item: SprintFilterItem) {
    setFiltroSprints((arr) =>
      arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
    );
  }

  const sinSprintActive = filtroSprints.includes('sin_sprint');
  const selectedCount   = filtroSprints.length;
  const hasSelection    = selectedCount > 0;

  // Para el chip al lado del label cuando hay 1 sprint seleccionado
  const singleSprintDot = (() => {
    if (filtroSprints.length !== 1) return null;
    const v = filtroSprints[0];
    if (v === 'sin_sprint') return 'var(--border-subtle)';
    const sp = sprints.find((s) => s.Sprint_ID === v);
    return sp ? sprintDotColor(sp) : null;
  })();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, border: `1px solid ${isOpen || hasSelection ? accent + '60' : 'var(--border)'}`, background: isOpen || hasSelection ? accent + '0E' : 'var(--bg-card)', color: isOpen || hasSelection ? accent : 'var(--txt)', fontSize: 12, fontWeight: hasSelection ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
      >
        {singleSprintDot && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: singleSprintDot, display: 'inline-block', flexShrink: 0 }} />
        )}
        {selectedSprintLabel}
        {selectedCount > 1 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: accent + '20', color: accent, border: `1px solid ${accent}35` }}>
            {selectedCount}
          </span>
        )}
        <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none', color: 'var(--txt-muted)' }} />
      </button>

      {isOpen && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 260, maxHeight: 360, display: 'flex', flexDirection: 'column' }}>
          {hasSelection && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>
                {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setFiltroSprints([])}
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                <X size={10} /> Limpiar
              </button>
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sprintsConSolicitudes.hasSinSprint && (
              <button onClick={() => toggleItem('sin_sprint')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: sinSprintActive ? 600 : 400, background: sinSprintActive ? accent + '14' : 'transparent', color: sinSprintActive ? accent : 'var(--txt-muted)', border: 'none', cursor: 'pointer', borderLeft: sinSprintActive ? `2px solid ${accent}` : '2px solid transparent', transition: 'background 0.1s', fontStyle: 'italic' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${sinSprintActive ? accent : 'var(--border)'}`, background: sinSprintActive ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sinSprintActive && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4.2L3 5.7L6.5 2.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-subtle)', display: 'inline-block', flexShrink: 0 }} />
                Sin sprint
              </button>
            )}

            {sprintsConSolicitudes.hasSinSprint && sprints.length > 0 && (
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            )}

            {[...sprints]
              .sort((a, b) => {
                const ta = a.Sprint_Start_Date ? new Date(a.Sprint_Start_Date).getTime() : -Infinity;
                const tb = b.Sprint_Start_Date ? new Date(b.Sprint_Start_Date).getTime() : -Infinity;
                return tb - ta;
              })
              .map((sp) => {
                const active = filtroSprints.includes(sp.Sprint_ID);
                const dot    = sprintDotColor(sp);
                return (
                  <button key={sp.Sprint_ID} onClick={() => toggleItem(sp.Sprint_ID)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? accent + '14' : 'transparent', color: active ? accent : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: active ? `2px solid ${accent}` : '2px solid transparent', transition: 'background 0.1s' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${active ? accent : 'var(--border)'}`, background: active ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4.2L3 5.7L6.5 2.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{sp.Sprint_Text}</span>
                    <span style={{ fontSize: 9, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(sp.Sprint_Start_Date)} → {fmtD(sp.Sprint_End_Date)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Multi-select Filter Dropdown
   ============================================================ */
function MultiFilterDropdown({
  icon, label, accent, selectedCount,
  isOpen, onToggle, onClose, onClear,
  children, emptyMsg,
}: {
  icon: React.ReactNode;
  label: string;
  accent: string;
  selectedCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onClear: () => void;
  children: React.ReactNode;
  emptyMsg?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, onClose]);

  const active = selectedCount > 0 || isOpen;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${active ? accent + '60' : 'var(--border-subtle)'}`, background: active ? accent + '0E' : 'var(--bg-card)', color: active ? accent : 'var(--txt-muted)', fontSize: 12, fontWeight: selectedCount > 0 ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
        {icon}
        {label}
        {selectedCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: accent + '20', color: accent, border: `1px solid ${accent}35` }}>
            {selectedCount}
          </span>
        )}
        <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 240, maxHeight: 360, display: 'flex', flexDirection: 'column' }}>
          {selectedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>
                {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
              </span>
              <button onClick={onClear}
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                <X size={10} /> Limpiar
              </button>
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {children}
          </div>
          {!children && emptyMsg && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>{emptyMsg}</div>
          )}
        </div>
      )}
    </div>
  );
}

function VistaBtn({ active, icon, label, count, color, onClick }: {
  active: boolean; icon: React.ReactNode; label: string;
  count: number; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 400, background: active ? `${color}18` : 'transparent', border: active ? `1px solid ${color}40` : '1px solid transparent', color: active ? color : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
      {icon}
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: active ? `${color}20` : 'var(--bg-surface)', color: active ? color : 'var(--txt-muted)', border: `1px solid ${active ? color + '35' : 'var(--border-subtle)'}`, transition: 'all 0.15s' }}>
        {count}
      </span>
    </button>
  );
}

function TabBtn({ active, label, count, color, bg, onClick }: { active: boolean; label: string; count: number; color: string; bg?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: active ? 600 : 400, background: active ? (bg ?? 'var(--bg-surface)') : 'transparent', border: active ? `1px solid ${color}40` : '1px solid transparent', color: active ? color : 'var(--txt-muted)', transition: 'all 0.12s', cursor: 'pointer' }}>
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, background: active ? `${color}20` : 'var(--bg-surface)', color: active ? color : 'var(--txt-muted)', padding: '1px 6px', borderRadius: 8 }}>{count}</span>
    </button>
  );
}

function RequestRow({ request: r, onClick }: { request: Request; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const prioColor = PRIORIDAD_COLOR[r.prioridad];
  const colColor  = COL_COLOR[r.columna];
  const colBg     = COL_BG[r.columna];

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? 'var(--bg-hover)' : 'var(--bg-card)', border: `1px solid ${hovered ? `${prioColor}45` : 'var(--border-subtle)'}`, borderRadius: 8, display: 'grid', gridTemplateColumns: '3px 1fr auto', overflow: 'hidden', transform: hovered ? 'translateX(3px)' : 'translateX(0)', transition: 'all 0.15s ease', cursor: 'pointer' }}>
      <div style={{ background: prioColor, minHeight: '100%' }} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-dim)', letterSpacing: 1 }}>#{r.id.slice(-6).toUpperCase()}</span>
          {r.sprintName && (
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px' }}>
              {r.sprintName}
            </span>
          )}
          {r.categoria.map((cat) => (
            <span key={cat} style={{ fontSize: 9, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px' }}>{cat}</span>
          ))}
        </div>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)', margin: 0, lineHeight: 1.4 }}>{r.titulo}</p>
        {r.descripcion && <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>{r.descripcion.length > 110 ? r.descripcion.slice(0, 110) + '…' : r.descripcion}</p>}
        {r.progreso > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${r.progreso}%`, height: '100%', background: r.progreso === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', minWidth: 28, textAlign: 'right' }}>{r.progreso}%</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: colColor, background: colBg, border: `1px solid ${colColor}30`, borderRadius: 4, padding: '2px 8px' }}>{KANBAN_COLUMNAS[r.columna]}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: prioColor, background: `${prioColor}15`, border: `1px solid ${prioColor}30`, borderRadius: 4, padding: '2px 8px' }}>{PRIORIDAD_LABEL[r.prioridad]}</span>
          {r.assignees?.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-muted)' }}><ArrowRight size={11} />{r.assignees[0].userName}</span>}
        </div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, minWidth: 120, borderLeft: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-muted)' }}>
          <Clock size={11} />{format(new Date(r.fechaApertura), 'd MMM yyyy', { locale: es })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt-muted)' }}>
          <User size={10} /><span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.solicitante}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {r.equipo.map((eq) => (
            <span key={eq} style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 3, padding: '2px 7px' }}>{EQUIPOS[eq] ?? eq}</span>          ))}
        </div>
      </div>
    </div>
  );
}