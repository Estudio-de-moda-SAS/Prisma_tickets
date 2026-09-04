/* ============================================================
   useStatsData — calcula todas las métricas de estadísticas
   ============================================================ */

import { useMemo } from 'react';
import { useBoardCompletoStats } from '@/features/requests/hooks/useRequests';
import { useSprints }          from '@/features/requests/hooks/useSprints';
import { PRIORIDAD_TO_SCORE } from '@/features/requests/types';import type { Request, KanbanColumna, RequestAssignee, Prioridad } from '@/features/requests/types';
import type { BoardTeam }      from '@/features/requests/hooks/useBoardMetadata';
import type { Sprint }         from '@/features/requests/hooks/useSprints';

/**
 * Motor de cálculo de todas las métricas de estadísticas del board.
 *
 * A partir del dataset completo de requests y los sprints, calcula métricas
 * generales, por board/equipo, por sprint, combinadas (unión de equipos), del
 * sprint anterior (mismo linaje) y de flujo/salud (lead time, aging, throughput,
 * estimación). Todo se deriva en cliente sobre los requests ya cargados, sin
 * llamadas extra al backend. El hook público es {@link useStatsData}.
 *
 * @remarks
 * Conceptos transversales:
 * - **Columnas done** ({@link DONE_COLUMNS}) siempre cuentan como resueltas,
 *   ignorando la columna de inicio de stats (arregla históricos en "historial").
 * - **Linaje de sprint**: con fecha (PRISMA) vs sin fecha (histórico migrado); no
 *   se cruzan al comparar contra el sprint anterior.
 * - **Arrastre**: solicitudes de otros sprints cerradas dentro de la ventana del
 *   sprint seleccionado; suman a resolutores y (en columna 'hecho') al puntaje.
 * - **Penalización**: actualmente desactivada ({@link PENALIZACION_ACTIVA}).
 *
 * @module useStatsData
 */

/* ─── Tipos exportados ─────────────────────────────────────── */

/** Usuario para filtros, con su equipo principal derivado. */
export type FilterUser = RequestAssignee & { primaryTeam: string };

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
  otrosSprintsDetalle:  Array<{ sprintId: number; sprintName: string; count: number }> | null;
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
  otrosSprintsDetalle: Array<{ sprintId: number; sprintName: string; count: number }>;
  porColumna:   ColStatReal[];
  porPrioridad: PriStatReal[];
  resolutores:  Array<{
    userId:    number;
    nombre:    string;
    initials:  string;
    resueltas: number;
    avatarBg:  string;
    solicitudes: Array<{
      id:          string;
      titulo:      string;
      prioridad:   Prioridad;
      fechaCierre: string | null;
      sprintName:  string | null;
      labelIds:    number[];
    }>;
  }>;
};

/** Configuración de stats: posición de columnas y columna de inicio por equipo. */
export type StatsConfig = {
  columnPositions:  Record<string, number>;
  statsStartByTeam: Record<string, number>;
};

/** Paquete completo de datos de estadísticas que devuelve {@link useStatsData}. */
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

/* ─── Constantes ──────────────────────────────────────────── */

/** Metadatos visuales (label + color) por columna del kanban. */
const COL_META: Record<KanbanColumna, { label: string; color: string }> = {
  sin_categorizar: { label: 'Sin cat.',  color: 'rgba(90,106,138,0.7)'  },
  icebox:          { label: 'Icebox',    color: 'rgba(120,130,160,0.7)' },
  backlog:         { label: 'Backlog',   color: 'rgba(127,119,221,0.7)' },
  todo:            { label: 'To do',     color: 'rgba(239,159,39,0.7)'  },
  en_progreso:     { label: 'En prog.',  color: 'rgba(0,200,255,0.7)'   },
  en_revision_qas: { label: 'QAS',       color: 'rgba(251,113,33,0.7)'  },
  cliente_review:  { label: 'C. Review', color: 'rgba(52,211,153,0.7)'  },
  ready_to_deploy: { label: 'Ready',     color: 'rgba(167,139,250,0.7)' },
  hecho:           { label: 'Hecho',     color: 'rgba(0,229,160,0.7)'   },
  historial:       { label: 'Historial', color: 'rgba(90,106,138,0.5)'  },
};

/** Metadatos (clave, label, color) por prioridad, en orden descendente. */
const PRI_META = [
  { key: 'critica', label: 'Crítica', color: '#ff4757' },
  { key: 'alta',    label: 'Alta',    color: '#ffa502' },
  { key: 'media',   label: 'Media',   color: '#a78bfa' },
  { key: 'baja',    label: 'Baja',    color: '#5a6a8a' },
] as const;

/** Gradientes de avatar asignados cíclicamente a los resolutores. */
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
/** Columnas que cuentan como resueltas en todas las métricas */
const DONE_COLUMNS = new Set(['ready_to_deploy', 'hecho', 'historial']);
/** Columnas que cuentan como "activas" en las métricas de sprint */
const ACTIVE_COLUMNS = new Set<KanbanColumna>(['todo', 'en_progreso', 'cliente_review']);

/**
 * Indica si el nombre de una etiqueta denota bloqueo/pausa.
 *
 * @remarks
 * Match por subcadena: cubre "bloqueada", "bloqueada y/o pausada" y
 * "pausada y/o bloqueada" con cualquier variante de espaciado/orden.
 *
 * @param name - Nombre de la etiqueta.
 * @returns `true` si el nombre incluye "bloqueada" o "pausada".
 */
export function isBlockedLabelName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.includes('bloqueada') || n.includes('pausada');
}

/**
 * Indica si una solicitud tiene alguna etiqueta de bloqueo.
 *
 * @param r - Solicitud a evaluar.
 * @returns `true` si alguna de sus etiquetas es de bloqueo/pausa.
 */
function isBlocked(r: Request): boolean {
  return r.categoria.some(isBlockedLabelName);
}

/** Columnas exentas de penalización (además de las done y bloqueadas). */
const PENALIZATION_EXEMPT_COLUMNS = new Set(['icebox']);
/** Sprints de atraso a partir de los cuales una solicitud abierta se penaliza.
 *  2 = penaliza al llevar 2 o más sprints de atraso. Cambiar a 3 para "estrictamente más de dos". */
const SPRINT_LAG = 2;

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Iniciales (hasta 2) de un nombre.
 *
 * @param name - Nombre completo.
 * @returns Las iniciales en mayúscula.
 */
function inits(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
}

/**
 * Días absolutos entre dos fechas ISO.
 *
 * @param a - Primera fecha.
 * @param b - Segunda fecha.
 * @returns La diferencia en días (sin signo).
 */
function daysBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

/**
 * Indica si una fecha ISO cae en el mes y año actuales.
 *
 * @param iso - Fecha ISO, o `null`.
 * @returns `true` si es del mes actual; `false` si es `null` u otro mes.
 */
function isThisMonth(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Promedio de una métrica de horas, excluyendo `null`.
 *
 * @remarks
 * Sin redondear — el formateo a "Xh Ym" se hace en la vista. Devuelve `null` si
 * ninguna solicitud tiene el dato (para mostrar "—").
 *
 * @param requests - Solicitudes.
 * @param pick - Extractor del valor de horas de cada solicitud.
 * @returns El promedio, o `null` si no hay valores.
 */
function avgHoras(requests: Request[], pick: (r: Request) => number | null): number | null {
  const vals = requests.map(pick).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Clave de orden cronológico unificado de un sprint.
 *
 * @remarks
 * Ordena por número de sprint del texto ("#11" → 11); si no hay, respalda por
 * fecha o ID. Evita que los históricos sin fecha se desfasen al medir distancia
 * entre sprints.
 *
 * @param s - Sprint.
 * @returns Un número de orden comparable.
 */
function sprintOrder(s: Sprint): number {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  if (m) return Number(m[1]);
  if (s.Sprint_Start_Date) return new Date(s.Sprint_Start_Date).getTime() / 86_400_000;
  return s.Sprint_ID;
}

/* ─── Delta vs sprint anterior ────────────────────────────── */

/**
 * Número de sprint extraído del texto ("Sprint #12 ..." → 12).
 *
 * @param s - Sprint.
 * @returns El número, o `null` si no hay patrón `#N`.
 */
function sprintNum(s: Sprint): number | null {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Año del sprint: de la fecha si existe, o del patrón `(YYYY)` del texto.
 *
 * @param s - Sprint.
 * @returns El año, o `null` si no se puede determinar.
 */
function sprintYearLocal(s: Sprint): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  return m ? Number(m[1]) : null;
}

/**
 * Encuentra el sprint inmediatamente anterior dentro del mismo linaje.
 *
 * @remarks
 * Linaje = con fecha (PRISMA) vs sin fecha (histórico migrado). Nunca se cruzan:
 * un sprint de PRISMA solo compara con otro de PRISMA, y un histórico solo con
 * otro histórico. Los PRISMA se ordenan por fecha; los históricos por (año,
 * número), con el año mandando sobre el número.
 *
 * @param current - Sprint actual.
 * @param all - Todos los sprints disponibles.
 * @returns El sprint anterior del mismo linaje, o `null` si no hay.
 */
function findPrevSprint(current: Sprint, all: Sprint[]): Sprint | null {
  const currentHasDate = !!current.Sprint_Start_Date;
  const sameLineage = all.filter(s => (!!s.Sprint_Start_Date) === currentHasDate);

  if (currentHasDate) {
    // PRISMA → orden cronológico por fecha
    const sorted = [...sameLineage].sort(
      (a, b) => a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!),
    );
    const idx = sorted.findIndex(s => s.Sprint_ID === current.Sprint_ID);
    return idx > 0 ? sorted[idx - 1] : null;
  }

  // Histórico → orden por (año, número); año manda sobre número
  const sorted = [...sameLineage].sort((a, b) => {
    const ya = sprintYearLocal(a), yb = sprintYearLocal(b);
    if (ya !== yb) return (ya ?? Infinity) - (yb ?? Infinity);
    const na = sprintNum(a), nb = sprintNum(b);
    return (na ?? Infinity) - (nb ?? Infinity);
  });
  const idx = sorted.findIndex(s => s.Sprint_ID === current.Sprint_ID);
  return idx > 0 ? sorted[idx - 1] : null;
}

/* ─── calcPenalizacion ────────────────────────────────────── */

/**
 * ⚠️ PENALIZACIÓN DESACTIVADA temporalmente.
 *
 * @remarks
 * Para reactivar, poner en `true`. El cálculo original queda intacto en
 * {@link calcPenalizacion}; con la bandera en `false` devuelve 0 (no penaliza) y
 * la vista muestra "N/A".
 */
export const PENALIZACION_ACTIVA: boolean = false;

/**
 * Penalización: doble de puntos de solicitudes sin resolver con atraso.
 *
 * @remarks
 * Penaliza las solicitudes abiertas (no done, no icebox, no bloqueadas, con
 * sprint) que llevan ≥ {@link SPRINT_LAG} sprints de atraso respecto al sprint de
 * referencia (el indicado, o el activo hoy, o el más reciente iniciado). Devuelve
 * 0 si {@link PENALIZACION_ACTIVA} es `false`.
 *
 * @param requests - Solicitudes a evaluar.
 * @param allSprints - Todos los sprints (para ordenar y ubicar el atraso).
 * @param refSprintId - Sprint de referencia, o `null` para autodetectarlo.
 * @returns La penalización total en puntos.
 */
function calcPenalizacion(requests: Request[], allSprints: Sprint[], refSprintId: number | null = null): number {
  if (!PENALIZACION_ACTIVA) return 0;   // ← desactivada: no penaliza. Flip a true para reactivar.
  const sorted = [...allSprints].sort((a, b) => sprintOrder(a) - sprintOrder(b));
  if (sorted.length === 0) return 0;

  // Referencia = sprint indicado; si no, sprint activo hoy; si no hay activo, el más reciente iniciado
  let refIdx: number;
  if (refSprintId != null) {
    refIdx = sorted.findIndex(s => s.Sprint_ID === refSprintId);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const active = sorted.find(s =>
      s.Sprint_Start_Date && s.Sprint_End_Date &&
      s.Sprint_Start_Date.slice(0, 10) <= today && today <= s.Sprint_End_Date.slice(0, 10)
    ) ?? [...sorted].reverse().find(s => s.Sprint_Start_Date && s.Sprint_Start_Date.slice(0, 10) <= today) ?? sorted[sorted.length - 1];
    refIdx = sorted.findIndex(s => s.Sprint_ID === active.Sprint_ID);
  }
  if (refIdx === -1) return 0;

  return requests
    .filter(r => !DONE_COLUMNS.has(r.columna) && !PENALIZATION_EXEMPT_COLUMNS.has(r.columna) && !isBlocked(r) && r.sprintId != null)
    .reduce((acc, r) => {
      const reqIdx = sorted.findIndex(s => s.Sprint_ID === r.sprintId);
      if (reqIdx === -1) return acc;
      if (refIdx - reqIdx >= SPRINT_LAG) {
        return acc + 2 * (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0);
      }
      return acc;
    }, 0);
}

/* ─── calcGeneral ─────────────────────────────────────────── */

/**
 * Calcula las métricas generales del board y su desglose por equipo.
 *
 * @remarks
 * Las columnas done siempre cuentan (ya pasaron cualquier columna de inicio de
 * stats), sin importar `minPos`; esto evita que históricos en "historial" caigan
 * a 0. Las bloqueadas se excluyen salvo que ya estén en done.
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param teams - Equipos del board.
 * @param statsConfig - Configuración de stats (posiciones e inicio por equipo).
 * @returns Las métricas generales ({@link GeneralStatsReal}).
 */
function calcGeneral(requests: Request[], teams: BoardTeam[], statsConfig?: StatsConfig): GeneralStatsReal {
  // Las columnas done SIEMPRE cuentan (ya pasaron cualquier columna de inicio de stats),
  // sin importar minPos. Esto evita que históricos en "historial" caigan a 0.
  const activeRequests = statsConfig
    ? requests.filter(r => DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && r.equipo.some(eq => {
        const minPos = statsConfig.statsStartByTeam[eq];
        if (minPos === undefined) return true;
        return (statsConfig.columnPositions[r.columna] ?? 0) >= minPos;
      })))
    : requests.filter(r => DONE_COLUMNS.has(r.columna) || !isBlocked(r));

const total = activeRequests.length;
  const resueltas  = activeRequests.filter(r => DONE_COLUMNS.has(r.columna)).length;
  const tasaGlobal = total > 0 ? Math.round((resueltas / total) * 100) : 0;

  const conCierre = activeRequests.filter(r => DONE_COLUMNS.has(r.columna) && r.fechaCierre && r.fechaApertura);
  const tiempoPromedio = conCierre.length > 0
    ? parseFloat((conCierre.reduce((a, r) => a + daysBetween(r.fechaApertura, r.fechaCierre!), 0) / conCierre.length).toFixed(1))
    : 0;

  const porEquipo: EquipoStatsReal[] = teams.map(team => {
    const eq     = team.Board_Team_Code;
    const minPos = statsConfig?.statsStartByTeam[eq];
    const mine   = requests.filter(r =>
      r.equipo.includes(eq) &&
      (DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && (minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos)))
    );
    const done    = mine.filter(r => DONE_COLUMNS.has(r.columna));
    const criticas = mine.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;
    const score   = mine.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
    return { equipo: eq, creadas: mine.length, resueltas: done.length, criticas, score };
  });

  return { total, resueltas, tasaGlobal, tiempoPromedio, porEquipo };
}

/* ─── calcBoard ───────────────────────────────────────────── */

/**
 * Calcula las estadísticas de un board/equipo, opcionalmente acotadas a sprint(s).
 *
 * @remarks
 * Las columnas done siempre entran (bypass de `minPos`); las bloqueadas/pausadas
 * se omiten como el icebox. Si hay sprints seleccionados, todo el detalle se
 * limita a ese/esos sprint(s) — incluidos históricos en "historial" que conservan
 * su `Sprint_ID`. Además calcula el "arrastre" (solicitudes de otros sprints
 * terminadas dentro de la ventana del seleccionado), que suma solo a resolutores
 * y, en columna 'hecho', al puntaje de otros sprints. La `meta` es el 83.334% del
 * puntaje planeado; el `cumplimiento` suma el arrastre y puede superar 100%.
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param equipo - Código del equipo.
 * @param statsConfig - Configuración de stats.
 * @param allSprints - Todos los sprints (para penalización).
 * @param selectedSprints - Sprints seleccionados (vacío = acumulado del equipo).
 * @returns Las estadísticas del board ({@link BoardStatsReal}).
 */
function calcBoard(requests: Request[], equipo: string, statsConfig?: StatsConfig, allSprints: Sprint[] = [], selectedSprints: Sprint[] = []): BoardStatsReal {
  const minPos = statsConfig?.statsStartByTeam[equipo];
  // Predicado de conteo: las columnas done siempre entran (bypass de minPos).
  // Las bloqueadas/pausadas se omiten como el icebox (salvo si ya están en done).
  const countable = (r: Request) =>
    DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && (minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos));

  const allMine = requests.filter(r => r.equipo.includes(equipo)); // sin filtro de posición
  const mine    = requests.filter(r => r.equipo.includes(equipo) && countable(r));

  // ── Filtro de sprint por equipo ────────────────────────────
  // Si hay uno o más sprints seleccionados, TODO el detalle del equipo
  // (solicitudes, resueltas, críticas, prioridades, resolutores y puntaje)
  // se limita a ese/esos sprint(s) — incluidos los históricos, cuyas
  // solicitudes migradas viven en la columna "historial" pero conservan
  // su Sprint_ID. Sin sprint seleccionado → acumulado total del equipo.
  const sprintSet   = new Set(selectedSprints.map(s => s.Sprint_ID));
  const inSelSprint = (r: Request) =>
    selectedSprints.length === 0 || (r.sprintId != null && sprintSet.has(r.sprintId));

  const allMineInSprint = allMine.filter(inSelSprint);
  const mineScoped      = mine.filter(inSelSprint);

  const done     = mineScoped.filter(r => DONE_COLUMNS.has(r.columna));
  const criticas = mineScoped.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;

  // ── Arrastre completado: solicitudes de OTROS sprints terminadas dentro de
  //    la ventana del/los sprint(s) seleccionado(s). Se suman SOLO a los
  //    resolutores (no a resueltas/puntaje/cumplimiento, que siguen acotados
  //    al sprint). Sin sprint seleccionado el concepto no aplica → []. ──
  const datedSel = selectedSprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  const inAnyWindow = (iso: string | null): boolean => {
    if (!iso) return false;
    const day = iso.slice(0, 10);
    return datedSel.some(s =>
      s.Sprint_Start_Date!.slice(0, 10) <= day && day <= s.Sprint_End_Date!.slice(0, 10)
    );
  };
  const arrastre = (selectedSprints.length === 0 || datedSel.length === 0) ? []
    : allMine.filter(r =>
        r.sprintId != null && !sprintSet.has(r.sprintId) &&
        DONE_COLUMNS.has(r.columna) && inAnyWindow(r.fechaCierre)
      );
  const doneResol = arrastre.length > 0 ? [...done, ...arrastre] : done;
  // La card "De otros sprints" cuenta SOLO 'hecho' (no ready_to_deploy ni
  // historial). El puntaje ahora usa el MISMO límite: solo 'hecho' suma al
  // cumplimiento, para que card y puntaje coincidan.
  const arrastreHecho       = arrastre.filter(r => r.columna === 'hecho');
  const puntajeOtrosSprints = arrastreHecho.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const otrosSprintsCount   = arrastreHecho.length;
  const otrosSprintsDetalle = (() => {
    const m = new Map<number, { sprintId: number; sprintName: string; count: number }>();
    for (const r of arrastreHecho) {
      const id = r.sprintId!;
      if (!m.has(id)) m.set(id, { sprintId: id, sprintName: r.sprintName ?? `Sprint ${id}`, count: 0 });
      m.get(id)!.count++;
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  })();

  // ── Métricas de sprint por equipo ──────────────────────────
  const puntajePlaneado  = mineScoped.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const puntajeRealizado = done.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

  const meta             = Math.round(puntajePlaneado * 0.83334);
  const refSprintId      = selectedSprints.length > 0
    ? [...selectedSprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
  const penalizacion     = calcPenalizacion(mine, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  // El arrastre suma al cumplimiento (meta intacta → puede pasar 100%).
  const cumplimiento     = meta > 0 ? Math.round(((puntajeReal + puntajeOtrosSprints) / meta) * 100) : 0;
  const colOrder: KanbanColumna[] = [
    'sin_categorizar','icebox','backlog','todo',
    'en_progreso','en_revision_qas','ready_to_deploy','hecho',
  ];
  const porColumna: ColStatReal[] = colOrder.map(col => ({
    label: COL_META[col].label,
    value: allMineInSprint.filter(r => r.columna === col).length,
    color: COL_META[col].color,
  }));
const porPrioridad: PriStatReal[] = PRI_META.map(p => ({
    label: p.label,
    value: mineScoped.filter(r => r.prioridad === p.key).length,
    color: p.color,
  }));

  type ResolAcc = {
    name: string; count: number; idx: number;
    solicitudes: Array<{ id: string; titulo: string; prioridad: Prioridad; fechaCierre: string | null; sprintName: string | null; labelIds: number[] }>;
  };
  const resolMap = new Map<number, ResolAcc>();
  let idx = 0;
  for (const r of doneResol) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++, solicitudes: [] });
      const acc = resolMap.get(a.userId)!;
      acc.count++;
      acc.solicitudes.push({
        id: r.id, titulo: r.titulo, prioridad: r.prioridad,
        fechaCierre: r.fechaCierre, sprintName: r.sprintName,
        labelIds: r.labelIds,
      });
    }
  }
  const resolutores = [...resolMap.entries()]
    .sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    .map(([userId, { name, count, idx: i, solicitudes }]) => ({
      userId, nombre: name, initials: inits(name), resueltas: count,
      avatarBg: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
      solicitudes,
    }));

  return { equipo, creadas: mineScoped.length, resueltas: done.length, criticas, meta, penalizacion, puntajeReal, cumplimiento, puntajeOtrosSprints, otrosSprintsCount, otrosSprintsDetalle, porColumna, porPrioridad, resolutores };
}

/* ─── calcBoardCombined ───────────────────────────────────── */

/**
 * Igual que {@link calcBoard} pero para varios equipos combinados por unión deduplicada.
 *
 * @remarks
 * Una solicitud que pertenece a más de un equipo seleccionado se cuenta una sola
 * vez: se prefiltra el universo a las que tocan cualquiera de los equipos. El
 * `minPos` combinado es el más permisivo (mínimo) entre los equipos, para no
 * ocultar columnas que un equipo cuenta y otro no.
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param equipos - Códigos de los equipos a combinar.
 * @param statsConfig - Configuración de stats.
 * @param allSprints - Todos los sprints (para penalización).
 * @param selectedSprints - Sprints seleccionados.
 * @returns Las estadísticas combinadas ({@link BoardStatsReal}); `equipo` es la
 *   unión de códigos con `+`.
 */
function calcBoardCombined(requests: Request[], equipos: string[], statsConfig?: StatsConfig, allSprints: Sprint[] = [], selectedSprints: Sprint[] = []): BoardStatsReal {
  const teamSet = new Set(equipos);
  // Unión deduplicada: solicitudes que tocan al menos uno de los equipos.
  // Al filtrar el universo ANTES, cada request aparece una sola vez aunque
  // pertenezca a varios equipos seleccionados.
  const union = requests.filter(r => r.equipo.some(eq => teamSet.has(eq)));

  // minPos combinado: el más permisivo (mínimo) entre los equipos, para no
  // ocultar columnas que un equipo cuenta y otro no.
  const minPositions = equipos
    .map(eq => statsConfig?.statsStartByTeam[eq])
    .filter((v): v is number => v !== undefined);
  const combinedMinPos = minPositions.length > 0 ? Math.min(...minPositions) : undefined;

  const countable = (r: Request) =>
    DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && (combinedMinPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= combinedMinPos));

  const allMine = union;
  const mine    = union.filter(countable);

  const sprintSet   = new Set(selectedSprints.map(s => s.Sprint_ID));
  const inSelSprint = (r: Request) =>
    selectedSprints.length === 0 || (r.sprintId != null && sprintSet.has(r.sprintId));

  const allMineInSprint = allMine.filter(inSelSprint);
  const mineScoped      = mine.filter(inSelSprint);

  const done     = mineScoped.filter(r => DONE_COLUMNS.has(r.columna));
  const criticas = mineScoped.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;

  // ── Arrastre completado (ver calcBoard): otros sprints terminados en la
  //    ventana del/los sprint(s) sel. Solo alimenta resolutores. ──
  const datedSel = selectedSprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  const inAnyWindow = (iso: string | null): boolean => {
    if (!iso) return false;
    const day = iso.slice(0, 10);
    return datedSel.some(s =>
      s.Sprint_Start_Date!.slice(0, 10) <= day && day <= s.Sprint_End_Date!.slice(0, 10)
    );
  };
  const arrastre = (selectedSprints.length === 0 || datedSel.length === 0) ? []
    : allMine.filter(r =>
        r.sprintId != null && !sprintSet.has(r.sprintId) &&
        DONE_COLUMNS.has(r.columna) && inAnyWindow(r.fechaCierre)
      );
  const doneResol = arrastre.length > 0 ? [...done, ...arrastre] : done;
  const puntajeOtrosSprints = arrastre.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  // La card "De otros sprints" cuenta SOLO las que están en la columna 'hecho'
  // (no ready_to_deploy ni historial). El puntaje de arriba usa Done completo.
  const arrastreHecho       = arrastre.filter(r => r.columna === 'hecho');
  const otrosSprintsCount   = arrastreHecho.length;
  const otrosSprintsDetalle = (() => {
    const m = new Map<number, { sprintId: number; sprintName: string; count: number }>();
    for (const r of arrastreHecho) {
      const id = r.sprintId!;
      if (!m.has(id)) m.set(id, { sprintId: id, sprintName: r.sprintName ?? `Sprint ${id}`, count: 0 });
      m.get(id)!.count++;
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  })();

  const puntajePlaneado  = mineScoped.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const puntajeRealizado = done.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const meta             = Math.round(puntajePlaneado * 0.83334);
  const refSprintId      = selectedSprints.length > 0
    ? [...selectedSprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
  const penalizacion     = calcPenalizacion(mine, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  // El arrastre suma al cumplimiento (meta intacta → puede pasar 100%).
  const cumplimiento     = meta > 0 ? Math.round(((puntajeReal + puntajeOtrosSprints) / meta) * 100) : 0;

  const colOrder: KanbanColumna[] = [
    'sin_categorizar','icebox','backlog','todo',
    'en_progreso','en_revision_qas','ready_to_deploy','hecho',
  ];
  const porColumna: ColStatReal[] = colOrder.map(col => ({
    label: COL_META[col].label,
    value: allMineInSprint.filter(r => r.columna === col).length,
    color: COL_META[col].color,
  }));
  const porPrioridad: PriStatReal[] = PRI_META.map(p => ({
    label: p.label,
    value: mineScoped.filter(r => r.prioridad === p.key).length,
    color: p.color,
  }));

  type ResolAcc = {
    name: string; count: number; idx: number;
    solicitudes: Array<{ id: string; titulo: string; prioridad: Prioridad; fechaCierre: string | null; sprintName: string | null; labelIds: number[] }>;
  };
  const resolMap = new Map<number, ResolAcc>();
  let idx = 0;
  for (const r of doneResol) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++, solicitudes: [] });
      const acc = resolMap.get(a.userId)!;
      acc.count++;
      acc.solicitudes.push({
        id: r.id, titulo: r.titulo, prioridad: r.prioridad,
        fechaCierre: r.fechaCierre, sprintName: r.sprintName,
        labelIds: r.labelIds,
      });
    }
  }
  const resolutores = [...resolMap.entries()]
    .sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    .map(([userId, { name, count, idx: i, solicitudes }]) => ({
      userId, nombre: name, initials: inits(name), resueltas: count,
      avatarBg: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
      solicitudes,
    }));

  return {
    equipo: equipos.join('+'),
    creadas: mineScoped.length, resueltas: done.length, criticas,
    meta, penalizacion, puntajeReal, cumplimiento, puntajeOtrosSprints,
    otrosSprintsCount, otrosSprintsDetalle,
    porColumna, porPrioridad, resolutores,
  };
}

/* ─── calcSprint ──────────────────────────────────────────── */

/**
 * Calcula las métricas de sprint (con o sin sprint(s) seleccionado(s)).
 *
 * @remarks
 * Sin sprints seleccionados calcula sobre todos los activos. Con uno o más,
 * acota al conjunto de sprints y distingue planeadas vs post-planning por la
 * fecha de apertura respecto al inicio del sprint (los históricos sin fecha se
 * cuentan como planeadas). Incluye "cerradas de otros sprints" dentro de la
 * ventana temporal (arrastre), cuyo puntaje —solo columna 'hecho'— suma al
 * cumplimiento. `planeadasMes`/`cerradasMes` usan el mes del sprint más antiguo
 * seleccionado. Las columnas done siempre cuentan; las bloqueadas se omiten salvo
 * done.
 *
 * @param requests - Solicitudes con scope de usuario/equipo, SIN filtro de sprint.
 * @param sprints - Sprints seleccionados (vacío = todos los activos).
 * @param statsConfig - Configuración de stats.
 * @param teamCode - Código de equipo para resolver `minPos`, o `null`.
 * @param allSprints - Todos los sprints (para penalización).
 * @param combinedMinPos - `minPos` combinado en modo multiequipo.
 * @returns Las métricas de sprint ({@link SprintStats}).
 */
function calcSprint(requests: Request[], sprints: Sprint[], statsConfig?: StatsConfig, teamCode?: string | null, allSprints: Sprint[] = [], combinedMinPos?: number): SprintStats {
  const score = (rs: Request[]) => rs.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

  const minPos: number | undefined = (() => {
    if (!statsConfig || Object.keys(statsConfig.statsStartByTeam).length === 0) return undefined;
    // Modo combinado: usa el mínimo (más permisivo) de los equipos seleccionados.
    if (combinedMinPos !== undefined) return combinedMinPos;
    if (teamCode) return statsConfig.statsStartByTeam[teamCode];
    const vals = Object.values(statsConfig.statsStartByTeam);
    return vals.length > 0 ? Math.min(...vals) : undefined;
  })();

  // Las columnas done SIEMPRE cuentan (bypass de minPos). Arregla históricos en "historial".
  // Las bloqueadas/pausadas se omiten como el icebox (salvo si ya están en done).
  const isCountable = (r: Request) =>
    DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && (minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos));

  /* ── Sin filtro de sprint → todos los activos ── */
  if (sprints.length === 0) {
    const active           = requests.filter(isCountable);
    const puntajePlaneado  = score(active);
    const puntajeRealizado = score(active.filter(r => DONE_COLUMNS.has(r.columna)));
    const meta             = Math.round(puntajePlaneado * 0.83334);
    const penalizacion     = calcPenalizacion(active, allSprints, null);
    const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
    const cumplimiento     = meta > 0 ? Math.round((puntajeReal / meta) * 100) : 0;
    return {
      sprint: null,
      planeadas:    active.length,
      activas:      active.filter(r => ACTIVE_COLUMNS.has(r.columna)).length,
      completadas:  active.filter(r => DONE_COLUMNS.has(r.columna)).length,
      bloqueadas:   requests.filter(isBlocked).length,
      postPlanning: 0,
      puntajePlaneado, puntajeRealizado, puntajePostPlanning: 0,
      planeadasMes: active.filter(r => isThisMonth(r.fechaApertura)).length,
      cerradasMes:  active.filter(r =>
        DONE_COLUMNS.has(r.columna) && isThisMonth(r.fechaCierre ?? r.fechaApertura)
      ).length,
tiempoEstimadoProm:  avgHoras(active.filter(r => DONE_COLUMNS.has(r.columna)), r => r.estimatedHours),
      tiempoConsumidoProm: avgHoras(active.filter(r => DONE_COLUMNS.has(r.columna)), r => r.loggedHours),
      otrosSprintsCerradas: null,
      otrosSprintsDetalle:  null,
      puntajeOtrosSprints:  0,
      meta, penalizacion, puntajeReal, cumplimiento,
    };
  }

  /* ── Uno o más sprints seleccionados ── */
  const sprintMap   = new Map(sprints.map(s => [s.Sprint_ID, s]));
  const sprintIdSet = new Set(sprints.map(s => s.Sprint_ID));

const inSprint = requests.filter(r => r.sprintId != null && sprintIdSet.has(r.sprintId));

  const activeInSprint = inSprint.filter(isCountable);
  // Las bloqueadas responden a los filtros de usuario/equipo (ya aplicados en `requests`)
  // pero NO al de sprint ni al de columna: una bloqueada cuenta exista donde exista.
  const bloqueadas     = inSprint.filter(isBlocked);

  // Histórico sin fecha → no se puede distinguir planeada/post-planning, todas cuentan como planeadas.
  const planeadas = activeInSprint.filter(r => {
    const sp = sprintMap.get(r.sprintId!);
    if (!sp || !sp.Sprint_Start_Date) return true;
    return r.fechaApertura.slice(0, 10) <= sp.Sprint_Start_Date.slice(0, 10);
  });
  const postPlan = activeInSprint.filter(r => {
    const sp = sprintMap.get(r.sprintId!);
    if (!sp || !sp.Sprint_Start_Date) return false;
    return r.fechaApertura.slice(0, 10) > sp.Sprint_Start_Date.slice(0, 10);
  });
  const activas     = activeInSprint.filter(r => ACTIVE_COLUMNS.has(r.columna));
  const completadas = activeInSprint.filter(r =>
    r.columna === 'ready_to_deploy' || r.columna === 'hecho' || r.columna === 'historial'
  );

  /* planeadasMes/cerradasMes: mes del sprint más antiguo seleccionado */
  const datedSprints = sprints.filter(s => s.Sprint_Start_Date);
  const earliest = datedSprints.length > 0
    ? datedSprints.reduce((a, b) => a.Sprint_Start_Date! < b.Sprint_Start_Date! ? a : b)
    : null;
  const sy = earliest ? new Date(earliest.Sprint_Start_Date!).getFullYear() : null;
  const sm = earliest ? new Date(earliest.Sprint_Start_Date!).getMonth() : null;
  const isSM = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === sy && d.getMonth() === sm;
  };

  const puntajePlaneado  = score(activeInSprint);
  const puntajeRealizado = score(completadas);
  const meta             = Math.round(puntajePlaneado * 0.83334);
  const refSprintId      = sprints.length > 0
    ? [...sprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
  // Opción A: la penalización se acota a las solicitudes del/los sprint(s)
  // seleccionado(s), no a todo el board. Así un sprint sin solicitudes propias
  // no arrastra deuda de otros sprints (elimina el −132 fantasma en sprints vacíos).
  // Opción Y: la penalización considera TODA la deuda del scope (equipo/usuario),
  // no solo las del sprint seleccionado. Una solicitud abierta del #12 penaliza
  // al mirar el #14 porque lleva ≥ SPRINT_LAG sprints de atraso respecto al ref.
  const penalizacion     = calcPenalizacion(requests, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);

  /* ── Cerradas de OTROS sprints dentro de la ventana del/los sprint(s) sel. ──
   *  Solicitudes cuyo sprintId pertenece a otro sprint (no seleccionado) pero
   *  que se terminaron durante la ventana temporal del/los sprint(s) activo(s).
   *  Señal de arrastre completado. `requests` llega con scope de equipo/usuario
   *  pero SIN filtro de sprint, por eso vemos tickets de otros sprints.
   *  Ventana = unión de [Start, End] de cada sprint seleccionado con fechas.
   *  Si ninguno de los seleccionados tiene fechas → sin ventana → null ("—"). */
  const datedSel = sprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  const inAnyWindow = (iso: string | null): boolean => {
    if (!iso) return false;
    const day = iso.slice(0, 10);
    return datedSel.some(s =>
      s.Sprint_Start_Date!.slice(0, 10) <= day && day <= s.Sprint_End_Date!.slice(0, 10)
    );
  };
  const otrosCerradas = datedSel.length === 0 ? null
    : requests.filter(r =>
        r.sprintId != null &&
        !sprintIdSet.has(r.sprintId) &&
        DONE_COLUMNS.has(r.columna) &&
        inAnyWindow(r.fechaCierre)
      );
  const otrosSprintsCerradas: number | null = otrosCerradas?.length ?? null;
  const otrosSprintsDetalle = otrosCerradas === null ? null : (() => {
    const m = new Map<number, { sprintId: number; sprintName: string; count: number }>();
    for (const r of otrosCerradas) {
      const id = r.sprintId!;
      if (!m.has(id)) m.set(id, { sprintId: id, sprintName: r.sprintName ?? `Sprint ${id}`, count: 0 });
      m.get(id)!.count++;
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  })();

  // El puntaje del arrastre suma al cumplimiento (meta intacta → puede pasar 100%).
  // Mismo límite que la card "De otros sprints": solo la columna 'hecho' cuenta
  // (no ready_to_deploy ni historial), para que puntaje y card coincidan.
  const puntajeOtrosSprints = (otrosCerradas ?? [])
    .filter(r => r.columna === 'hecho')
    .reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const cumplimiento = meta > 0 ? Math.round(((puntajeReal + puntajeOtrosSprints) / meta) * 100) : 0;

  return {
    sprint: sprints.length === 1 ? sprints[0] : null,
    planeadas:    planeadas.length,
    activas:      activas.length,
    completadas:  completadas.length,
    bloqueadas:   bloqueadas.length,
    postPlanning: postPlan.length,
    puntajePlaneado, puntajeRealizado, puntajePostPlanning: 0,
    planeadasMes: requests.filter(r => isCountable(r) && isSM(r.fechaApertura)).length,
    cerradasMes:  requests.filter(r =>
      DONE_COLUMNS.has(r.columna) && isCountable(r) && isSM(r.fechaCierre ?? r.fechaApertura)
    ).length,
tiempoEstimadoProm:  avgHoras(activeInSprint.filter(r => DONE_COLUMNS.has(r.columna)), r => r.estimatedHours),
    tiempoConsumidoProm: avgHoras(activeInSprint.filter(r => DONE_COLUMNS.has(r.columna)), r => r.loggedHours),
    otrosSprintsCerradas,
    otrosSprintsDetalle,
    puntajeOtrosSprints,
    meta, penalizacion, puntajeReal, cumplimiento,
  };
}

/* ─── buildPrimaryTeamMap ─────────────────────────────────── */

/**
 * Deriva el equipo principal de cada usuario a partir del historial de asignaciones.
 *
 * @remarks
 * Cuenta, por usuario, cuántas veces fue asignado a solicitudes de cada equipo, y
 * elige el equipo con más apariciones.
 *
 * @param requests - Solicitudes con sus asignados y equipos.
 * @returns Un `Map` de `userId → código de equipo principal`.
 */
function buildPrimaryTeamMap(requests: Request[]): Map<number, string> {
  const teamCount = new Map<number, Map<string, number>>();
  for (const req of requests) {
    for (const a of req.assignees) {
      if (!teamCount.has(a.userId)) teamCount.set(a.userId, new Map());
      for (const eq of req.equipo) {
        const c = teamCount.get(a.userId)!;
        c.set(eq, (c.get(eq) ?? 0) + 1);
      }
    }
  }
  const result = new Map<number, string>();
  for (const [userId, counts] of teamCount) {
    if (counts.size > 0) {
      result.set(userId, [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0]);
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   Métricas de flujo / salud del board (estándar ITSM + Kanban)
   Todo se calcula sobre el Request ya cargado — sin backend nuevo.
   ═══════════════════════════════════════════════════════════ */

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

/** Columnas de trabajo en curso vs backlog (para aging). 'ready_to_deploy'
 *  se considera done en todo el dashboard, así que no entra en WIP. */
const WIP_COLUMNS     = new Set<KanbanColumna>(['todo', 'en_progreso', 'en_revision_qas', 'cliente_review']);
/** Columnas de backlog (para aging del backlog). */
const BACKLOG_COLUMNS = new Set<KanbanColumna>(['sin_categorizar', 'icebox', 'backlog']);

/** Buckets de antigüedad (aging) con su umbral máximo en días y color. */
const AGING_BUCKETS = [
  { label: '< 1d',   max: 1,        color: 'rgba(0,229,160,0.75)'  },
  { label: '1-3d',   max: 3,        color: 'rgba(0,200,255,0.75)'  },
  { label: '3-7d',   max: 7,        color: 'rgba(239,159,39,0.75)' },
  { label: '7-30d',  max: 30,       color: 'rgba(251,113,33,0.75)' },
  { label: '> 30d',  max: Infinity, color: 'rgba(255,71,87,0.85)'  },
] as const;

/**
 * Convierte un timestamp ISO a epoch ms, normalizándolo a UTC.
 *
 * @remarks
 * Supabase devuelve timestamps sin 'Z'; se les añade para compararlos contra
 * `Date.now()` sin desfase de zona horaria.
 *
 * @param iso - Timestamp ISO.
 * @returns Epoch en ms (UTC).
 */
function toUtcMs(iso: string): number {
  const clean = iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`;
  return new Date(clean).getTime();
}

/**
 * Antigüedad en días desde una fecha ISO hasta ahora.
 *
 * @param iso - Fecha ISO.
 * @returns Días transcurridos (mínimo 0).
 */
function ageInDays(iso: string): number {
  return Math.max(0, (Date.now() - toUtcMs(iso)) / 86_400_000);
}

/**
 * Percentil por interpolación lineal sobre un array ya ordenado ascendente.
 *
 * @param sorted - Valores ordenados ascendentemente.
 * @param p - Percentil (0–100).
 * @returns El valor del percentil, o `null` si el array está vacío.
 */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

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

/* ─── Hook principal ──────────────────────────────────────── */

/**
 * Hook principal: calcula todas las métricas de estadísticas según los filtros.
 *
 * @remarks
 * Carga el board completo (variante stats) y los sprints, y deriva —memoizando
 * cada bloque— las métricas generales, por board, del sprint anterior (solo con
 * exactamente 1 sprint y si existe anterior del mismo linaje), del sprint, el
 * board combinado (solo con 2+ equipos) y las de flujo. También construye el
 * `primaryTeamMap`. Los filtros por usuario y por equipo/combinación se aplican
 * en cascada antes de cada cálculo.
 *
 * @param selectedSprintIds - IDs de sprints seleccionados.
 * @param teams - Equipos del board.
 * @param userFilter - Usuario por el que filtrar, o `null`.
 * @param teamCodeFilter - Equipo específico al que acotar el sprint, o `null`.
 * @param statsConfig - Configuración de stats (posiciones e inicio por equipo).
 * @param combinedTeams - Equipos combinados; con 2+ la vista de detalle usa la unión.
 * @returns El paquete completo de {@link StatsData}.
 */
export function useStatsData(
  selectedSprintIds: number[],
  teams:            BoardTeam[]    = [],
  userFilter:       number | null  = null,
  /** Cuando se elige un equipo específico, el sprint se filtra a ese equipo */
  teamCodeFilter:   string | null  = null,
  statsConfig?:     StatsConfig,
  /** Equipos combinados (Fase 1). Si tiene 2+, la vista de detalle usa la unión. */
  combinedTeams:    string[]       = [],
): StatsData {
  const boardQuery   = useBoardCompletoStats();
  const sprintsQuery = useSprints();

  const allRequests: Request[] = useMemo(() => {
    if (!boardQuery.data) return [];
    return Object.values(boardQuery.data).flat();
  }, [boardQuery.data]);

  const sprints: Sprint[] = sprintsQuery.data ?? [];

  const selectedSprints = useMemo(
    () => sprints.filter(s => selectedSprintIds.includes(s.Sprint_ID)),
    [sprints, selectedSprintIds],
  );

  /** Map userId → primaryTeam (derivado de historial de asignaciones) */
  const primaryTeamMap = useMemo(() => buildPrimaryTeamMap(allRequests), [allRequests]);

  /** Requests filtrados por assignee */
  const filteredRequests = useMemo(() => {
    if (!userFilter) return allRequests;
    return allRequests.filter(r => r.assignees.some(a => a.userId === userFilter));
  }, [allRequests, userFilter]);

  /** Requests filtrados por equipo — solo para calcSprint.
   *  Modo combinado (2+ equipos): unión deduplicada de los seleccionados.
   *  Modo clásico: el único teamCodeFilter. */
  const sprintRequests = useMemo(() => {
    if (combinedTeams.length >= 2) {
      const teamSet = new Set(combinedTeams);
      return filteredRequests.filter(r => r.equipo.some(eq => teamSet.has(eq)));
    }
    if (!teamCodeFilter) return filteredRequests;
    return filteredRequests.filter(r => r.equipo.includes(teamCodeFilter));
  }, [filteredRequests, teamCodeFilter, combinedTeams]);

  /** minPos combinado: mínimo de los statsStartByTeam de los equipos
   *  seleccionados. undefined si no hay combinación (o sin config). */
  const combinedMinPos = useMemo(() => {
    if (combinedTeams.length < 2 || !statsConfig) return undefined;
    const vals = combinedTeams
      .map(eq => statsConfig.statsStartByTeam[eq])
      .filter((v): v is number => v !== undefined);
    return vals.length > 0 ? Math.min(...vals) : undefined;
  }, [combinedTeams, statsConfig]);

  const general = useMemo(
    () => calcGeneral(filteredRequests, teams, statsConfig),
    [filteredRequests, teams, statsConfig],
  );

  const boards = useMemo(
    () => Object.fromEntries(teams.map(t => [t.Board_Team_Code, calcBoard(filteredRequests, t.Board_Team_Code, statsConfig, sprints, selectedSprints)])) as Record<string, BoardStatsReal>,
    [filteredRequests, teams, statsConfig, sprints, selectedSprints],
  );

  /** Board del sprint anterior — solo con exactamente 1 sprint seleccionado
   *  y si existe un anterior en el mismo linaje. */
  const boardsPrev = useMemo(() => {
    if (selectedSprints.length !== 1) return null;
    const prev = findPrevSprint(selectedSprints[0], sprints);
    if (!prev) return null;
    return Object.fromEntries(
      teams.map(t => [t.Board_Team_Code, calcBoard(filteredRequests, t.Board_Team_Code, statsConfig, sprints, [prev])]),
    ) as Record<string, BoardStatsReal>;
  }, [filteredRequests, teams, statsConfig, sprints, selectedSprints]);

const sprint = useMemo(
    () => calcSprint(
      sprintRequests, selectedSprints, statsConfig,
      combinedTeams.length >= 2 ? null : teamCodeFilter,
      sprints, combinedMinPos,
    ),
    [sprintRequests, selectedSprints, statsConfig, teamCodeFilter, sprints, combinedTeams, combinedMinPos],
  );

  /** Board combinado por unión — solo cuando hay 2+ equipos seleccionados. */
  const boardCombined = useMemo(() => {
    if (combinedTeams.length < 2) return null;
    return calcBoardCombined(filteredRequests, combinedTeams, statsConfig, sprints, selectedSprints);
  }, [filteredRequests, combinedTeams, statsConfig, sprints, selectedSprints]);

  /** Flujo/salud — sobre el set con scope de usuario + equipo/combinado
   *  (mismo universo que sprintRequests, sin filtro de sprint). */
  const flow = useMemo(() => calcFlowMetrics(sprintRequests), [sprintRequests]);

  return {
    general, boards, boardsPrev, boardCombined, sprint, flow,
    allRequests, primaryTeamMap, sprints,
    isLoading: boardQuery.isLoading || sprintsQuery.isLoading,
    isError:   boardQuery.isError   || sprintsQuery.isError,
  };
}