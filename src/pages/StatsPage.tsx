import { useState, useEffect, useRef } from 'react';
import {
  BarChart2, Globe, LayoutGrid, Zap,
  TrendingUp, TrendingDown, Minus,
  CheckCircle2, Clock, AlertTriangle, Layers,
  PlusCircle, XCircle, Star, Target,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { EQUIPOS } from '@/features/requests/types';
import type { Equipo } from '@/features/requests/types';
import { useStatsData } from '@/features/requests/hooks/useStatsData';
import type { SprintStats, EquipoStatsReal, ColStatReal, PriStatReal } from '@/features/requests/hooks/useStatsData';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import '@/styles/stats.css';

/* ─── Chart.js types ─────────────────────────────────────── */
type ChartInstance = { destroy: () => void };
type ChartWindow = Window & typeof globalThis & {
  Chart?: new (canvas: HTMLCanvasElement, config: unknown) => ChartInstance;
};
type TooltipContext = { raw: unknown };

function loadChartJs(cb: () => void) {
  if ((window as ChartWindow).Chart) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  s.onload = cb;
  document.head.appendChild(s);
}

/* ─── Colores canónicos ───────────────────────────────────── */
const EQUIPO_COLORS: Record<Equipo, string> = {
  desarrollo: '#378ADD',
  crm:        '#1D9E75',
  sistemas:   '#EF9F27',
  analisis:   '#7F77DD',
};

/* ─── Helpers ─────────────────────────────────────────────── */
function fmt(d: Date) {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(d);
}

/* ════════════════════════════════════════════════════════════
   Primitivos UI
════════════════════════════════════════════════════════════ */

/* ── KPI Card clásico ────────────────────────────────────── */
function KPICard({
  label, value, sub, trend, accent, trendGood = 'up',
}: {
  label: string; value: string | number; sub: string;
  trend: 'up' | 'down' | 'neutral'; accent: string; trendGood?: 'up' | 'down';
}) {
  const isPos  = (trend === 'up' && trendGood === 'up') || (trend === 'down' && trendGood === 'down');
  const color  = trend === 'neutral' ? 'var(--txt-muted)' : isPos ? 'var(--success)' : 'var(--danger)';
  const Icon   = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className="stats-kpi-card">
      <div className="stats-kpi-card__accent" style={{ background: accent }} />
      <span className="stats-kpi-card__label">{label}</span>
      <span className="stats-kpi-card__value">{value}</span>
      <div className="stats-kpi-card__sub" style={{ color }}>
        <Icon size={10} /><span>{sub}</span>
      </div>
    </div>
  );
}

/* ── Sprint metric card (al estilo Airtable, grande) ────── */
function SprintCard({
  label, value, sub, color, icon: Icon, pulse = false,
}: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType; pulse?: boolean;
}) {
  return (
    <div className="scard" style={{ '--scard-color': color } as React.CSSProperties}>
      <div className="scard__icon-wrap">
        <Icon size={16} className={pulse ? 'scard__icon--pulse' : ''} />
      </div>
      <div className="scard__body">
        <span className="scard__label">{label}</span>
        <span className="scard__value">{value}</span>
        {sub && <span className="scard__sub">{sub}</span>}
      </div>
      <div className="scard__glow" />
    </div>
  );
}

/* ── Barra horizontal ─────────────────────────────────────── */
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="stats-bar-row">
      <span className="stats-bar-row__label">{label}</span>
      <div className="stats-bar-row__track">
        <div className="stats-bar-row__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="stats-bar-row__val">{value}</span>
    </div>
  );
}

/* ── Bar chart canvas ─────────────────────────────────────── */
function BarChart({ id, data, height = 180 }: { id: string; data: ColStatReal[] | PriStatReal[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<ChartInstance | null>(null);

  useEffect(() => {
    const canvas  = canvasRef.current;
    const ChartJs = (window as ChartWindow).Chart;
    if (!canvas || !ChartJs) return;
    if (chartRef.current) chartRef.current.destroy();

    const isDark    = document.documentElement.classList.contains('dark') ||
                      matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#5a6a8a' : '#888';

    chartRef.current = new ChartJs(canvas, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data:            data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderColor:     data.map((d) => d.color.replace('0.7)', '1)')),
          borderWidth: 1, borderRadius: 5, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: TooltipContext) => ` ${ctx.raw} solicitudes` } },
        },
        scales: {
          x: { ticks: { color: tickColor, font: { size: 11 }, autoSkip: false }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor }, border: { display: false }, beginAtZero: true },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div style={{ position: 'relative', height }}>
      <canvas ref={canvasRef} id={id} role="img" aria-label="Gráfico de barras" />
    </div>
  );
}

/* ── Donut de progreso (puntaje) ──────────────────────────── */
function ScoreDonut({ realizado, total }: { realizado: number; total: number }) {
  const pct = total > 0 ? Math.round((realizado / total) * 100) : 0;
  const r   = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="score-donut">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-surface)" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke="var(--accent)" strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          strokeDashoffset={circ * 0.25}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="44" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--txt)">{pct}%</text>
        <text x="44" y="54" textAnchor="middle" fontSize="9"  fill="var(--txt-muted)">completado</text>
      </svg>
      <div className="score-donut__labels">
        <div className="score-donut__row">
          <span className="score-donut__dot" style={{ background: 'var(--accent)' }} />
          <span>Realizado <strong>{realizado}</strong> pts</span>
        </div>
        <div className="score-donut__row">
          <span className="score-donut__dot" style={{ background: 'var(--bg-surface)' }} />
          <span>Total <strong>{total}</strong> pts</span>
        </div>
      </div>
    </div>
  );
}

/* ── Sprint selector ──────────────────────────────────────── */
function SprintSelector({
  sprints, selectedId, onChange,
}: {
  sprints: Sprint[]; selectedId: number | null; onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = sprints.find((s) => s.Sprint_ID === selectedId);

  return (
    <div className="sprint-selector">
      <button className="sprint-selector__btn" onClick={() => setOpen((o) => !o)}>
        <Target size={12} />
        <span>{selected?.Sprint_Text ?? 'Todos los sprints'}</span>
        <ChevronDown size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
      </button>
      {open && (
        <div className="sprint-selector__menu">
          <button
            className={['sprint-selector__item', selectedId === null ? 'sprint-selector__item--active' : ''].join(' ')}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Todos los sprints
          </button>
          {sprints.map((s) => (
            <button
              key={s.Sprint_ID}
              className={['sprint-selector__item', selectedId === s.Sprint_ID ? 'sprint-selector__item--active' : ''].join(' ')}
              onClick={() => { onChange(s.Sprint_ID); setOpen(false); }}
            >
              <span>{s.Sprint_Text}</span>
              <span className="sprint-selector__dates">
                {fmt(new Date(s.Sprint_Start_Date))} → {fmt(new Date(s.Sprint_End_Date))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Vista — Sprint
════════════════════════════════════════════════════════════ */
function SprintView({ data, sprints, sprintId, onSprintChange }: {
  data: SprintStats;
  sprints: Sprint[];
  sprintId: number | null;
  onSprintChange: (id: number | null) => void;
}) {
  const pctCompleto = data.planeadas > 0
    ? Math.round((data.completadas / data.planeadas) * 100) : 0;

  return (
    <>
      <div className="sprint-header-bar">
        <SprintSelector sprints={sprints} selectedId={sprintId} onChange={onSprintChange} />
        {data.sprint && (
          <span className="sprint-dates-badge">
            {fmt(new Date(data.sprint.Sprint_Start_Date))} — {fmt(new Date(data.sprint.Sprint_End_Date))}
          </span>
        )}
        <div className="sprint-progress-pill">
          <div className="sprint-progress-pill__fill" style={{ width: `${pctCompleto}%` }} />
          <span>{pctCompleto}% completado</span>
        </div>
      </div>

      {/* Fila 1: 3 tarjetas grandes */}
      <div className="scard-grid scard-grid--3">
        <SprintCard label="Tareas planeadas"  value={data.planeadas}    color="#378ADD" icon={Layers}       />
        <SprintCard label="Tareas activas"    value={data.activas}      color="#00c8ff" icon={Clock} pulse  />
        <SprintCard label="Tareas completadas" value={data.completadas} color="#1D9E75" icon={CheckCircle2} />
      </div>

      {/* Fila 2: 2 tarjetas */}
      <div className="scard-grid scard-grid--2">
        <SprintCard
          label="Ingresadas post planning"
          value={data.postPlanning}
          sub="Tareas no contempladas en la planificación inicial"
          color="#EF9F27"
          icon={PlusCircle}
        />
        <SprintCard
          label="Tareas bloqueadas"
          value={data.bloqueadas}
          sub="En Icebox — requieren acción"
          color={data.bloqueadas > 0 ? '#ff4757' : '#1D9E75'}
          icon={data.bloqueadas > 0 ? XCircle : CheckCircle2}
        />
      </div>

      {/* Fila 3: puntaje + mes */}
      <div className="stats-mid-grid">
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title"><Star size={12} /> Puntaje del sprint</span>
          </div>
          <div className="score-panel">
            <ScoreDonut realizado={data.puntajeRealizado} total={data.puntajeTotal} />
            <div className="score-panel__detail">
              <div className="score-detail-row">
                <span>Puntaje total</span>
                <strong>{data.puntajeTotal}</strong>
              </div>
              <div className="score-detail-row">
                <span>Puntaje realizado</span>
                <strong style={{ color: 'var(--accent)' }}>{data.puntajeRealizado}</strong>
              </div>
              <p className="score-detail-note">
                Los puntos se calculan según prioridad: Baja 1 · Media 3 · Alta 5 · Crítica 8
              </p>
            </div>
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title"><BarChart2 size={12} /> Actividad del mes</span>
          </div>
          <div className="month-stats">
            <div className="month-stat">
              <span className="month-stat__num" style={{ color: 'var(--accent)' }}>{data.planeadasMes}</span>
              <span className="month-stat__label">Planeadas en el mes</span>
              <p className="month-stat__note">Total creadas, excluye bloqueadas e icebox</p>
            </div>
            <div className="month-stat-divider" />
            <div className="month-stat">
              <span className="month-stat__num" style={{ color: 'var(--success)' }}>{data.cerradasMes}</span>
              <span className="month-stat__label">Cerradas en el mes</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Vista — General
════════════════════════════════════════════════════════════ */
function GeneralView({ porEquipo, total, resueltas, tasaGlobal, tiempoPromedio }: {
  porEquipo: EquipoStatsReal[]; total: number; resueltas: number;
  tasaGlobal: number; tiempoPromedio: number;
}) {
  return (
    <>
      <p className="stats-section-label">Resumen global — todos los equipos</p>
      <div className="stats-kpi-grid">
        <KPICard label="Total solicitudes"       value={total}                  sub="Todas las activas"   trend="neutral" accent="var(--accent)" />
        <KPICard label="Resueltas"               value={resueltas}              sub="En columna Hecho"    trend="up"      accent="var(--success)" />
        <KPICard label="Tasa global resolución"  value={`${tasaGlobal}%`}       sub="Resueltas / total"   trend={tasaGlobal > 60 ? 'up' : 'down'} accent="var(--warn)" />
        <KPICard label="Tiempo prom. resolución" value={`${tiempoPromedio}d`}   sub="Apertura → cierre"   trend="neutral" accent="var(--info)" />
      </div>

      <div className="stats-mid-grid">
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Solicitudes por equipo</span>
          </div>
          <div className="stats-chart-legend">
            {porEquipo.map((e) => (
              <span key={e.equipo} className="stats-legend-item">
                <span className="stats-legend-sq" style={{ background: EQUIPO_COLORS[e.equipo] }} />
                {EQUIPOS[e.equipo]}
              </span>
            ))}
          </div>
          <BarChart
            id="teamChart"
            data={porEquipo.map((e) => ({
              label: EQUIPOS[e.equipo].split(' ')[0],
              value: e.creadas,
              color: EQUIPO_COLORS[e.equipo] + 'bb',
            }))}
          />
        </div>

        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">SLA cumplido por equipo</span>
          </div>
          {porEquipo.map((e) => (
            <BarRow key={e.equipo} label={EQUIPOS[e.equipo].split(' ')[0]} value={e.sla} max={100} color={EQUIPO_COLORS[e.equipo]} />
          ))}
        </div>
      </div>

      <p className="stats-section-label">Comparativa entre equipos</p>
      <div className="stats-comp-grid">
        {porEquipo.map((e) => (
          <div key={e.equipo} className="stats-comp-card" style={{ borderTopColor: EQUIPO_COLORS[e.equipo] }}>
            <div className="stats-comp-card__name">{EQUIPOS[e.equipo]}</div>
            <div className="stats-comp-stat"><span>Creadas</span><span>{e.creadas}</span></div>
            <div className="stats-comp-stat"><span>Resueltas</span><span>{e.resueltas}</span></div>
            <div className="stats-comp-stat"><span>SLA</span><span>{e.sla}%</span></div>
            <div className="stats-comp-stat">
              <span>Críticas</span>
              <span style={{ color: e.criticas > 0 ? 'var(--danger)' : 'var(--success)' }}>{e.criticas}</span>
            </div>
            <div className="stats-comp-stat"><span>Score</span><span style={{ color: 'var(--accent)' }}>{e.score}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Vista — Por equipo / board
════════════════════════════════════════════════════════════ */
function BoardView({ boards }: { boards: Record<Equipo, import('@/features/requests/hooks/useStatsData').BoardStatsReal> }) {
  const [equipo, setEquipo] = useState<Equipo>('desarrollo');
  const data    = boards[equipo];
  const maxPri  = Math.max(...data.porPrioridad.map((p) => p.value), 1);

  return (
    <>
      <div className="stats-team-tabs">
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([key, label]) => (
          <button
            key={key}
            className={['stats-team-tab', equipo === key ? 'stats-team-tab--active' : ''].join(' ')}
            style={equipo === key ? {
              borderColor: EQUIPO_COLORS[key],
              color:       EQUIPO_COLORS[key],
              background:  `${EQUIPO_COLORS[key]}18`,
            } : {}}
            onClick={() => setEquipo(key)}
          >
            <span className="stats-team-dot" style={{ background: EQUIPO_COLORS[key] }} />
            {label}
          </button>
        ))}
      </div>

      <div className="stats-kpi-grid">
        <KPICard label="Solicitudes"   value={data.creadas}              sub="En este equipo"          trend="neutral" accent={EQUIPO_COLORS[equipo]} />
        <KPICard label="Resueltas"     value={data.resueltas}            sub="Columna Hecho"           trend="up"      accent="var(--success)" />
        <KPICard label="SLA cumplido"  value={`${data.sla}%`}           sub="Con deadline respetado"  trend={data.sla > 70 ? 'up' : 'down'} accent="var(--warn)" />
        <KPICard
          label="Críticas activas"
          value={data.criticas}
          sub={data.criticas > 0 ? `${data.criticas} sin resolver` : '✓ ninguna'}
          trend={data.criticas > 0 ? 'down' : 'neutral'}
          accent="var(--danger)"
          trendGood="down"
        />
      </div>

      <div className="stats-mid-grid">
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Distribución en el board</span>
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{EQUIPOS[equipo]}</span>
          </div>
          <div className="stats-chart-legend">
            {data.porColumna.filter((c) => c.value > 0).map((c) => (
              <span key={c.label} className="stats-legend-item">
                <span className="stats-legend-sq" style={{ background: c.color.replace('0.7)', '1)') }} />
                {c.label}
              </span>
            ))}
          </div>
          <BarChart id={`boardChart-${equipo}`} data={data.porColumna} />
        </div>

        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Por prioridad</span>
          </div>
          {data.porPrioridad.map((p) => (
            <BarRow key={p.label} label={p.label} value={p.value} max={maxPri} color={p.color} />
          ))}
        </div>
      </div>

      {data.resolutores.length > 0 && (
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Top resolutores — {EQUIPOS[equipo]}</span>
          </div>
          <div className="stats-resolutores">
            {data.resolutores.map((r) => (
              <div key={r.nombre} className="stats-resolutor">
                <div className="stats-resolutor__avatar" style={{ background: r.avatarBg }}>{r.initials}</div>
                <span className="stats-resolutor__name">{r.nombre}</span>
                <span className="stats-resolutor__count">{r.resueltas} res.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Página raíz
════════════════════════════════════════════════════════════ */
export function StatsPage() {
  const { account } = useAuth();
  const [view,      setView]      = useState<'general' | 'board' | 'sprint'>('sprint');
  const [sprintId,  setSprintId]  = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(!!(window as ChartWindow).Chart);

  const stats = useStatsData(sprintId);

  useEffect(() => { loadChartJs(() => setChartReady(true)); }, []);

  // Auto-selecciona el sprint más reciente al cargar
  useEffect(() => {
    if (stats.sprints.length > 0 && sprintId === null) {
      const last = [...stats.sprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0];
      setSprintId(last.Sprint_ID);
    }
  }, [stats.sprints, sprintId]);

  const initials = account?.name?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';
  const today    = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  return (
    <div className="stats-page">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="stats-page__header">
        <div className="stats-page__user">
          <div className="stats-page__avatar">{initials}</div>
          <div>
            <div className="stats-page__username">
              {account?.name ?? 'Usuario'}
              <span className="stats-page__role-badge">Administrador</span>
            </div>
            <div className="stats-page__date">{today}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="stats-view-tabs">
            <button
              className={['stats-view-tab', view === 'sprint' ? 'stats-view-tab--active' : ''].join(' ')}
              onClick={() => setView('sprint')}
            >
              <Target size={12} /> Sprint
            </button>
            <button
              className={['stats-view-tab', view === 'general' ? 'stats-view-tab--active' : ''].join(' ')}
              onClick={() => setView('general')}
            >
              <Globe size={12} /> Vista general
            </button>
            <button
              className={['stats-view-tab', view === 'board' ? 'stats-view-tab--active' : ''].join(' ')}
              onClick={() => setView('board')}
            >
              <LayoutGrid size={12} /> Por equipo
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <a href="/new" className="stats-quick-link"><Zap size={11} /> Nueva solicitud</a>
            <a href="/"    className="stats-quick-link"><LayoutGrid size={11} /> Board</a>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ─────────────────────────────────── */}
      {stats.isLoading && (
        <div className="stats-loading">
          <div className="stats-loading__spinner" />
          <span>Cargando estadísticas…</span>
        </div>
      )}

      {stats.isError && (
        <div className="stats-error">
          <AlertTriangle size={16} />
          <span>Error al cargar los datos. Verifica la conexión.</span>
        </div>
      )}

      {/* ── Contenido ───────────────────────────────────────── */}
      {!stats.isLoading && !stats.isError && chartReady && (
        <>
          {view === 'sprint' && (
            <SprintView
              data={stats.sprint}
              sprints={stats.sprints}
              sprintId={sprintId}
              onSprintChange={setSprintId}
            />
          )}
          {view === 'general' && (
            <GeneralView
              porEquipo={stats.general.porEquipo}
              total={stats.general.total}
              resueltas={stats.general.resueltas}
              tasaGlobal={stats.general.tasaGlobal}
              tiempoPromedio={stats.general.tiempoPromedio}
            />
          )}
          {view === 'board' && <BoardView boards={stats.boards} />}
        </>
      )}

    </div>
  );
}