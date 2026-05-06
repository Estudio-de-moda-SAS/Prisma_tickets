import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ArrowLeft, CalendarDays, ChevronDown, X, ExternalLink, Clock, User, ArrowRight, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useRole } from '@/auth/roles';
import { useBoardStore } from '@/store/boardStore';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS, EQUIPOS } from '@/features/requests/types';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import type { Request, Equipo, KanbanColumna, Prioridad } from '@/features/requests/types';

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info)',
  todo:            'var(--warn)',
  en_progreso:     'var(--accent)',
  hecho:           'var(--success)',
};

const COL_BG: Record<KanbanColumna, string> = {
  sin_categorizar: 'rgba(90,106,138,0.08)',
  icebox:          'rgba(96,165,250,0.08)',
  backlog:         'rgba(167,139,250,0.08)',
  todo:            'rgba(255,165,2,0.08)',
  en_progreso:     'rgba(0,200,255,0.08)',
  hecho:           'rgba(0,229,160,0.08)',
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  baja: 'var(--txt-muted)', media: 'var(--info)', alta: 'var(--warn)', critica: 'var(--danger)',
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

type FilterColumna = KanbanColumna | 'todas';

function getMonthOptions(requests: Request[]): { label: string; value: string }[] {
  if (!requests.length) return [];
  const now   = new Date();
  const dates = requests.map((r) => new Date(r.fechaApertura));
  const min   = new Date(Math.min(...dates.map((d) => d.getTime())));
  const options: { label: string; value: string }[] = [];
  const cur  = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur >= stop) {
    const value = format(cur, 'yyyy-MM');
    const label = format(cur, 'MMMM yyyy', { locale: es });
    options.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
    cur.setMonth(cur.getMonth() - 1);
  }
  return options;
}

export function TeamRequestsPage() {
  const { equipo: equipoParam } = useParams<{ equipo: string }>();
  const navigate                = useNavigate();
  const { Requests }            = useGraphServices();
  const { data: currentUser }   = useCurrentUser();

  const equipo = equipoParam as Equipo;
  const label  = EQUIPOS[equipo] ?? equipo;
  const c      = EQUIPO_COLORS[equipo] ?? { dot: 'var(--accent)', glow: 'var(--accent-glow)', border: 'var(--accent-border)' };
  const Icon   = EQUIPO_ICONS[equipo];

  const [filtro,        setFiltro]   = useState<FilterColumna>('todas');
  const [selectedMonth, setMonth]    = useState(format(new Date(), 'yyyy-MM'));
  const [dropdownOpen,  setDropdown] = useState(false);
  const [selected,      setSelected] = useState<Request | null>(null);

  const { data: todas = [], isLoading } = useQuery<Request[]>({
    queryKey: ['team-requests', equipo, currentUser?.User_ID],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(
          Object.values(MOCK_BOARD).flat().filter((r) => r.equipo.includes(equipo))
        )
      : () => Requests.fetchByRequestedBy(currentUser!.User_ID),
    enabled:  config.USE_MOCK || !!currentUser,
    staleTime: config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
  });

  // Filtrar por equipo en modo real
  const allRequests = config.USE_MOCK
    ? todas
    : todas.filter((r) => r.equipo.includes(equipo));

  const monthOptions = useMemo(() => getMonthOptions(allRequests), [allRequests]);

  const byMonth = useMemo(() =>
    allRequests.filter((r) => r.fechaApertura.startsWith(selectedMonth)),
    [allRequests, selectedMonth]
  );

  const filtradas = filtro === 'todas' ? byMonth : byMonth.filter((r) => r.columna === filtro);

  const conteos = byMonth.reduce<Partial<Record<KanbanColumna, number>>>((acc, r) => {
    acc[r.columna] = (acc[r.columna] ?? 0) + 1;
    return acc;
  }, {});

  const selectedLabel = monthOptions.find((o) => o.value === selectedMonth)?.label
    ?? format(new Date(), 'MMMM yyyy', { locale: es });

  const tabColumnas: KanbanColumna[] = ['sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'hecho'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960, margin: '0 auto', width: '100%', padding: '4px 0 48px' }}>

      <button onClick={() => navigate('/home')}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt-muted)'; }}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--txt-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0', transition: 'color 0.12s' }}
      >
        <ArrowLeft size={13} /> Volver al inicio
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: c.dot + '18', border: `1px solid ${c.dot}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {Icon && <Icon size={16} style={{ color: c.dot }} />}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}>
              Mis solicitudes — <span style={{ color: c.dot }}>{label}</span>
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--txt-muted)' }}>
              {isLoading ? 'Cargando…' : `${filtradas.length} solicitud${filtradas.length !== 1 ? 'es' : ''} en ${selectedLabel}`}
            </p>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <button onClick={() => setDropdown((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, border: `1px solid ${dropdownOpen ? c.dot + '60' : 'var(--border)'}`, background: dropdownOpen ? c.dot + '0E' : 'var(--bg-card)', color: dropdownOpen ? c.dot : 'var(--txt)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <CalendarDays size={13} />
            {selectedLabel}
            <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: dropdownOpen ? 'rotate(180deg)' : 'none', color: 'var(--txt-muted)' }} />
          </button>

          {dropdownOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 180, maxHeight: 280, overflowY: 'auto' }}>
              {monthOptions.map((opt) => (
                <button key={opt.value} onClick={() => { setMonth(opt.value); setDropdown(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12, fontWeight: 500, background: selectedMonth === opt.value ? c.dot + '14' : 'transparent', color: selectedMonth === opt.value ? c.dot : 'var(--txt)', border: 'none', cursor: 'pointer', borderLeft: selectedMonth === opt.value ? `2px solid ${c.dot}` : '2px solid transparent', transition: 'background 0.1s' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        <TabBtn active={filtro === 'todas'} label="Todas" count={byMonth.length} color="var(--txt)" onClick={() => setFiltro('todas')} />
        {tabColumnas.map((col) => {
          const count = conteos[col] ?? 0;
          if (count === 0) return null;
          return <TabBtn key={col} active={filtro === col} label={KANBAN_COLUMNAS[col]} count={count} color={COL_COLOR[col]} bg={COL_BG[col]} onClick={() => setFiltro(col)} />;
        })}
      </div>

      {isLoading && <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>}

      {!isLoading && filtradas.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13 }}>
          {filtro === 'todas' ? `No tienes solicitudes en ${selectedLabel}.` : `No hay solicitudes en "${KANBAN_COLUMNAS[filtro as KanbanColumna]}" para ${selectedLabel}.`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtradas.map((r) => <RequestRow key={r.id} request={r} onClick={() => setSelected(r)} />)}
      </div>

      {selected && createPortal(
        <RequestDetailModal request={selected} onClose={() => setSelected(null)} />,
        document.getElementById('portal-root') ?? document.body
      )}
    </div>
  );
}

function TabBtn({ active, label, count, color, bg, onClick }: { active: boolean; label: string; count: number; color: string; bg?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: active ? 600 : 400, background: active ? (bg ?? 'var(--bg-surface)') : 'transparent', border: active ? `1px solid ${color}40` : '1px solid transparent', color: active ? color : 'var(--txt-muted)', transition: 'all 0.12s', cursor: 'pointer' }}
    >
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
  const isVencida = r.deadline && new Date(r.deadline) < new Date();

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? 'var(--bg-hover)' : 'var(--bg-card)', border: `1px solid ${hovered ? `${prioColor}45` : 'var(--border-subtle)'}`, borderRadius: 8, display: 'grid', gridTemplateColumns: '3px 1fr auto', overflow: 'hidden', transform: hovered ? 'translateX(3px)' : 'translateX(0)', transition: 'all 0.15s ease', cursor: 'pointer' }}
    >
      <div style={{ background: prioColor, minHeight: '100%' }} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-dim)', letterSpacing: 1 }}>#{r.id.slice(-6).toUpperCase()}</span>
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
        {r.deadline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isVencida ? 'var(--danger)' : 'var(--txt-muted)' }}>
            <Calendar size={10} />{format(new Date(r.deadline), 'd MMM', { locale: es })}
          </div>
        )}
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

function RequestDetailModal({ request: r, onClose }: { request: Request; onClose: () => void }) {
  const navigate            = useNavigate();
  const role                = useRole();
  const { setEquipoActivo } = useBoardStore();
  const prioColor = PRIORIDAD_COLOR[r.prioridad];
  const colColor  = COL_COLOR[r.columna];
  const colBg     = COL_BG[r.columna];
  const isVencida = r.deadline && new Date(r.deadline) < new Date();

  const equiposAccesibles: Equipo[] = r.equipo.filter((eq) =>
    role.role === 'admin' || (role.role === 'member' && role.team === eq)
  );

  function irAlBoard(eq: Equipo) { setEquipoActivo(eq); navigate('/'); onClose(); }

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24, backdropFilter: 'blur(2px)' }}
    >
      <div style={{ width: '100%', maxWidth: 580, maxHeight: '88vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${prioColor}, transparent)` }} />

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-dim)', letterSpacing: 1 }}>#{r.id.slice(-6).toUpperCase()}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: colColor, background: colBg, border: `1px solid ${colColor}35` }}>{KANBAN_COLUMNAS[r.columna]}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, color: prioColor, background: `${prioColor}15`, border: `1px solid ${prioColor}30` }}>{PRIORIDAD_LABEL[r.prioridad]}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.35, margin: 0 }}>{r.titulo}</h2>

          {r.descripcion && (
            <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.65, margin: 0, padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 7, border: '1px solid var(--border-subtle)' }}>{r.descripcion}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <MetaBlock label="Solicitante"><PersonChip name={r.solicitante} color="var(--accent-2)" /></MetaBlock>
            <MetaBlock label="Asignado">
              {r.assignees?.length > 0 ? <PersonChip name={r.assignees[0].userName} color="#7c3aed" /> : <span style={{ fontSize: 13, color: 'var(--txt-muted)' }}>Sin asignar</span>}
            </MetaBlock>
            <MetaBlock label="Fecha de apertura">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--txt)' }}>
                <Clock size={13} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />
                {format(new Date(r.fechaApertura), "d 'de' MMMM yyyy", { locale: es })}
              </div>
            </MetaBlock>
            {r.deadline ? (
              <MetaBlock label="Fecha límite">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: isVencida ? 'var(--danger)' : 'var(--warn)' }}>
                  <Calendar size={13} style={{ flexShrink: 0 }} />
                  {format(new Date(r.deadline), "d 'de' MMMM yyyy", { locale: es })}
                </div>
              </MetaBlock>
            ) : <div />}
            {r.categoria.length > 0 && (
              <MetaBlock label="Etiquetas">
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {r.categoria.map((cat) => (
                    <span key={cat} style={{ fontSize: 11, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px' }}>{cat}</span>
                  ))}
                </div>
              </MetaBlock>
            )}
            {r.equipo.length > 0 && (
              <MetaBlock label="Equipos">
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {r.equipo.map((eq) => (
                    <span key={eq} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.18)', borderRadius: 4, padding: '2px 8px' }}>{EQUIPOS[eq]}</span>
                  ))}
                </div>
              </MetaBlock>
            )}
          </div>

          {r.progreso > 0 && (
            <MetaBlock label={`Progreso — ${r.progreso}%`}>
              <div style={{ height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${r.progreso}%`, height: '100%', background: r.progreso === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3 }} />
              </div>
            </MetaBlock>
          )}

          {equiposAccesibles.length > 0 && (
            <div style={{ padding: '14px 16px', background: 'var(--accent-glow)', border: '1px solid var(--accent-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 3px' }}>Ver en Board</p>
                <p style={{ fontSize: 12, color: 'var(--txt-muted)', margin: 0 }}>Navega al tablero del equipo para gestionar esta solicitud.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {equiposAccesibles.map((eq) => (
                  <button key={eq} onClick={() => irAlBoard(eq)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 6, cursor: 'pointer', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}
                  >
                    <ExternalLink size={13} /> Board de {EQUIPOS[eq]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 7 }}>{label}</span>
      {children}
    </div>
  );
}

function PersonChip({ name, color }: { name: string; color: string }) {
  const ini = name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{ini}</div>
      <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{name}</span>
    </div>
  );
}