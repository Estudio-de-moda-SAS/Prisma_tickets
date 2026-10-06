import { LayoutGrid } from 'lucide-react';
import type { BoardStatsReal } from '@/features/requests/hooks/useStatsData';
import { BarChart } from './BarChart';
import { ResolutoresPanel } from './ResolutoresPanel';
import { BarRow, KPICard, SectionDivider } from './StatsAtoms';
import { calcDelta } from './statsFormat';

/** KPIs del equipo con delta vs sprint anterior (si hay `boardPrev`). */
function TeamKPIs({ boardData, boardPrev, teamColor }: {
  boardData: BoardStatsReal;
  boardPrev: BoardStatsReal | undefined;
  teamColor: string;
}) {
  const dCreadas      = calcDelta(boardData.creadas,      boardPrev?.creadas,      'pct');
  const dResueltas    = calcDelta(boardData.resueltas,    boardPrev?.resueltas,    'pct');
  const dCumplimiento = calcDelta(boardData.cumplimiento, boardPrev?.cumplimiento, 'pts');
  const dCriticas     = calcDelta(boardData.criticas,     boardPrev?.criticas,     'pct');

  return (
    <div className="stats-kpi-grid">
      <KPICard label="Solicitudes"      value={boardData.creadas}
        sub={dCreadas?.sub ?? 'En este equipo'}
        trend={dCreadas?.trend ?? 'neutral'} accent={teamColor} />
      <KPICard label="Resueltas"        value={boardData.resueltas + boardData.otrosSprintsCount}
        sub={dResueltas?.sub ?? (boardData.otrosSprintsCount > 0
          ? `${boardData.resueltas} de este sprint + ${boardData.otrosSprintsCount} de otros`
          : 'Columna Hecho')}
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
  );
}

/** Distribución por columna y por prioridad. */
function DistributionPanels({ boardData, chartKey, teamName }: { boardData: BoardStatsReal; chartKey: string; teamName: string }) {
  const maxPri = Math.max(...boardData.porPrioridad.map(p => p.value), 1);
  return (
    <div className="stats-mid-grid">
      <div className="stats-panel">
        <div className="stats-panel__header">
          <span className="stats-panel__title">Distribución en el board</span>
          <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{teamName}</span>
        </div>
        <div className="stats-chart-legend">
          {boardData.porColumna.filter(c => c.value > 0).map(c => (
            <span key={c.label} className="stats-legend-item">
              <span className="stats-legend-sq" style={{ background: c.color.replace('0.7)', '1)') }} />{c.label}
            </span>
          ))}
        </div>
        <BarChart id={`boardChart-${chartKey}`} data={boardData.porColumna} />
      </div>
      <div className="stats-panel">
        <div className="stats-panel__header"><span className="stats-panel__title">Por prioridad</span></div>
        {boardData.porPrioridad.map(p => <BarRow key={p.label} label={p.label} value={p.value} max={maxPri} color={p.color} />)}
      </div>
    </div>
  );
}

/** Vista de equipo específico (o combinación): KPIs, distribución y resolutores. */
export function TeamDetailSection({ boardData, boardPrev, scope, isCombined, teamTab, teamName, teamColor, userFilter }: {
  boardData:  BoardStatsReal;
  /** Board del sprint anterior (solo equipo único, 1 sprint, mismo linaje). */
  boardPrev:  BoardStatsReal | undefined;
  scope:      string;
  isCombined: boolean;
  teamTab:    string;
  teamName:   string;
  teamColor:  string;
  userFilter: number | null;
}) {
  return (
    <>
      <SectionDivider icon={LayoutGrid} label={isCombined ? `Detalle combinado — ${scope}` : `Detalle — ${scope}`} />
      <TeamKPIs boardData={boardData} boardPrev={boardPrev} teamColor={teamColor} />
      <DistributionPanels boardData={boardData} chartKey={teamTab} teamName={teamName} />
      {boardData.resolutores.length > 0 && (
        <ResolutoresPanel resolutores={boardData.resolutores} teamName={teamName} userFilter={userFilter} />
      )}
    </>
  );
}
