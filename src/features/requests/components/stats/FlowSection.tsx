import { Activity, Hourglass, Timer, Gauge, Flame } from 'lucide-react';
import type { FlowMetrics } from '@/features/requests/hooks/useStatsData';
import { BarChart } from './BarChart';
import { KPICard, SectionDivider, ThroughputMini } from './StatsAtoms';
import { fmtDays } from './statsFormat';

/** Percentiles de lead time + WIP actual. */
function LeadTimeKPIs({ fl }: { fl: FlowMetrics }) {
  return (
    <div className="stats-kpi-grid">
      <KPICard label="Lead time p50" value={fmtDays(fl.leadTime.p50)}
        sub={`Mediana · ${fl.leadTime.count} resueltas`} trend="neutral" accent="var(--accent)" />
      <KPICard label="Lead time p85" value={fmtDays(fl.leadTime.p85)}
        sub="85% cierra dentro de esto" trend="neutral" accent="var(--warn)" />
      <KPICard label="Lead time p95" value={fmtDays(fl.leadTime.p95)}
        sub="Cola larga (outliers)" trend="neutral" accent="var(--danger)" />
      <KPICard label="WIP actual" value={fl.wipActual}
        sub="En curso ahora mismo" trend="neutral" accent="var(--info)" />
    </div>
  );
}

/** Aging de WIP y backlog. */
function AgingPanels({ fl }: { fl: FlowMetrics }) {
  return (
    <div className="stats-mid-grid">
      <div className="stats-panel">
        <div className="stats-panel__header"><span className="stats-panel__title"><Hourglass size={12} /> Antig{'ü'}edad del WIP</span></div>
        <BarChart id="agingWip" data={fl.agingWip} height={150} />
      </div>
      <div className="stats-panel">
        <div className="stats-panel__header"><span className="stats-panel__title"><Hourglass size={12} /> Antig{'ü'}edad del backlog</span></div>
        <BarChart id="agingBacklog" data={fl.agingBacklog} height={150} />
      </div>
    </div>
  );
}

function ThroughputPanel({ fl }: { fl: FlowMetrics }) {
  const net = fl.netFlow.net;
  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <span className="stats-panel__title"><Timer size={12} /> Throughput (8 semanas)</span>
        <span className="stats-velocity-badge" style={{ color: net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--txt-muted)' }}>
          Neto {net > 0 ? '+' : ''}{net}
        </span>
      </div>
      <div className="stats-chart-legend">
        <span className="stats-legend-item"><span className="stats-legend-sq" style={{ background: 'var(--warn)' }} />Creadas</span>
        <span className="stats-legend-item"><span className="stats-legend-sq" style={{ background: 'var(--success)' }} />Resueltas</span>
      </div>
      <ThroughputMini data={fl.throughput} />
      <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '8px 4px 0' }}>
        {fl.netFlow.created} creadas {'·'} {fl.netFlow.resolved} resueltas en el per{'í'}odo.
        {net > 0 ? ' El backlog se está reduciendo.' : net < 0 ? ' El backlog está creciendo.' : ' Backlog estable.'}
      </p>
    </div>
  );
}

function EstimationPanel({ fl }: { fl: FlowMetrics }) {
  const est = fl.estimation;
  return (
    <div className="stats-panel">
      <div className="stats-panel__header"><span className="stats-panel__title"><Gauge size={12} /> Precisi{'ó'}n de estimaci{'ó'}n</span></div>
      {est.withBoth === 0 ? (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 12 }}>
          Sin solicitudes cerradas con estimaci{'ó'}n y consumo cargados.
        </div>
      ) : (
        <div className="month-stats">
          <div className="month-stat">
            <span className="month-stat__num" style={{ color: 'var(--accent)' }}>{est.withinBandPct}%</span>
            <span className="month-stat__label">Dentro de {'±'}25%</span>
            <p className="month-stat__note">{est.withinBand} de {est.withBoth} cerradas</p>
          </div>
          <div className="month-stat-divider" />
          <div className="month-stat">
            <span className="month-stat__num" style={{ color: est.avgRatio! > 1.15 ? 'var(--danger)' : est.avgRatio! < 0.85 ? 'var(--warn)' : 'var(--success)' }}>
              {est.avgRatio!.toFixed(2)}{'×'}
            </span>
            <span className="month-stat__label">Consumido / estimado</span>
            <p className="month-stat__note">{est.tomoMas} tardaron m{'á'}s {'·'} {est.tomoMenos} menos</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CriticalAgingPanel({ items }: { items: FlowMetrics['criticalAging'] }) {
  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <span className="stats-panel__title" style={{ color: 'var(--danger)' }}><Flame size={12} /> Cr{'í'}ticas activas m{'á'}s antiguas</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-surface)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', fontVariantNumeric: 'tabular-nums' }}>{c.id}</span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.titulo}>{c.titulo || '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.dias >= 14 ? 'var(--danger)' : c.dias >= 7 ? 'var(--warn)' : 'var(--txt-muted)' }}>{c.dias}d</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sección "Flujo & salud del board". */
export function FlowSection({ fl, scope }: { fl: FlowMetrics; scope: string }) {
  return (
    <>
      <SectionDivider icon={Activity} label={`Flujo & salud — ${scope}`} />
      <LeadTimeKPIs fl={fl} />
      <AgingPanels fl={fl} />
      <div className="stats-mid-grid">
        <ThroughputPanel fl={fl} />
        <EstimationPanel fl={fl} />
      </div>
      {fl.criticalAging.length > 0 && <CriticalAgingPanel items={fl.criticalAging} />}
    </>
  );
}
