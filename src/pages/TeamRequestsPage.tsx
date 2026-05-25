import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ArrowRight, Clock, User, Inbox, UserCheck, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useSprints } from '@/features/requests/hooks/useSprints';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS, EQUIPOS, PRIORIDADES } from '@/features/requests/types';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import type { Request, Equipo, KanbanColumna, Prioridad } from '@/features/requests/types';
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
type SprintFilter   = number | 'sin_sprint' | 'todas';

function sprintDotColor(sp: Sprint) {
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

function fmtD(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export function TeamRequestsPage() {
  const { equipo: equipoParam } = useParams<{ equipo: string }>();
  const navigate                = useNavigate();
  const { Requests }            = useGraphServices();
  const { data: currentUser }   = useCurrentUser();
  const { data: sprints = [] }  = useSprints();

  const equipo = equipoParam as Equipo;
  const label  = EQUIPOS[equipo] ?? equipo;
  const c      = EQUIPO_COLORS[equipo] ?? { dot: 'var(--accent)', glow: 'var(--accent-glow)', border: 'var(--accent-border)' };
  const Icon   = EQUIPO_ICONS[equipo];

  const [vista,          setVista]      = useState<Vista>('mias');
  const [filtroColumna,  setFiltroCol]  = useState<FilterColumna>('todas');
  const [filtroPrio,     setFiltroPrio] = useState<FilterPrioridad>('todas');
  const [filtroSprint,   setFiltroSp]   = useState<SprintFilter>('todas');
  const [search,         setSearch]     = useState('');
  const [dropdownOpen,   setDropdown]   = useState(false);
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
      now >= new Date(s.Sprint_Start_Date) && now <= new Date(s.Sprint_End_Date)
    ) ?? null;
  }, [sprints]);

  // Setear sprint activo como default cuando carguen los sprints
  const [sprintDefaultSet, setSprintDefaultSet] = useState(false);
  if (!sprintDefaultSet && sprintActivo && filtroSprint === 'todas') {
    setFiltroSp(sprintActivo.Sprint_ID);
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

    // Sprint
    if (filtroSprint !== 'todas') {
      if (filtroSprint === 'sin_sprint') {
        result = result.filter((r) => r.sprintId === null);
      } else {
        result = result.filter((r) => r.sprintId === filtroSprint);
      }
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
  }, [allRequests, filtroSprint, filtroColumna, filtroPrio, search]);

  // Conteos para pills de columna (sobre el filtro de sprint+prioridad+búsqueda, sin filtro de columna)
  const baseParaConteos = useMemo(() => {
    let result = allRequests;
    if (filtroSprint !== 'todas') {
      result = filtroSprint === 'sin_sprint'
        ? result.filter((r) => r.sprintId === null)
        : result.filter((r) => r.sprintId === filtroSprint);
    }
    if (filtroPrio !== 'todas') result = result.filter((r) => r.prioridad === filtroPrio);
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
  }, [allRequests, filtroSprint, filtroPrio, search]);

  const conteos = baseParaConteos.reduce<Partial<Record<KanbanColumna, number>>>((acc, r) => {
    acc[r.columna] = (acc[r.columna] ?? 0) + 1;
    return acc;
  }, {});

  // Label del sprint seleccionado
  const selectedSprintLabel = useMemo(() => {
    if (filtroSprint === 'todas')     return 'Todos los sprints';
    if (filtroSprint === 'sin_sprint') return 'Sin sprint';
    const sp = sprints.find((s) => s.Sprint_ID === filtroSprint);
    return sp?.Sprint_Text ?? 'Sprint';
  }, [filtroSprint, sprints]);

  const tabColumnas: KanbanColumna[] = ['sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'ready_to_deploy', 'hecho'];

  function handleVista(v: Vista) {
    setVista(v);
    setFiltroCol('todas');
    setFiltroPrio('todas');
  }

  function clearSearch() { setSearch(''); }

  const hasActiveFilters = filtroColumna !== 'todas' || filtroPrio !== 'todas' || search.trim() !== '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960, margin: '0 auto', width: '100%', padding: '4px 0 48px' }}>

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
            {Icon && <Icon size={16} style={{ color: c.dot }} />}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}>
              {vista === 'mias' ? 'Mis solicitudes' : 'Asignadas a mí'} — <span style={{ color: c.dot }}>{label}</span>
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--txt-muted)' }}>
              {isLoading ? 'Cargando…' : `${filtradas.length} solicitud${filtradas.length !== 1 ? 'es' : ''} · ${selectedSprintLabel}`}
            </p>
          </div>
        </div>

        {/* Selector de sprint */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setDropdown((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, border: `1px solid ${dropdownOpen ? c.dot + '60' : 'var(--border)'}`, background: dropdownOpen ? c.dot + '0E' : 'var(--bg-card)', color: dropdownOpen ? c.dot : 'var(--txt)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          >
            {filtroSprint !== 'todas' && filtroSprint !== 'sin_sprint' && (() => {
              const sp = sprints.find((s) => s.Sprint_ID === filtroSprint);
              return sp ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: sprintDotColor(sp), display: 'inline-block', flexShrink: 0 }} /> : null;
            })()}
            {selectedSprintLabel}
            <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: dropdownOpen ? 'rotate(180deg)' : 'none', color: 'var(--txt-muted)' }} />
          </button>

          {dropdownOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>

              {/* Todos los sprints */}
              <button onClick={() => { setFiltroSp('todas'); setDropdown(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: filtroSprint === 'todas' ? 600 : 400, background: filtroSprint === 'todas' ? c.dot + '14' : 'transparent', color: filtroSprint === 'todas' ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: filtroSprint === 'todas' ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt-muted)', display: 'inline-block', flexShrink: 0 }} />
                Todos los sprints
              </button>

              {/* Sin sprint */}
              {sprintsConSolicitudes.hasSinSprint && (
                <button onClick={() => { setFiltroSp('sin_sprint'); setDropdown(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: filtroSprint === 'sin_sprint' ? 600 : 400, background: filtroSprint === 'sin_sprint' ? c.dot + '14' : 'transparent', color: filtroSprint === 'sin_sprint' ? c.dot : 'var(--txt-muted)', border: 'none', cursor: 'pointer', borderLeft: filtroSprint === 'sin_sprint' ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s', fontStyle: 'italic' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-subtle)', display: 'inline-block', flexShrink: 0 }} />
                  Sin sprint
                </button>
              )}

              {/* Divider si hay sprints */}
              {sprints.length > 0 && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />}

              {/* Lista de sprints ordenados por fecha desc */}
              {[...sprints]
                .sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime())
                .map((sp) => {
                  const active = filtroSprint === sp.Sprint_ID;
                  const dot    = sprintDotColor(sp);
                  return (
                    <button key={sp.Sprint_ID} onClick={() => { setFiltroSp(sp.Sprint_ID); setDropdown(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? c.dot + '14' : 'transparent', color: active ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: active ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{sp.Sprint_Text}</span>
                      <span style={{ fontSize: 9, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(sp.Sprint_Start_Date)} → {fmtD(sp.Sprint_End_Date)}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
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
        <button onClick={() => { setFiltroCol('todas'); setFiltroPrio('todas'); setSearch(''); }}
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
            : filtroColumna !== 'todas' || filtroPrio !== 'todas'
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
            <span key={eq} style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 3, padding: '2px 7px' }}>{EQUIPOS[eq]}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
