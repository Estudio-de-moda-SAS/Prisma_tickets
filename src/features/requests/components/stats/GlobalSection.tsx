import { Globe } from 'lucide-react';
import type { BoardStatsReal, GeneralStatsReal } from '@/features/requests/hooks/useStatsData';
import { BarChart } from './BarChart';
import { BarRow, KPICard, SectionDivider } from './StatsAtoms';

/** Vista global: KPIs agregados y comparación entre equipos. */
export function GlobalSection({ gn, boards, teamColorMap, teamNameMap }: {
  gn:           GeneralStatsReal;
  boards:       Record<string, BoardStatsReal>;
  teamColorMap: Record<string, string>;
  teamNameMap:  Record<string, string>;
}) {
  const nameOf = (code: string) => teamNameMap[code] ?? code;
  return (
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
                {nameOf(e.equipo)}
              </span>
            ))}
          </div>
          <BarChart id="teamChart" data={gn.porEquipo.map(e => ({ label: nameOf(e.equipo).split(' ')[0], value: e.creadas, color: teamColorMap[e.equipo] ?? '#888888' }))} />
        </div>
        <div className="stats-panel">
          <div className="stats-panel__header"><span className="stats-panel__title">Cumplimiento por equipo</span></div>
          {Object.entries(boards).map(([code, bd]) => (
            <BarRow key={code} label={nameOf(code).split(' ')[0]} value={bd.cumplimiento} max={100} color={teamColorMap[code] ?? '#888'} />
          ))}
        </div>
      </div>
      <div className="stats-comp-grid">
        {gn.porEquipo.map(e => (
          <div key={e.equipo} className="stats-comp-card" style={{ borderTopColor: teamColorMap[e.equipo] ?? '#888' }}>
            <div className="stats-comp-card__name">{nameOf(e.equipo)}</div>
            <div className="stats-comp-stat"><span>Creadas</span><span>{e.creadas}</span></div>
            <div className="stats-comp-stat"><span>Resueltas</span><span>{e.resueltas}</span></div>
            <div className="stats-comp-stat"><span>Cumplimiento</span><span>{boards[e.equipo]?.cumplimiento ?? 0}%</span></div>
            <div className="stats-comp-stat"><span>Críticas</span><span style={{ color: e.criticas > 0 ? 'var(--danger)' : 'var(--success)' }}>{e.criticas}</span></div>
            <div className="stats-comp-stat"><span>Puntaje histórico</span><span style={{ color: 'var(--accent)' }}>{e.score}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}
