import { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart2, Globe, LayoutGrid,
  TrendingUp, TrendingDown, Minus,
  CheckCircle2, Clock, AlertTriangle, Layers,
  PlusCircle, XCircle, Star, Target,
  ChevronDown, Users, Search, Check, X,
} from 'lucide-react';
import { useStatsData }             from '@/features/requests/hooks/useStatsData';
import { useUsers }                  from '@/features/requests/hooks/useUsers';
import { useSubTeams }               from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped }  from '@/features/requests/hooks/useSubTeamMembers';
import type { ColStatReal, PriStatReal } from '@/features/requests/hooks/useStatsData';
import type { Sprint }     from '@/features/requests/hooks/useSprints';
import { useBoardTeams }       from '@/features/requests/hooks/useBoardMetadata';
import { useStatsStartConfig } from '@/features/requests/hooks/useKanbanAdmin';
import { config }          from '@/config';
import '@/styles/stats.css';

/* ─── Chart.js ─────────────────────────────────────────────── */
type ChartInstance = { destroy: () => void };
type ChartWindow   = Window & typeof globalThis & { Chart?: new (c: HTMLCanvasElement, cfg: unknown) => ChartInstance };
type TooltipCtx    = { raw: unknown };

function loadChartJs(cb: () => void) {
  if ((window as ChartWindow).Chart) { cb(); return; }
  const s = document.createElement('script');
  s.src    = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  s.onload = cb;
  document.head.appendChild(s);
}

/* ─── Helpers visuales ─────────────────────────────────────── */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#0055cc,#00c8ff)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0f6e56,#00e5a0)',
  'linear-gradient(135deg,#854F0B,#EF9F27)',
  'linear-gradient(135deg,#185FA5,#378ADD)',
  'linear-gradient(135deg,#3B6D11,#97C459)',
  'linear-gradient(135deg,#534AB7,#a78bfa)',
  'linear-gradient(135deg,#8B1A1A,#ff6b6b)',
];
const avatarBg = (id: number)   => AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
const fmtInits = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
const fmtDate  = (d: Date)      => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(d);

/* ════════════════════════════════════════════════════════════
   Átomos UI
════════════════════════════════════════════════════════════ */

function KPICard({ label, value, sub, trend, accent, trendGood = 'up' }: {
  label: string; value: string | number; sub: string;
  trend: 'up' | 'down' | 'neutral'; accent: string; trendGood?: 'up' | 'down';
}) {
  const isPos = (trend === 'up' && trendGood === 'up') || (trend === 'down' && trendGood === 'down');
  const color = trend === 'neutral' ? 'var(--txt-muted)' : isPos ? 'var(--success)' : 'var(--danger)';
  const Icon  = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className="stats-kpi-card">
      <div className="stats-kpi-card__accent" style={{ background: accent }} />
      <span className="stats-kpi-card__label">{label}</span>
      <span className="stats-kpi-card__value">{value}</span>
      <div className="stats-kpi-card__sub" style={{ color }}><Icon size={10} /><span>{sub}</span></div>
    </div>
  );
}

function SprintCard({ label, value, sub, color, icon: Icon, pulse = false }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ElementType; pulse?: boolean;
}) {
  return (
    <div className="scard" style={{ '--scard-color': color } as React.CSSProperties}>
      <div className="scard__icon-wrap"><Icon size={16} className={pulse ? 'scard__icon--pulse' : ''} /></div>
      <div className="scard__body">
        <span className="scard__label">{label}</span>
        <span className="scard__value">{value}</span>
        {sub && <span className="scard__sub">{sub}</span>}
      </div>
      <div className="scard__glow" />
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="stats-bar-row">
      <span className="stats-bar-row__label">{label}</span>
      <div className="stats-bar-row__track"><div className="stats-bar-row__fill" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="stats-bar-row__val">{value}</span>
    </div>
  );
}

function BarChart({ id, data, height = 180 }: { id: string; data: ColStatReal[] | PriStatReal[]; height?: number }) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const chartRef        = useRef<ChartInstance | null>(null);
  const [ready, setReady] = useState(!!(window as ChartWindow).Chart);
  useEffect(() => { loadChartJs(() => setReady(true)); }, []);
  useEffect(() => {
    if (!ready) return;
    const canvas  = canvasRef.current;
    const ChartJs = (window as ChartWindow).Chart;
    if (!canvas || !ChartJs) return;
    if (chartRef.current) chartRef.current.destroy();
    const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#5a6a8a' : '#888';
    chartRef.current = new ChartJs(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderColor: data.map(d => d.color), borderWidth: 1, borderRadius: 5, borderSkipped: false }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: TooltipCtx) => ` ${ctx.raw} solicitudes` } } },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 11 }, autoSkip: false }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor }, border: { display: false }, beginAtZero: true },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, ready]);
  return <div style={{ position: 'relative', height }}><canvas ref={canvasRef} id={id} role="img" aria-label="Gráfico de barras" /></div>;
}

function ScoreDonut({ realizado, total, label = 'velocidad' }: { realizado: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((realizado / total) * 100) : 0;
  const r = 36, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <div className="score-donut">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-surface)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--accent)" strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          strokeDashoffset={circ * 0.25} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x="44" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--txt)">{pct}%</text>
        <text x="44" y="54" textAnchor="middle" fontSize="9" fill="var(--txt-muted)">{label}</text>
      </svg>
      <div className="score-donut__labels">
        <div className="score-donut__row"><span className="score-donut__dot" style={{ background: 'var(--accent)' }} /><span>Realizado <strong>{realizado}</strong></span></div>
        <div className="score-donut__row"><span className="score-donut__dot" style={{ background: 'var(--bg-surface)' }} /><span>Total <strong>{total}</strong></span></div>
      </div>
    </div>
  );
}

function SprintSelector({ sprints, selectedIds, onChange }: {
  sprints:     Sprint[];
  selectedIds: number[];
  onChange:    (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
  };

  const label =
    selectedIds.length === 0
      ? 'Todos los sprints'
      : selectedIds.length === 1
      ? (sprints.find(s => s.Sprint_ID === selectedIds[0])?.Sprint_Text ?? 'Sprint')
      : `${selectedIds.length} sprints`;

  return (
    <div className="sprint-selector" ref={ref}>
<button className="sprint-selector__btn" onClick={() => setOpen(o => !o)}>
        <Target size={12} />
        <span>{label}</span>
        {selectedIds.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            className="sprint-selector__clear-btn"
            title="Ver todos los sprints"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onChange([]); }
            }}
          >
            <X size={9} />
          </span>
        )}
        <ChevronDown size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
      </button>
      
      {open && (
        <div className="sprint-selector__menu">
          <button
            className={['sprint-selector__item', selectedIds.length === 0 ? 'sprint-selector__item--active' : ''].join(' ')}
            onClick={() => onChange([])}
          >
            Todos los sprints
          </button>
          {[...sprints].sort((a, b) => a.Sprint_ID - b.Sprint_ID).map(s => {
            const isSelected = selectedIds.includes(s.Sprint_ID);
            return (
              <button
                key={s.Sprint_ID}
                className={['sprint-selector__item', isSelected ? 'sprint-selector__item--active' : ''].join(' ')}
                onClick={() => toggle(s.Sprint_ID)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: 3,
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}>
                    {isSelected && <Check size={8} style={{ color: 'var(--bg)' }} />}
                  </span>
                  {s.Sprint_Text}
                </span>
                <span className="sprint-selector__dates">
                  {fmtDate(new Date(s.Sprint_Start_Date))} → {fmtDate(new Date(s.Sprint_End_Date))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionDivider({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="stats-section-divider">
      <span className="stats-section-divider__label"><Icon size={10} />{label}</span>
      <div className="stats-section-divider__line" />
    </div>
  );
}

/* ── User Filter Dropdown ───────────────────────────────────── */
function UserFilterDropdown({
  boardTeamId, selectedUserId, onSelect,
}: {
  boardTeamId:    number | null;
  selectedUserId: number | null;
  onSelect:       (id: number | null) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref                 = useRef<HTMLDivElement>(null);

  const { data: subTeams = [] }   = useSubTeams(boardTeamId);
  const groupedMembers             = useSubTeamMembersGrouped(subTeams);
  const { data: rawUsers = [] }   = useUsers() as { data: Array<{ User_ID: number; User_Name: string; User_Email: string; Is_Active?: boolean | null }> };

  const allFlat = useMemo(() =>
    boardTeamId !== null
      ? groupedMembers.flatMap(g => g.members)
      : rawUsers.filter(u => u.Is_Active !== false),
    [boardTeamId, groupedMembers, rawUsers],
  );

  const selUser  = allFlat.find(u => u.User_ID === selectedUserId);
  const selName  = selUser?.User_Name ?? '';
  const matches  = (name: string, email = '') =>
    !search ||
    name.toLowerCase().includes(search.toLowerCase()) ||
    email.toLowerCase().includes(search.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="user-filter" ref={ref}>
      <button className="user-filter__btn" onClick={() => setOpen(o => !o)}>
        {selectedUserId ? (
          <>
            <div className="user-filter__avatar-mini" style={{ background: avatarBg(selectedUserId) }}>
              {fmtInits(selName)}
            </div>
            <span className="user-filter__btn-name">{selName.split(' ').slice(0, 2).join(' ')}</span>
            <button className="user-filter__clear" title="Ver todo el equipo"
              onClick={e => { e.stopPropagation(); onSelect(null); }}>
              <X size={10} />
            </button>
          </>
        ) : (
          <><Users size={12} /><span>Todo el equipo</span><ChevronDown size={10} style={{ opacity: 0.5, marginLeft: 2 }} /></>
        )}
      </button>

      {open && (
        <div className="user-filter__menu">
          <div className="user-filter__search">
            <Search size={11} />
            <input placeholder="Buscar miembro…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>

          {selectedUserId !== null && (
            <button className="user-filter__item user-filter__item--reset"
              onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}>
              <div className="user-filter__avatar"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={13} style={{ color: 'var(--txt-muted)' }} />
              </div>
              <div className="user-filter__info">
                <span className="user-filter__name" style={{ color: 'var(--txt-muted)' }}>Todo el equipo</span>
              </div>
            </button>
          )}

          {/* ── Vista por equipo: sub-equipos ─────────────── */}
          {boardTeamId !== null && (
            <>
              {groupedMembers.length === 0 && (
                <div className="user-filter__empty">No hay sub-equipos configurados para este equipo</div>
              )}
              {groupedMembers.map(({ subTeam, members, isLoading }) => {
                const filtered = members.filter(m => matches(m.User_Name, m.User_Email));
                if (search && !isLoading && filtered.length === 0) return null;
                return (
                  <div key={subTeam.Sub_Team_ID} className="user-filter__group">
                    <div className="user-filter__group-label">
                      <span className="user-filter__team-dot" style={{ background: subTeam.Sub_Team_Color }} />
                      {subTeam.Sub_Team_Name}
                    </div>
                    {isLoading && (
                      <div className="user-filter__sub-msg">Cargando…</div>
                    )}
                    {!isLoading && filtered.length === 0 && !search && (
                      <div className="user-filter__sub-msg">
                        Sin integrantes en este sub-equipo
                      </div>
                    )}
                    {filtered.map(member => (
                      <button key={member.User_ID}
                        className={['user-filter__item', selectedUserId === member.User_ID ? 'user-filter__item--active' : ''].join(' ')}
                        onClick={() => { onSelect(member.User_ID); setOpen(false); setSearch(''); }}>
                        <div className="user-filter__avatar" style={{ background: avatarBg(member.User_ID) }}>
                          {fmtInits(member.User_Name)}
                        </div>
                        <div className="user-filter__info">
                          <span className="user-filter__name">{member.User_Name}</span>
                          <span className="user-filter__email">{member.User_Email}</span>
                        </div>
                        {selectedUserId === member.User_ID && <Check size={12} className="user-filter__check" />}
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Vista global: todos los usuarios plano ─────── */}
          {boardTeamId === null && (() => {
            const visible = rawUsers.filter(u => u.Is_Active !== false && matches(u.User_Name));
            if (visible.length === 0) return <div className="user-filter__empty">Sin resultados</div>;
            return visible.map(user => (
              <button key={user.User_ID}
                className={['user-filter__item', selectedUserId === user.User_ID ? 'user-filter__item--active' : ''].join(' ')}
                onClick={() => { onSelect(user.User_ID); setOpen(false); setSearch(''); }}>
                <div className="user-filter__avatar" style={{ background: avatarBg(user.User_ID) }}>
                  {fmtInits(user.User_Name)}
                </div>
                <div className="user-filter__info">
                  <span className="user-filter__name">{user.User_Name}</span>
                  <span className="user-filter__email">{user.User_Email ?? ''}</span>
                </div>
                {selectedUserId === user.User_ID && <Check size={12} className="user-filter__check" />}
              </button>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
/* ════════════════════════════════════════════════════════════
   StatsPage — Dashboard unificado
════════════════════════════════════════════════════════════ */
export function StatsPage() {
  const GLOBAL_KEY = 'global';

  const [sprintIds,  setSprintIds]  = useState<number[]>([]);
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [teamTab,    setTeamTab]    = useState<string>(GLOBAL_KEY);
  const autoSelectedTeam = useRef(false);
  const sprintAutoSelected = useRef(false); 

  const { data: boardTeams = [] }  = useBoardTeams(config.DEFAULT_BOARD_ID);
  const { data: statsStartConfig } = useStatsStartConfig(config.DEFAULT_BOARD_ID);
  const teamColorMap = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Color])), [boardTeams]);
  const teamNameMap  = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Name])),  [boardTeams]);

  const isGlobal = teamTab === GLOBAL_KEY;

  const stats = useStatsData(sprintIds, boardTeams, userFilter, isGlobal ? null : teamTab, statsStartConfig ?? undefined);
const sprintDatesBadge = useMemo(() => {
    const sel = stats.sprints.filter(s => sprintIds.includes(s.Sprint_ID));
    if (sel.length === 0) return null;
    if (sel.length === 1)
      return `${fmtDate(new Date(sel[0].Sprint_Start_Date))} — ${fmtDate(new Date(sel[0].Sprint_End_Date))}`;
    const sorted = [...sel].sort((a, b) => a.Sprint_Start_Date.localeCompare(b.Sprint_Start_Date));
    return `${fmtDate(new Date(sorted[0].Sprint_Start_Date))} — ${fmtDate(new Date(sorted[sorted.length - 1].Sprint_End_Date))}`;
  }, [stats.sprints, sprintIds]);
/** Board_Team_ID del tab seleccionado — null en Global */
  const selectedBoardTeamId = useMemo(
    () => isGlobal ? null : (boardTeams.find(t => t.Board_Team_Code === teamTab)?.Board_Team_ID ?? null),
    [isGlobal, boardTeams, teamTab],
  );
  // Auto-selecciona sprint activo; si no hay ninguno activo, el más reciente
useEffect(() => {
  if (stats.sprints.length > 0 && !sprintAutoSelected.current) {
    sprintAutoSelected.current = true;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const active = stats.sprints.find(s =>
      s.Sprint_Start_Date.slice(0, 10) <= today && today <= s.Sprint_End_Date.slice(0, 10)
    );
    const fallback = [...stats.sprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0];
    setSprintIds([(active ?? fallback).Sprint_ID]);
  }
}, [stats.sprints]);

  // Auto-selecciona primer equipo al cargar
  useEffect(() => {
    if (boardTeams.length > 0 && !autoSelectedTeam.current) {
      autoSelectedTeam.current = true;
      setTeamTab(boardTeams[0].Board_Team_Code);
    }
  }, [boardTeams]);

  // Resetear userFilter al cambiar de equipo (evita filtros huérfanos)
  const prevTeamTab = useRef(teamTab);
  useEffect(() => {
    if (prevTeamTab.current !== teamTab) {
      prevTeamTab.current = teamTab;
      setUserFilter(null);
    }
  }, [teamTab]);

  const sp        = stats.sprint;
  const gn        = stats.general;
  const boardData = isGlobal ? null : stats.boards[teamTab];
  const maxPri    = boardData ? Math.max(...boardData.porPrioridad.map(p => p.value), 1) : 1;

const totalSprint = sp.planeadas + sp.postPlanning;
const pctCompleto = totalSprint > 0 ? Math.round((sp.completadas / totalSprint) * 100) : 0;
  const teamColor     = isGlobal ? 'var(--accent)' : (teamColorMap[teamTab] ?? 'var(--accent)');

  return (
    <div className="stats-page">

      {/* ═══ Tabs primarios de equipo ══════════════════════════ */}
      <div className="stats-primary-tabs">
        {boardTeams.map(t => (
          <button key={t.Board_Team_Code}
            className={['stats-primary-tab', teamTab === t.Board_Team_Code ? 'stats-primary-tab--active' : ''].join(' ')}
            style={{ '--tab-color': teamColorMap[t.Board_Team_Code] ?? 'var(--accent)' } as React.CSSProperties}
            onClick={() => setTeamTab(t.Board_Team_Code)}>
            <span className="stats-primary-tab__dot" style={{ background: teamColorMap[t.Board_Team_Code] ?? '#888' }} />
            {t.Board_Team_Name}
          </button>
        ))}
        <button
          className={['stats-primary-tab', isGlobal ? 'stats-primary-tab--active' : ''].join(' ')}
          style={{ '--tab-color': 'var(--txt-muted)' } as React.CSSProperties}
          onClick={() => setTeamTab(GLOBAL_KEY)}>
          <Globe size={12} />
          Global
        </button>
      </div>

      {/* ═══ Control bar ════════════════════════════════════════ */}
      <div className="stats-control-bar">
        <div className="stats-control-bar__left">
          <SprintSelector sprints={stats.sprints} selectedIds={sprintIds} onChange={setSprintIds} />
          {sprintDatesBadge && <span className="sprint-dates-badge">{sprintDatesBadge}</span>}
          <div className="sprint-progress-pill">
            <div className="sprint-progress-pill__fill" style={{ width: `${pctCompleto}%` }} />
            <span>{pctCompleto}% completado</span>
          </div>
        </div>
        <div className="stats-control-bar__right">
          <a href="/"    className="stats-quick-link"><LayoutGrid size={11} /> Board</a>
          <UserFilterDropdown
            boardTeamId={selectedBoardTeamId}
            selectedUserId={userFilter}
            onSelect={setUserFilter}
          />
        </div>
      </div>

      {/* ═══ Estados ════════════════════════════════════════════ */}
      {stats.isLoading && <div className="stats-loading"><div className="stats-loading__spinner" /><span>Cargando estadísticas…</span></div>}
      {stats.isError   && <div className="stats-error"><AlertTriangle size={16} /><span>Error al cargar los datos.</span></div>}

      {/* ═══ Dashboard ══════════════════════════════════════════ */}
      {!stats.isLoading && !stats.isError && (
        <>
          {/* ── Sprint (siempre visible, filtrado por equipo activo) ── */}
          <SectionDivider icon={Target} label={isGlobal ? 'Sprint activo — todos los equipos' : `Sprint activo — ${teamNameMap[teamTab] ?? teamTab}`} />

          <div className="scard-grid scard-grid--5">
            <SprintCard label="Planeadas"     value={sp.planeadas}   color="#378ADD" icon={Layers} />
            <SprintCard label="Activas"       value={sp.activas}     color="#00c8ff" icon={Clock} pulse />
            <SprintCard label="Completadas"   value={sp.completadas} color="#1D9E75" icon={CheckCircle2} />
            <SprintCard label="Post-planning" value={sp.postPlanning} sub="Fuera del scope original" color="#EF9F27" icon={PlusCircle} />
            <SprintCard label="Bloqueadas"    value={sp.bloqueadas}  sub="En Icebox"
              color={sp.bloqueadas > 0 ? '#ff4757' : '#1D9E75'}
              icon={sp.bloqueadas > 0 ? XCircle : CheckCircle2} />
          </div>

          <div className="stats-mid-grid">
            <div className="stats-panel">
              <div className="stats-panel__header">
                <span className="stats-panel__title"><Star size={12} /> Puntaje &amp; Cumplimiento</span>
                <span className="stats-velocity-badge" style={{ color: sp.cumplimiento >= 80 ? 'var(--success)' : sp.cumplimiento >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
                  {sp.cumplimiento}% cumplimiento
                </span>
              </div>
              <div className="score-panel">
                <ScoreDonut realizado={sp.puntajeReal} total={sp.meta} label="cumplimiento" />
                <div className="score-panel__detail">
                  <div className="score-detail-row"><span>Pts. planeados</span><strong>{sp.puntajePlaneado}</strong></div>
                  <div className="score-detail-row"><span>Meta (83.3%)</span><strong>{sp.meta}</strong></div>
                  <div className="score-detail-row"><span>Pts. realizados</span><strong style={{ color: 'var(--accent)' }}>{sp.puntajeRealizado}</strong></div>
                  <div className="score-detail-row">
                    <span>Penalización</span>
                    <strong style={{ color: 'var(--danger)' }}>
                      {sp.penalizacion > 0 ? `−${sp.penalizacion}` : '—'}
                    </strong>
                  </div>
                  <div className="score-detail-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
                    <span>Pts. reales</span>
                    <strong style={{ color: 'var(--accent)' }}>{sp.puntajeReal}</strong>
                  </div>
                  <p className="score-detail-note">Puntos: Baja 1 · Media 2 · Alta 4 · Crítica 6</p>
                </div>
              </div>
            </div>
            <div className="stats-panel">
              <div className="stats-panel__header"><span className="stats-panel__title"><BarChart2 size={12} /> Actividad del mes</span></div>
              <div className="month-stats">
                <div className="month-stat">
                  <span className="month-stat__num" style={{ color: 'var(--accent)' }}>{sp.planeadasMes}</span>
                  <span className="month-stat__label">Planeadas en el mes</span>
                  <p className="month-stat__note">Total creadas, excluye bloqueadas e icebox</p>
                </div>
                <div className="month-stat-divider" />
                <div className="month-stat">
                  <span className="month-stat__num" style={{ color: 'var(--success)' }}>{sp.cerradasMes}</span>
                  <span className="month-stat__label">Cerradas en el mes</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Vista GLOBAL ──────────────────────────────────── */}
          {isGlobal && (
            <>
              <SectionDivider icon={Globe} label="Visión global — todos los equipos" />
              <div className="stats-kpi-grid">
                <KPICard label="Total solicitudes"   value={gn.total}                sub="Todas las activas"  trend="neutral" accent="var(--accent)" />
                <KPICard label="Resueltas"           value={gn.resueltas}            sub="En columna Hecho"   trend="up"      accent="var(--success)" />
                <KPICard label="Tasa de resolución"  value={`${gn.tasaGlobal}%`}     sub="Resueltas / total"  trend={gn.tasaGlobal > 60 ? 'up' : 'down'} accent="var(--warn)" />
                <KPICard label="Tiempo prom. cierre" value={`${gn.tiempoPromedio}d`} sub="Apertura → cierre"  trend="neutral" accent="var(--info)" />
              </div>
              <div className="stats-mid-grid">
                <div className="stats-panel">
                  <div className="stats-panel__header"><span className="stats-panel__title">Solicitudes por equipo</span></div>
                  <div className="stats-chart-legend">
                    {gn.porEquipo.map(e => (
                      <span key={e.equipo} className="stats-legend-item">
                        <span className="stats-legend-sq" style={{ background: teamColorMap[e.equipo] ?? '#888' }} />
                        {teamNameMap[e.equipo] ?? e.equipo}
                      </span>
                    ))}
                  </div>
                  <BarChart id="teamChart" data={gn.porEquipo.map(e => ({ label: (teamNameMap[e.equipo] ?? e.equipo).split(' ')[0], value: e.creadas, color: teamColorMap[e.equipo] ?? '#888888' }))} />
                </div>
                <div className="stats-panel">
                  <div className="stats-panel__header"><span className="stats-panel__title">Cumplimiento por equipo</span></div>
                  {Object.entries(stats.boards).map(([code, bd]) => (
                    <BarRow key={code} label={(teamNameMap[code] ?? code).split(' ')[0]} value={bd.cumplimiento} max={100} color={teamColorMap[code] ?? '#888'} />
                  ))}
                </div>
              </div>
              <div className="stats-comp-grid">
                {gn.porEquipo.map(e => (
                  <div key={e.equipo} className="stats-comp-card" style={{ borderTopColor: teamColorMap[e.equipo] ?? '#888' }}>
                    <div className="stats-comp-card__name">{teamNameMap[e.equipo] ?? e.equipo}</div>
                    <div className="stats-comp-stat"><span>Creadas</span><span>{e.creadas}</span></div>
                    <div className="stats-comp-stat"><span>Resueltas</span><span>{e.resueltas}</span></div>
                    <div className="stats-comp-stat"><span>Cumplimiento</span><span>{stats.boards[e.equipo]?.cumplimiento ?? 0}%</span></div>
                    <div className="stats-comp-stat"><span>Críticas</span><span style={{ color: e.criticas > 0 ? 'var(--danger)' : 'var(--success)' }}>{e.criticas}</span></div>
                    <div className="stats-comp-stat"><span>Score</span><span style={{ color: 'var(--accent)' }}>{e.score}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Vista EQUIPO ESPECÍFICO ───────────────────────── */}
          {!isGlobal && boardData && (
            <>
              <SectionDivider icon={LayoutGrid} label={`Detalle — ${teamNameMap[teamTab] ?? teamTab}`} />
              <div className="stats-kpi-grid">
                <KPICard label="Solicitudes"      value={boardData.creadas}    sub="En este equipo"          trend="neutral" accent={teamColor} />
                <KPICard label="Resueltas"        value={boardData.resueltas}  sub="Columna Hecho"           trend="up"      accent="var(--success)" />
                <KPICard label="Cumplimiento" value={`${boardData.cumplimiento}%`} sub="Pts. reales vs meta" trend={boardData.cumplimiento >= 80 ? 'up' : boardData.cumplimiento >= 50 ? 'neutral' : 'down'} accent="var(--warn)" />
                <KPICard label="Críticas activas" value={boardData.criticas}
                  sub={boardData.criticas > 0 ? `${boardData.criticas} sin resolver` : '✓ ninguna'}
                  trend={boardData.criticas > 0 ? 'down' : 'neutral'} accent="var(--danger)" trendGood="down" />
              </div>
              <div className="stats-mid-grid">
                <div className="stats-panel">
                  <div className="stats-panel__header">
                    <span className="stats-panel__title">Distribución en el board</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{teamNameMap[teamTab] ?? teamTab}</span>
                  </div>
                  <div className="stats-chart-legend">
                    {boardData.porColumna.filter(c => c.value > 0).map(c => (
                      <span key={c.label} className="stats-legend-item">
                        <span className="stats-legend-sq" style={{ background: c.color.replace('0.7)', '1)') }} />{c.label}
                      </span>
                    ))}
                  </div>
                  <BarChart id={`boardChart-${teamTab}`} data={boardData.porColumna} />
                </div>
                <div className="stats-panel">
                  <div className="stats-panel__header"><span className="stats-panel__title">Por prioridad</span></div>
                  {boardData.porPrioridad.map(p => <BarRow key={p.label} label={p.label} value={p.value} max={maxPri} color={p.color} />)}
                </div>
              </div>

              {boardData.resolutores.length > 0 && (
                <div className="stats-panel">
                  <div className="stats-panel__header">
                    <span className="stats-panel__title">Top resolutores — {teamNameMap[teamTab] ?? teamTab}</span>
                    {userFilter && <span style={{ fontSize: 11, color: 'var(--accent)' }}>· filtro activo</span>}
                  </div>
                  <div className="stats-resolutores">
                    {boardData.resolutores.map(r => (
                      <button key={r.userId}
                        className={['stats-resolutor', userFilter === r.userId ? 'stats-resolutor--active' : ''].join(' ')}
                        onClick={() => setUserFilter(userFilter === r.userId ? null : r.userId)}
                        title={userFilter === r.userId ? 'Quitar filtro' : `Filtrar por ${r.nombre}`}>
                        <div className="stats-resolutor__avatar" style={{ background: r.avatarBg }}>{r.initials}</div>
                        <span className="stats-resolutor__name">{r.nombre}</span>
                        <span className="stats-resolutor__count">{r.resueltas} res.</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}