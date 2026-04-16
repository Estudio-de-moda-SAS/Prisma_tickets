import { useState, useEffect, useRef } from 'react';
import {
  BarChart2, Globe, LayoutGrid,
  TrendingUp, TrendingDown, Minus, Zap,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { EQUIPOS } from '@/features/requests/types';
import type { Equipo } from '@/features/requests/types';
import {
  RANGO_LABELS, EQUIPO_COLORS, MOCK_ALL_STATS, MOCK_ACTIVIDAD, ACTIVIDAD_COLORS,
} from '@/features/stats/types';
import type { RangoTiempo, ActividadItem, ColStats, PriStats, Resolutor } from '@/features/stats/types';
import '@/styles/stats.css';

/* ─────────────────────────────────────────────────────────────
   Utilidades
───────────────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'Ayer' : `Hace ${days} días`;
}

function loadChartJs(cb: () => void) {
  if ((window as any).Chart) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  s.onload = cb;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────────────────
   KPI Card
───────────────────────────────────────────────────────────── */
function KPICard({
  label, value, sub, trend, accent, trendGood = 'up',
}: {
  label: string; value: string | number; sub: string;
  trend: 'up' | 'down' | 'neutral'; accent: string; trendGood?: 'up' | 'down';
}) {
  const isPos = (trend === 'up' && trendGood === 'up') || (trend === 'down' && trendGood === 'down');
  const color = trend === 'neutral' ? 'var(--txt-muted)'
    : isPos ? 'var(--success)' : 'var(--danger)';
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

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

/* ─────────────────────────────────────────────────────────────
   Barra horizontal
───────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────
   Actividad reciente
───────────────────────────────────────────────────────────── */
function ActivityItem({ item }: { item: ActividadItem }) {
  return (
    <div className="stats-activity-item">
      <div className="stats-activity-dot" style={{ background: ACTIVIDAD_COLORS[item.tipo] }} />
      <span className="stats-activity-text">{item.descripcion}</span>
      <span className="stats-activity-time">{timeAgo(item.timestamp)}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Canvas chart (columnas)
───────────────────────────────────────────────────────────── */
function BarChart({ id, data, height = 180 }: { id: string; data: ColStats[] | PriStats[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(window as any).Chart) return;
    if (chartRef.current) chartRef.current.destroy();

    const isDark   = matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#5a6a8a' : '#888';

    chartRef.current = new (window as any).Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data:            data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderColor:     data.map((d) => d.color.replace('0.6)', '1)')),
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.raw} solicitudes` } } },
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
      <canvas
        ref={canvasRef}
        id={id}
        role="img"
        aria-label={`Gráfico de barras: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      >
        {data.map((d) => `${d.label}: ${d.value}`).join('. ')}
      </canvas>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Gráfico de equipos (general)
───────────────────────────────────────────────────────────── */
function TeamBarChart({ data }: { data: Array<{ equipo: Equipo; creadas: number }> }) {
  const mapped: ColStats[] = data.map((d) => ({
    label: EQUIPOS[d.equipo],
    value: d.creadas,
    color: EQUIPO_COLORS[d.equipo],
  }));
  return <BarChart id="teamChart" data={mapped} />;
}

/* ─────────────────────────────────────────────────────────────
   Resolutores
───────────────────────────────────────────────────────────── */
function Resolutores({ list }: { list: Resolutor[] }) {
  return (
    <div className="stats-resolutores">
      {list.map((r) => (
        <div key={r.nombre} className="stats-resolutor">
          <div className="stats-resolutor__avatar" style={{ background: r.avatarBg }}>
            {r.initials}
          </div>
          <span className="stats-resolutor__name">{r.nombre}</span>
          <span className="stats-resolutor__count">{r.resueltas} res.</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Vista General
───────────────────────────────────────────────────────────── */
function GeneralView({ rango }: { rango: RangoTiempo }) {
  const data = MOCK_ALL_STATS.general[rango];
  const { kpis, porEquipo } = data;

  return (
    <>
      <p className="stats-section-label">Resumen global — todos los equipos</p>
      <div className="stats-kpi-grid">
        <KPICard label="Total solicitudes"      value={kpis.total}           sub="↑ 8 vs período anterior"  trend="up"      accent="var(--accent)" />
        <KPICard label="Resueltas"              value={kpis.resueltas}       sub="↑ 5 vs período anterior"  trend="up"      accent="var(--success)" />
        <KPICard label="Tasa global resolución" value={`${kpis.tasaGlobal}%`} sub="→ estable"               trend="neutral" accent="var(--warn)" />
        <KPICard label="Tiempo prom. resolución" value={`${kpis.tiempoPromedio}d`} sub="↑ mejorando"        trend="up"      accent="var(--info)" />
      </div>

      <div className="stats-mid-grid">
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Solicitudes creadas por equipo</span>
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{RANGO_LABELS[rango]}</span>
          </div>
          <div className="stats-chart-legend">
            {porEquipo.map((e) => (
              <span key={e.equipo} className="stats-legend-item">
                <span className="stats-legend-sq" style={{ background: EQUIPO_COLORS[e.equipo] }} />
                {EQUIPOS[e.equipo]}
              </span>
            ))}
          </div>
          <TeamBarChart data={porEquipo} />
        </div>

        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">SLA cumplido por equipo</span>
          </div>
          {porEquipo.map((e) => (
            <BarRow
              key={e.equipo}
              label={EQUIPOS[e.equipo]}
              value={e.sla}
              max={100}
              color={EQUIPO_COLORS[e.equipo]}
            />
          ))}
        </div>
      </div>

      <p className="stats-section-label">Comparativa entre equipos</p>
      <div className="stats-comp-grid">
        {porEquipo.map((e) => (
          <div
            key={e.equipo}
            className="stats-comp-card"
            style={{ borderTopColor: EQUIPO_COLORS[e.equipo] }}
          >
            <div className="stats-comp-card__name">{EQUIPOS[e.equipo]}</div>
            <div className="stats-comp-stat"><span>Creadas</span><span>{e.creadas}</span></div>
            <div className="stats-comp-stat"><span>Resueltas</span><span>{e.resueltas}</span></div>
            <div className="stats-comp-stat"><span>SLA</span><span>{e.sla}%</span></div>
            <div className="stats-comp-stat">
              <span>Críticas</span>
              <span style={{ color: e.criticas > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {e.criticas}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Vista Por Board
───────────────────────────────────────────────────────────── */
function BoardView({ rango }: { rango: RangoTiempo }) {
  const [equipo, setEquipo] = useState<Equipo>('desarrollo');
  const data = MOCK_ALL_STATS.boards[equipo];
  const { kpis, porColumna, porPrioridad, resolutores } = data;
  const maxPri = Math.max(...porPrioridad.map((d) => d.value));

  return (
    <>
      {/* Selector de equipo */}
      <div className="stats-team-tabs">
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([key, label]) => (
          <button
            key={key}
            className={['stats-team-tab', equipo === key ? 'stats-team-tab--active' : ''].join(' ')}
            style={equipo === key ? { borderColor: EQUIPO_COLORS[key], color: EQUIPO_COLORS[key], background: `${EQUIPO_COLORS[key]}18` } : {}}
            onClick={() => setEquipo(key)}
          >
            <span
              className="stats-team-dot"
              style={{ background: EQUIPO_COLORS[key] }}
            />
            {label}
          </button>
        ))}
      </div>

      {/* KPIs del board */}
      <div className="stats-kpi-grid">
        <KPICard label="Solicitudes creadas"  value={kpis.creadas}   sub="↑ 4 vs período anterior"   trend="up"   accent={EQUIPO_COLORS[equipo]} />
        <KPICard label="Resueltas"            value={kpis.resueltas} sub="↑ 2 vs período anterior"   trend="up"   accent="var(--success)" />
        <KPICard label="SLA cumplido"         value={`${kpis.sla}%`} sub="→ estable"                 trend="neutral" accent="var(--warn)" />
        <KPICard
          label="Críticas activas"
          value={kpis.criticas}
          sub={kpis.criticas > 0 ? `${kpis.criticas} activa${kpis.criticas > 1 ? 's' : ''}` : '✓ ninguna'}
          trend={kpis.criticas > 0 ? 'down' : 'neutral'}
          accent="var(--danger)"
          trendGood="down"
        />
      </div>

      <div className="stats-mid-grid">
        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Distribución en el board — {EQUIPOS[equipo]}</span>
          </div>
          <div className="stats-chart-legend">
            {porColumna.map((c) => (
              <span key={c.label} className="stats-legend-item">
                <span className="stats-legend-sq" style={{ background: c.color.replace('0.6)', '1)') }} />
                {c.label}
              </span>
            ))}
          </div>
          <BarChart id={`boardChart-${equipo}`} data={porColumna} />
        </div>

        <div className="stats-panel">
          <div className="stats-panel__header">
            <span className="stats-panel__title">Por prioridad</span>
          </div>
          {porPrioridad.map((p) => (
            <BarRow key={p.label} label={p.label} value={p.value} max={maxPri} color={p.color} />
          ))}
        </div>
      </div>

      {/* Resolutores */}
      <div className="stats-panel">
        <div className="stats-panel__header">
          <span className="stats-panel__title">Top resolutores — {EQUIPOS[equipo]}</span>
          <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{RANGO_LABELS[rango]}</span>
        </div>
        <Resolutores list={resolutores} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página raíz
───────────────────────────────────────────────────────────── */
export function StatsPage() {
  const { account } = useAuth();
  const [view,  setView]  = useState<'general' | 'board'>('general');
  const [rango, setRango] = useState<RangoTiempo>('week');
  const [chartReady, setChartReady] = useState(!!(window as any).Chart);

  useEffect(() => { loadChartJs(() => setChartReady(true)); }, []);

  const initials = account?.name?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';
  const today = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  return (
    <div className="stats-page">

      {/* ── Header ─────────────────────────────────── */}
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
          {/* Vista general / por board */}
          <div className="stats-view-tabs">
            <button
              className={['stats-view-tab', view === 'general' ? 'stats-view-tab--active' : ''].join(' ')}
              onClick={() => setView('general')}
            >
              <Globe size={12} />
              Vista general
            </button>
            <button
              className={['stats-view-tab', view === 'board' ? 'stats-view-tab--active' : ''].join(' ')}
              onClick={() => setView('board')}
            >
              <LayoutGrid size={12} />
              Por equipo
            </button>
          </div>

          {/* Rango de tiempo */}
          <div className="stats-range-tabs">
            {(Object.entries(RANGO_LABELS) as [RangoTiempo, string][]).map(([key, label]) => (
              <button
                key={key}
                className={['stats-tab', rango === key ? 'stats-tab--active' : ''].join(' ')}
                onClick={() => setRango(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contenido por vista ────────────────────── */}
      {chartReady ? (
        view === 'general'
          ? <GeneralView rango={rango} />
          : <BoardView   rango={rango} />
      ) : (
        <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando gráficas…</p>
      )}

      {/* ── Actividad reciente (siempre visible) ───── */}
      <div className="stats-panel" style={{ marginTop: 4 }}>
        <div className="stats-panel__header">
          <span className="stats-panel__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart2 size={13} /> Actividad reciente
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="/new" className="stats-quick-link"><Zap size={11} /> Nueva solicitud</a>
            <a href="/"    className="stats-quick-link"><LayoutGrid size={11} /> Board</a>
          </div>
        </div>
        <div className="stats-activity-list">
          {MOCK_ACTIVIDAD.map((item) => <ActivityItem key={item.id} item={item} />)}
        </div>
      </div>

    </div>
  );
}