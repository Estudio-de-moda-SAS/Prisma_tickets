import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Globe, LayoutGrid,
  TrendingUp, TrendingDown, Minus,
  CheckCircle2, Clock, AlertTriangle, Layers,
  PlusCircle, XCircle, Star, Target,
  ChevronDown, Users, Search, Check, X,
} from 'lucide-react';
import { useStatsData }             from '@/features/requests/hooks/useStatsData';
import { useUsers }                  from '@/features/requests/hooks/useUsers';
import { useSubTeams, useSubTeamsMulti } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped }  from '@/features/requests/hooks/useSubTeamMembers';
import type { ColStatReal, PriStatReal } from '@/features/requests/hooks/useStatsData';
import { isBlockedLabelName } from '@/features/requests/hooks/useStatsData';
import { useLabelsByTeamId } from '@/features/requests/hooks/useLabels';
import type { Sprint }     from '@/features/requests/hooks/useSprints';
import { useBoardTeams }       from '@/features/requests/hooks/useBoardMetadata';
import { useStatsStartConfig } from '@/features/requests/hooks/useKanbanAdmin';
import { config }          from '@/config';
import '@/styles/stats.css';
import { StatsSkeleton } from '@/features/requests/components/StatsSkeleton';
import { useStatsUIStore } from '@/store/statsStore';

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
/** Convierte horas decimales a "Xh Ym". null → "—". Ej: 2.5 → "2h 30m", 0.75 → "45m", 3 → "3h". */
const PRI_COLOR: Record<string, string> = {
  critica: '#ff4757', alta: '#ffa502', media: '#a78bfa', baja: '#5a6a8a',
};
const PRIORIDADES_LABEL: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja',
};
const fmtHoras = (h: number | null): string => {
  if (h == null) return '—';
  const totalMin = Math.round(h * 60);
  const horas = Math.floor(totalMin / 60);
  const mins  = totalMin % 60;
  if (horas === 0) return `${mins}m`;
  if (mins === 0)  return `${horas}h`;
  return `${horas}h ${mins}m`;
};
/** Delta de una métrica vs sprint anterior.
 *  mode 'pct' → variación porcentual (creadas/resueltas/críticas).
 *  mode 'pts' → diferencia en puntos (cumplimiento, que ya es %). */
type DeltaInfo = { trend: 'up' | 'down' | 'neutral'; sub: string };
function calcDelta(actual: number, prev: number | undefined, mode: 'pct' | 'pts'): DeltaInfo | null {
  if (prev === undefined) return null;
  const diff = actual - prev;
  const trend: DeltaInfo['trend'] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
  const arrow = diff > 0 ? '+' : ''; // el signo − ya viene en el número negativo
  if (mode === 'pts') {
    if (diff === 0) return { trend, sub: 'sin cambio vs anterior' };
    return { trend, sub: `${arrow}${diff} pts vs anterior` };
  }
  // pct
  if (prev === 0) {
    if (actual === 0) return { trend: 'neutral', sub: 'sin cambio vs anterior' };
    return { trend: 'up', sub: 'nuevo vs anterior' };
  }
  const pct = Math.round((diff / prev) * 100);
  if (pct === 0) return { trend: 'neutral', sub: 'sin cambio vs anterior' };
  return { trend, sub: `${arrow}${pct}% vs anterior` };
}
/** Extrae el año de un sprint: de la fecha si existe, o del patrón (YYYY) del nombre. */
function getSprintYear(s: Sprint): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  // Histórico sin fecha → buscar (YYYY) en el texto
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  if (m) return Number(m[1]);
  return null;
}
/** Extrae el número de sprint del texto: "Sprint #5 (2025)" → 5. Null si no hay patrón. */
function getSprintNumber(s: Sprint): number | null {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
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

function SprintSelector({ sprints, selectedIds, onChange, selectedYear, onYearChange, availableYears }: {
  sprints:        Sprint[];
  selectedIds:    number[];
  onChange:       (ids: number[]) => void;
  selectedYear:   number;
  onYearChange:   (year: number) => void;
  availableYears: number[];
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

  // Solo sprints del año seleccionado
  const sprintsDelAnyo = sprints.filter(s => getSprintYear(s) === selectedYear);

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
          {/* Selector de año */}
          {availableYears.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              {availableYears.map(yr => (
                <button
                  key={yr}
                  onClick={() => onYearChange(yr)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    fontWeight: selectedYear === yr ? 700 : 400,
                    border: `1px solid ${selectedYear === yr ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    background: selectedYear === yr ? 'rgba(0,200,255,0.1)' : 'transparent',
                    color: selectedYear === yr ? 'var(--accent)' : 'var(--txt-muted)',
                    transition: 'all 0.12s',
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          <button
            className={['sprint-selector__item', selectedIds.length === 0 ? 'sprint-selector__item--active' : ''].join(' ')}
            onClick={() => onChange([])}
          >
            Todos los sprints
          </button>

          {sprintsDelAnyo.length === 0
            ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin sprints en {selectedYear}.</div>
: [...sprintsDelAnyo].sort((a, b) => {
                const aHasDates = !!a.Sprint_Start_Date && !!a.Sprint_End_Date;
                const bHasDates = !!b.Sprint_Start_Date && !!b.Sprint_End_Date;
                // 1) Los que tienen fecha van arriba; los históricos siempre abajo
                if (aHasDates !== bHasDates) return aHasDates ? -1 : 1;
                // 2) Ambos con fecha → cronológico
                if (aHasDates && bHasDates) {
                  return a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!);
                }
                // 3) Ambos históricos → por número de sprint del nombre
                const na = getSprintNumber(a);
                const nb = getSprintNumber(b);
                if (na !== null && nb !== null) return na - nb;
                return a.Sprint_ID - b.Sprint_ID; // último recurso
              }).map(s => {                const isSelected = selectedIds.includes(s.Sprint_ID);
                const hasDates   = !!s.Sprint_Start_Date && !!s.Sprint_End_Date;
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
                      {hasDates
                        ? <>{fmtDate(new Date(s.Sprint_Start_Date!))} → {fmtDate(new Date(s.Sprint_End_Date!))}</>
                        : <span style={{ color: '#7f77dd', fontWeight: 700 }}>Histórico</span>
                      }
                    </span>
                  </button>
                );
              })
          }
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
  boardTeamId, boardTeamIds, selectedUserId, onSelect,
}: {
  boardTeamId:    number | null;
  /** Modo combinado: varios equipos. Si tiene 2+, tiene prioridad sobre boardTeamId. */
  boardTeamIds?:  number[];
  selectedUserId: number | null;
  onSelect:       (id: number | null) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref                 = useRef<HTMLDivElement>(null);

  const isMulti = (boardTeamIds?.length ?? 0) >= 2;

  // Sub-equipos: en modo combinado, de todos los equipos; si no, del único.
  const multiTeams   = useSubTeamsMulti(isMulti ? boardTeamIds! : []);
  const { data: singleSubTeams = [] } = useSubTeams(isMulti ? null : boardTeamId);

  // Lista unificada de sub-equipos para alimentar useSubTeamMembersGrouped.
  // En multi se concatenan preservando el orden por equipo.
  const subTeams = useMemo(
    () => isMulti ? multiTeams.flatMap(t => t.subTeams) : singleSubTeams,
    [isMulti, multiTeams, singleSubTeams],
  );

  const groupedMembers = useSubTeamMembersGrouped(subTeams);
  const { data: rawUsers = [] }   = useUsers() as { data: Array<{ User_ID: number; User_Name: string; User_Email: string; Is_Active?: boolean | null }> };

  const hasTeamScope = isMulti || boardTeamId !== null;

  const allFlat = useMemo(() =>
    hasTeamScope
      ? groupedMembers.flatMap(g => g.members)
      : rawUsers.filter(u => u.Is_Active !== false),
    [hasTeamScope, groupedMembers, rawUsers],
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

          {/* ── Vista por equipo: sub-equipos (uno o varios combinados) ── */}
          {hasTeamScope && (
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
          {!hasTeamScope && (() => {
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

const sprintIds    = useStatsUIStore(s => s.sprintIds);
  const userFilter   = useStatsUIStore(s => s.userFilter);
  const teamTab      = useStatsUIStore(s => s.teamTab);
  const selectedTeams = useStatsUIStore(s => s.selectedTeams);
  const selectedYear = useStatsUIStore(s => s.selectedYear);
  const teamPicked   = useStatsUIStore(s => s.teamPicked);
  const sprintPicked = useStatsUIStore(s => s.sprintPicked);

  const setSprintIds     = useStatsUIStore(s => s.setSprintIds);
  const setUserFilter    = useStatsUIStore(s => s.setUserFilter);
  const setTeamTab       = useStatsUIStore(s => s.setTeamTab);
  const toggleTeam       = useStatsUIStore(s => s.toggleTeam);
  const setSelectedYear  = useStatsUIStore(s => s.setSelectedYear);
  const markTeamPicked   = useStatsUIStore(s => s.markTeamPicked);
  const markSprintPicked = useStatsUIStore(s => s.markSprintPicked);
  
  const { data: boardTeams = [] }  = useBoardTeams(config.DEFAULT_BOARD_ID);
  const { data: statsStartConfig } = useStatsStartConfig(config.DEFAULT_BOARD_ID);
  const teamColorMap = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Color])), [boardTeams]);
  const teamNameMap  = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Name])),  [boardTeams]);

  const isGlobal = teamTab === GLOBAL_KEY;

  const isCombined = !isGlobal && selectedTeams.length >= 2;
  const stats = useStatsData(sprintIds, boardTeams, userFilter, isGlobal ? null : teamTab, statsStartConfig ?? undefined, isGlobal ? [] : selectedTeams);
  // Años disponibles entre todos los sprints (fecha o nombre)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const s of stats.sprints) {
      const y = getSprintYear(s);
      if (y !== null) years.add(y);
    }
    const current = new Date().getFullYear();
    years.add(current); // siempre incluir el año actual
    return [...years].sort((a, b) => b - a);
  }, [stats.sprints]);
const sprintDatesBadge = useMemo(() => {
    const sel = stats.sprints.filter(s => sprintIds.includes(s.Sprint_ID) && s.Sprint_Start_Date && s.Sprint_End_Date);
    if (sel.length === 0) return null;
    if (sel.length === 1)
      return `${fmtDate(new Date(sel[0].Sprint_Start_Date!))} — ${fmtDate(new Date(sel[0].Sprint_End_Date!))}`;
    const sorted = [...sel].sort((a, b) => a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!));
    return `${fmtDate(new Date(sorted[0].Sprint_Start_Date!))} — ${fmtDate(new Date(sorted[sorted.length - 1].Sprint_End_Date!))}`;
  }, [stats.sprints, sprintIds]);
/** Board_Team_ID del tab seleccionado — null en Global */
const selectedBoardTeamId = useMemo(
    () => isGlobal ? null : (boardTeams.find(t => t.Board_Team_Code === teamTab)?.Board_Team_ID ?? null),
    [isGlobal, boardTeams, teamTab],
  );
  // IDs de los equipos combinados, para el dropdown de usuario en modo multi.
  const combinedBoardTeamIds = useMemo(
    () => isGlobal ? [] : selectedTeams
      .map(code => boardTeams.find(t => t.Board_Team_Code === code)?.Board_Team_ID)
      .filter((id): id is number => id != null),
    [isGlobal, selectedTeams, boardTeams],
  );
  // ¿El equipo activo tiene configurada la categoría "bloqueada"?
  const { data: teamLabels = [], isLoading: labelsLoading } = useLabelsByTeamId(config.DEFAULT_BOARD_ID, selectedBoardTeamId);
  const tieneCategoriaBloqueada = useMemo(
    () => teamLabels.some(l => isBlockedLabelName(l.Label_Name)),
    [teamLabels],
  );
  // Auto-selecciona sprint activo; si no hay ninguno activo, el más reciente
useEffect(() => {
  if (stats.sprints.length === 0 || sprintPicked) return;
  markSprintPicked();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dated = stats.sprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  const active = dated.find(s =>
    s.Sprint_Start_Date.slice(0, 10) <= today && today <= s.Sprint_End_Date.slice(0, 10)
  );
  const fallback = [...dated].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0];
  const chosen = active ?? fallback;
  if (chosen) {
    setSprintIds([chosen.Sprint_ID]);
    const y = getSprintYear(chosen);
    if (y !== null) setSelectedYear(y);
  }
}, [stats.sprints, sprintPicked, markSprintPicked, setSprintIds, setSelectedYear]);

  // Auto-selecciona primer equipo al cargar
useEffect(() => {
    if (boardTeams.length === 0 || teamPicked) return;
    markTeamPicked();
    setTeamTab(boardTeams[0].Board_Team_Code);
  }, [boardTeams, teamPicked, markTeamPicked, setTeamTab]);
  
  // Resetear userFilter al cambiar de equipo (evita filtros huérfanos)
  const prevTeamTab = useRef(teamTab);
  useEffect(() => {
    if (prevTeamTab.current !== teamTab) {
      prevTeamTab.current = teamTab;
      setUserFilter(null);
    }
  }, [teamTab]);

  const [expandedResolutor, setExpandedResolutor] = useState<number | null>(null);

  const sp        = stats.sprint;
  const gn        = stats.general;
  const boardData = isGlobal ? null : (isCombined ? stats.boardCombined : stats.boards[teamTab]);
  // El delta vs sprint anterior se oculta en modo combinado (acordado Fase 1).
  const boardPrev = (isGlobal || isCombined) ? undefined : stats.boardsPrev?.[teamTab];
  const maxPri    = boardData ? Math.max(...boardData.porPrioridad.map(p => p.value), 1) : 1;

  // Deltas vs sprint anterior (solo vista equipo, 1 sprint, mismo linaje)
  const dCreadas      = boardData ? calcDelta(boardData.creadas,      boardPrev?.creadas,      'pct') : null;
  const dResueltas    = boardData ? calcDelta(boardData.resueltas,    boardPrev?.resueltas,    'pct') : null;
  const dCumplimiento = boardData ? calcDelta(boardData.cumplimiento, boardPrev?.cumplimiento, 'pts') : null;
  const dCriticas     = boardData ? calcDelta(boardData.criticas,     boardPrev?.criticas,     'pct') : null;

const totalSprint = sp.planeadas + sp.postPlanning;
const pctCompleto = totalSprint > 0 ? Math.round((sp.completadas / totalSprint) * 100) : 0;
  const teamColor     = isGlobal ? 'var(--accent)' : (teamColorMap[teamTab] ?? 'var(--accent)');

  return (
    <div className="stats-page">

      {/* ═══ Tabs primarios de equipo ══════════════════════════ */}
      <div className="stats-primary-tabs">
        {boardTeams.map(t => {
          const isSel = !isGlobal && selectedTeams.includes(t.Board_Team_Code);
          return (
            <button key={t.Board_Team_Code}
              className={['stats-primary-tab', isSel ? 'stats-primary-tab--active' : ''].join(' ')}
              style={{ '--tab-color': teamColorMap[t.Board_Team_Code] ?? 'var(--accent)' } as React.CSSProperties}
              onClick={() => toggleTeam(t.Board_Team_Code)}>
              <span className="stats-primary-tab__dot" style={{ background: teamColorMap[t.Board_Team_Code] ?? '#888' }} />
              {t.Board_Team_Name}
            </button>
          );
        })}
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
          <SprintSelector
            sprints={stats.sprints}
            selectedIds={sprintIds}
            onChange={setSprintIds}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
            availableYears={availableYears}
          />
          {sprintDatesBadge && <span className="sprint-dates-badge">{sprintDatesBadge}</span>}
          <div className="sprint-progress-pill">
            <div className="sprint-progress-pill__fill" style={{ width: `${pctCompleto}%` }} />
            <span>{pctCompleto}% completado</span>
          </div>
        </div>
        <div className="stats-control-bar__right">

          <UserFilterDropdown
            boardTeamId={selectedBoardTeamId}
            boardTeamIds={combinedBoardTeamIds}
            selectedUserId={userFilter}
            onSelect={setUserFilter}
          />
        </div>
      </div>

      {/* ═══ Estados ════════════════════════════════════════════ */}
      {stats.isLoading && <StatsSkeleton />}
      {stats.isError   && <div className="stats-error"><AlertTriangle size={16} /><span>Error al cargar los datos.</span></div>}

      {/* ═══ Dashboard ══════════════════════════════════════════ */}
      {!stats.isLoading && !stats.isError && (
        <>
          {/* ── Sprint (siempre visible, filtrado por equipo activo) ── */}
          <SectionDivider icon={Target} label={
            isGlobal ? 'Sprint activo — todos los equipos'
            : isCombined ? `Sprint activo — ${selectedTeams.map(c => teamNameMap[c] ?? c).join(' + ')}`
            : `Sprint activo — ${teamNameMap[teamTab] ?? teamTab}`
          } />

          <div className="scard-grid scard-grid--5">
            <SprintCard label="Planeadas"     value={sp.planeadas}   color="#378ADD" icon={Layers} />
            <SprintCard label="Activas"       value={sp.activas}     color="#00c8ff" icon={Clock} pulse />
            <SprintCard label="Completadas"   value={sp.completadas} color="#1D9E75" icon={CheckCircle2} />
            <SprintCard label="Post-planning" value={sp.postPlanning} sub="Fuera del scope original" color="#EF9F27" icon={PlusCircle} />
{!isGlobal && !isCombined && !labelsLoading && !tieneCategoriaBloqueada ? (
              <SprintCard label="Bloqueadas" value="—" sub="Categoría no configurada"
                color="#5a6a8a" icon={Minus} />
            ) : (
              <SprintCard label="Bloqueadas" value={sp.bloqueadas} sub="Con label bloqueada/pausada"
                color={sp.bloqueadas > 0 ? '#ff4757' : '#1D9E75'}
                icon={sp.bloqueadas > 0 ? XCircle : CheckCircle2} />
            )}
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
              <div className="stats-panel__header"><span className="stats-panel__title"><Clock size={12} /> Tiempos promedio</span></div>
              <div className="month-stats">
                <div className="month-stat">
                  <span className="month-stat__num" style={{ color: 'var(--accent)' }}>
                    {fmtHoras(sp.tiempoEstimadoProm)}
                  </span>
                  <span className="month-stat__label">Tiempo estimado promedio</span>
                  <p className="month-stat__note">Sobre solicitudes con estimación cargada</p>
                </div>
                <div className="month-stat-divider" />
                <div className="month-stat">
                  <span className="month-stat__num" style={{ color: 'var(--success)' }}>
                    {fmtHoras(sp.tiempoConsumidoProm)}
                  </span>
                  <span className="month-stat__label">Tiempo consumido promedio</span>
                  <p className="month-stat__note">Sobre solicitudes cerradas</p>
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
                    <div className="stats-comp-stat"><span>Puntaje histórico</span><span style={{ color: 'var(--accent)' }}>{e.score}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Vista EQUIPO ESPECÍFICO ───────────────────────── */}
          {!isGlobal && boardData && (
            <>
              <SectionDivider icon={LayoutGrid} label={
                isCombined
                  ? `Detalle combinado — ${selectedTeams.map(c => teamNameMap[c] ?? c).join(' + ')}`
                  : `Detalle — ${teamNameMap[teamTab] ?? teamTab}`
              } />
              <div className="stats-kpi-grid">
                <KPICard label="Solicitudes"      value={boardData.creadas}
                  sub={dCreadas?.sub ?? 'En este equipo'}
                  trend={dCreadas?.trend ?? 'neutral'} accent={teamColor} />
                <KPICard label="Resueltas"        value={boardData.resueltas}
                  sub={dResueltas?.sub ?? 'Columna Hecho'}
                  trend={dResueltas?.trend ?? 'neutral'} accent="var(--success)" />
                <KPICard label="Cumplimiento"     value={`${boardData.cumplimiento}%`}
                  sub={dCumplimiento?.sub ?? 'Pts. reales vs meta'}
                  trend={dCumplimiento?.trend ?? (boardData.cumplimiento >= 80 ? 'up' : boardData.cumplimiento >= 50 ? 'neutral' : 'down')}
                  accent="var(--warn)" />
                <KPICard label="Críticas activas" value={boardData.criticas}
                  sub={dCriticas?.sub ?? (boardData.criticas > 0 ? `${boardData.criticas} sin resolver` : '✓ ninguna')}
                  trend={dCriticas?.trend ?? (boardData.criticas > 0 ? 'down' : 'neutral')}
                  accent="var(--danger)" trendGood="down" />
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
                        className={['stats-resolutor', userFilter === r.userId ? 'stats-resolutor--active' : '', expandedResolutor === r.userId ? 'stats-resolutor--expanded' : ''].join(' ')}
                        onClick={() => setExpandedResolutor(expandedResolutor === r.userId ? null : r.userId)}
                        title={expandedResolutor === r.userId ? 'Ocultar solicitudes' : `Ver solicitudes de ${r.nombre}`}>
                        <div className="stats-resolutor__avatar" style={{ background: r.avatarBg }}>{r.initials}</div>
                        <span className="stats-resolutor__name">{r.nombre}</span>
                        <span className="stats-resolutor__count">{r.resueltas} res.</span>
                      </button>
                    ))}
                  </div>

                  {/* Listado expandible del resolutor seleccionado */}
                  {expandedResolutor !== null && (() => {
                    const sel = boardData.resolutores.find(r => r.userId === expandedResolutor);
                    if (!sel) return null;
                    return (
                      <div className="resolutor-detail">
                        <div className="resolutor-detail__head">
                          <span className="resolutor-detail__title">
                            Solicitudes resueltas por {sel.nombre}
                          </span>
                          <span className="resolutor-detail__count">{sel.resueltas}</span>
                        </div>
                        <div className="resolutor-detail__list">
                          {sel.solicitudes.map(s => (
                            <div key={s.id} className="resolutor-detail__row">
                              <span className="resolutor-detail__id">{s.id}</span>
                              <span className="resolutor-detail__titulo" title={s.titulo}>{s.titulo || '—'}</span>
                              <span className="resolutor-detail__pri" style={{ color: PRI_COLOR[s.prioridad] }}>
                                {PRIORIDADES_LABEL[s.prioridad]}
                              </span>
                              <span className="resolutor-detail__sprint">{s.sprintName ?? 'Sin sprint'}</span>
                              <span className="resolutor-detail__fecha">
                                {s.fechaCierre ? fmtDate(new Date(s.fechaCierre)) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}