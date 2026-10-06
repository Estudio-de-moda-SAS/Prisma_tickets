/**
 * Métricas de flujo / salud del board (estándar ITSM + Kanban).
 * Todo se calcula sobre el Request ya cargado — sin backend nuevo.
 *
 * @module stats/lib/calcFlowMetrics
 */

import type { Request, KanbanColumna } from '@/features/requests/types';
import { AGING_BUCKETS, BACKLOG_COLUMNS, DONE_COLUMNS, WIP_COLUMNS } from '../constants';
import type { AgingBucket, EstimationAccuracy, FlowMetrics, Percentiles, ThroughputPoint } from '../types';
import { ageInDays, daysBetween, percentile, toUtcMs } from './math';

/**
 * Calcula los percentiles de lead time (días apertura → cierre) de las resueltas.
 *
 * @param requests - Solicitudes.
 * @returns Los {@link Percentiles} del lead time.
 */
function calcLeadTime(requests: Request[]): Percentiles {
  const times = requests
    .filter(r => DONE_COLUMNS.has(r.columna) && r.fechaCierre && r.fechaApertura)
    .map(r => daysBetween(r.fechaApertura, r.fechaCierre!))
    .sort((a, b) => a - b);
  return { p50: percentile(times, 50), p85: percentile(times, 85), p95: percentile(times, 95), count: times.length };
}

/**
 * Distribuye las solicitudes de ciertas columnas en buckets de antigüedad.
 *
 * @param requests - Solicitudes.
 * @param cols - Columnas a considerar (WIP o backlog).
 * @returns Los buckets de aging con sus conteos.
 */
function calcAging(requests: Request[], cols: Set<KanbanColumna>): AgingBucket[] {
  const buckets = AGING_BUCKETS.map(b => ({ label: b.label, value: 0, color: b.color }));
  for (const r of requests) {
    if (!cols.has(r.columna)) continue;
    const age = ageInDays(r.fechaApertura);
    let idx = AGING_BUCKETS.findIndex(b => age < b.max);
    if (idx === -1) idx = AGING_BUCKETS.length - 1;
    buckets[idx].value++;
  }
  return buckets;
}

/**
 * Calcula el throughput (creadas vs resueltas) por semana y el flujo neto.
 *
 * @param requests - Solicitudes.
 * @param weeks - Número de semanas hacia atrás a considerar.
 * @returns Los puntos por período y el neto acumulado (`resolved - created`).
 */
function calcThroughput(requests: Request[], weeks: number): { points: ThroughputPoint[]; net: { created: number; resolved: number; net: number } } {
  const DAY = 86_400_000, now = Date.now();
  const points: ThroughputPoint[] = [];
  let tc = 0, tr = 0;
  for (let i = weeks - 1; i >= 0; i--) {
    const start = now - (i + 1) * 7 * DAY;
    const end   = now - i * 7 * DAY;
    let created = 0, resolved = 0;
    for (const r of requests) {
      const c = toUtcMs(r.fechaApertura);
      if (c >= start && c < end) created++;
      if (r.fechaCierre && DONE_COLUMNS.has(r.columna)) {
        const f = toUtcMs(r.fechaCierre);
        if (f >= start && f < end) resolved++;
      }
    }
    tc += created; tr += resolved;
    const d = new Date(start);
    points.push({ periodLabel: `${d.getDate()}/${d.getMonth() + 1}`, created, resolved });
  }
  return { points, net: { created: tc, resolved: tr, net: tr - tc } };
}

/**
 * Calcula la precisión de estimación (ratio consumido/estimado y bandas).
 *
 * @remarks
 * Solo considera resueltas con estimado > 0 y logged no nulo. La banda aceptable
 * es 0.75–1.25; fuera de ella, ratio > 1.25 = subestimado ("tomó más") y < 0.75 =
 * sobreestimado ("tomó menos").
 *
 * @param requests - Solicitudes.
 * @returns La {@link EstimationAccuracy}.
 */
function calcEstimation(requests: Request[]): EstimationAccuracy {
  const ratios = requests
    .filter(r => DONE_COLUMNS.has(r.columna) && r.estimatedHours != null && r.estimatedHours > 0 && r.loggedHours != null)
    .map(r => (r.loggedHours as number) / (r.estimatedHours as number));
  const withBoth = ratios.length;
  if (withBoth === 0) return { withBoth: 0, avgRatio: null, withinBand: 0, withinBandPct: null, tomoMas: 0, tomoMenos: 0 };
  const LO = 0.75, HI = 1.25;
  const withinBand = ratios.filter(x => x >= LO && x <= HI).length;
  return {
    withBoth,
    avgRatio:      ratios.reduce((a, b) => a + b, 0) / withBoth,
    withinBand,
    withinBandPct: Math.round((withinBand / withBoth) * 100),
    tomoMas:       ratios.filter(x => x > HI).length,
    tomoMenos:     ratios.filter(x => x < LO).length,
  };
}

/**
 * Calcula todas las métricas de flujo/salud del board.
 *
 * @remarks
 * Agrega lead time, WIP actual, aging (WIP y backlog), throughput a 8 semanas con
 * flujo neto, precisión de estimación y el top 5 de críticas abiertas por
 * antigüedad.
 *
 * @param requests - Solicitudes sobre las que calcular.
 * @returns Las {@link FlowMetrics}.
 */
export function calcFlowMetrics(requests: Request[]): FlowMetrics {
  const { points: throughput, net: netFlow } = calcThroughput(requests, 8);
  return {
    leadTime:     calcLeadTime(requests),
    wipActual:    requests.filter(r => WIP_COLUMNS.has(r.columna)).length,
    agingWip:     calcAging(requests, WIP_COLUMNS),
    agingBacklog: calcAging(requests, BACKLOG_COLUMNS),
    throughput,
    netFlow,
    estimation:   calcEstimation(requests),
    criticalAging: requests
      .filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna))
      .map(r => ({ id: r.id, titulo: r.titulo, dias: Math.round(ageInDays(r.fechaApertura)) }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5),
  };
}
