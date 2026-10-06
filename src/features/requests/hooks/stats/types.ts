/**
 * Tipos públicos de las métricas de estadísticas del board.
 *
 * @module stats/types
 */

import type { Request, RequestAssignee, Prioridad } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';

/** Usuario para filtros, con su equipo principal derivado. */
export type FilterUser = RequestAssignee & { primaryTeam: string };

/** Desglose del arrastre por sprint de origen. */
export type OtrosSprintsDetalle = Array<{ sprintId: number; sprintName: string; count: number }>;

/** Métricas de un (o varios) sprint(s). */
export type SprintStats = {
  sprint:              Sprint | null;
  planeadas:           number;
  activas:             number;
  completadas:         number;
  bloqueadas:          number;
  postPlanning:        number;
  puntajePlaneado:     number;
  puntajeRealizado:    number;
  puntajePostPlanning: number;
  planeadasMes:        number;
  cerradasMes:         number;
  tiempoEstimadoProm:  number | null;
  tiempoConsumidoProm: number | null;
  meta:                number;
  penalizacion:        number;
  puntajeReal:         number;
  cumplimiento:        number;
  otrosSprintsCerradas: number | null;
  otrosSprintsDetalle:  OtrosSprintsDetalle | null;
  puntajeOtrosSprints:  number;
};

/** Estadísticas de un equipo dentro de las métricas generales. */
export type EquipoStatsReal = {
  equipo:    string;
  creadas:   number;
  resueltas: number;
  criticas:  number;
  score:     number;
};

/** Métricas generales del board, con desglose por equipo. */
export type GeneralStatsReal = {
  total:          number;
  resueltas:      number;
  tasaGlobal:     number;
  tiempoPromedio: number;
  porEquipo:      EquipoStatsReal[];
};

/** Punto de la distribución por columna (label, valor, color). */
export type ColStatReal = { label: string; value: number; color: string };
/** Punto de la distribución por prioridad (label, valor, color). */
export type PriStatReal = { label: string; value: number; color: string };

/** Solicitud resuelta por un resolutor. */
export type ResolutorSolicitud = {
  id:          string;
  titulo:      string;
  prioridad:   Prioridad;
  fechaCierre: string | null;
  sprintName:  string | null;
  labelIds:    number[];
};

/** Resolutor (top 5) de un board. */
export type Resolutor = {
  userId:      number;
  nombre:      string;
  initials:    string;
  resueltas:   number;
  avatarBg:    string;
  solicitudes: ResolutorSolicitud[];
};

/** Estadísticas completas de un board/equipo (o combinación). */
export type BoardStatsReal = {
  equipo:       string;
  creadas:      number;
  resueltas:    number;
  criticas:     number;
  meta:         number;
  penalizacion: number;
  puntajeReal:  number;
  cumplimiento: number;
  puntajeOtrosSprints: number;
  otrosSprintsCount:   number;
  otrosSprintsDetalle: OtrosSprintsDetalle;
  porColumna:   ColStatReal[];
  porPrioridad: PriStatReal[];
  resolutores:  Resolutor[];
};

/** Configuración de stats: posición de columnas y columna de inicio por equipo. */
export type StatsConfig = {
  columnPositions:  Record<string, number>;
  statsStartByTeam: Record<string, number>;
};

/* ─── Flujo / salud ───────────────────────────────────────── */

/** Percentiles p50/p85/p95 de una distribución, con el conteo de muestras. */
export type Percentiles = { p50: number | null; p85: number | null; p95: number | null; count: number };
/** Bucket de aging (label, valor, color). */
export type AgingBucket = { label: string; value: number; color: string };
/** Punto de throughput por período (creadas vs resueltas). */
export type ThroughputPoint = { periodLabel: string; created: number; resolved: number };
/** Precisión de estimación (ratio consumido/estimado y bandas). */
export type EstimationAccuracy = {
  withBoth:      number;
  avgRatio:      number | null;   // consumido / estimado
  withinBand:    number;
  withinBandPct: number | null;
  tomoMas:       number;          // ratio > 1.25 → subestimado
  tomoMenos:     number;          // ratio < 0.75 → sobreestimado
};
/** Conjunto de métricas de flujo/salud del board. */
export type FlowMetrics = {
  leadTime:      Percentiles;     // días (apertura → cierre) de las resueltas
  wipActual:     number;
  agingWip:      AgingBucket[];
  agingBacklog:  AgingBucket[];
  throughput:    ThroughputPoint[];
  netFlow:       { created: number; resolved: number; net: number };
  estimation:    EstimationAccuracy;
  criticalAging: Array<{ id: string; titulo: string; dias: number }>;
};

/* ─── Paquete completo ────────────────────────────────────── */

/** Paquete completo de datos de estadísticas que devuelve `useStatsData`. */
export type StatsData = {
  general:      GeneralStatsReal;
  boards:       Record<string, BoardStatsReal>;
  /** Boards calculados para el sprint anterior (mismo linaje). Vacío si
   *  no hay exactamente 1 sprint seleccionado o no existe anterior. */
  boardsPrev:   Record<string, BoardStatsReal> | null;
  /** Board combinado (unión) cuando hay 2+ equipos seleccionados. Null si no. */
  boardCombined: BoardStatsReal | null;
  sprint:       SprintStats;
  allRequests:  Request[];
  /** primaryTeam derivado de historial de asignaciones — para enriquecer useUsers */
  primaryTeamMap: Map<number, string>;
  sprints:      Sprint[];
  /** Métricas de flujo/salud (lead time, aging, throughput, estimación) */
  flow:         FlowMetrics;
  isLoading:    boolean;
  isError:      boolean;
};
