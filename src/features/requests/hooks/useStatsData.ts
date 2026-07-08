/* ============================================================
   useStatsData — calcula todas las métricas de estadísticas
   ============================================================ */

import { useMemo } from 'react';
import { useBoardCompletoStats } from '@/features/requests/hooks/useRequests';
import { useSprints }          from '@/features/requests/hooks/useSprints';
import { PRIORIDAD_TO_SCORE } from '@/features/requests/types';import type { Request, KanbanColumna, RequestAssignee, Prioridad } from '@/features/requests/types';
import type { BoardTeam }      from '@/features/requests/hooks/useBoardMetadata';
import type { Sprint }         from '@/features/requests/hooks/useSprints';

/* ─── Tipos exportados ─────────────────────────────────────── */

export type FilterUser = RequestAssignee & { primaryTeam: string };

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
};

export type EquipoStatsReal = {
  equipo:    string;
  creadas:   number;
  resueltas: number;
  criticas:  number;
  score:     number;
};

export type GeneralStatsReal = {
  total:          number;
  resueltas:      number;
  tasaGlobal:     number;
  tiempoPromedio: number;
  porEquipo:      EquipoStatsReal[];
};

export type ColStatReal = { label: string; value: number; color: string };
export type PriStatReal = { label: string; value: number; color: string };

export type BoardStatsReal = {
  equipo:       string;
  creadas:      number;
  resueltas:    number;
  criticas:     number;
  meta:         number;
  penalizacion: number;
  puntajeReal:  number;
  cumplimiento: number;
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
    }>;
  }>;
};
export type StatsConfig = {
  columnPositions:  Record<string, number>;
  statsStartByTeam: Record<string, number>;
};

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
  isLoading:    boolean;
  isError:      boolean;
};

/* ─── Constantes ──────────────────────────────────────────── */

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

const PRI_META = [
  { key: 'critica', label: 'Crítica', color: '#ff4757' },
  { key: 'alta',    label: 'Alta',    color: '#ffa502' },
  { key: 'media',   label: 'Media',   color: '#a78bfa' },
  { key: 'baja',    label: 'Baja',    color: '#5a6a8a' },
] as const;

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
/** true si el nombre de una label indica bloqueo/pausa.
 *  Match por subcadena: cubre "bloqueada", "bloqueada y/o pausada" y
 *  "pausada y/o bloqueada" con cualquier variante de espaciado/orden. */
export function isBlockedLabelName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.includes('bloqueada') || n.includes('pausada');
}
/** true si la solicitud tiene alguna label de bloqueo */
function isBlocked(r: Request): boolean {
  return r.categoria.some(isBlockedLabelName);
}
const PENALIZATION_EXEMPT_COLUMNS = new Set(['icebox']);
/** Sprints de atraso a partir de los cuales una solicitud abierta se penaliza.
 *  2 = penaliza al llevar 2 o más sprints de atraso. Cambiar a 3 para "estrictamente más de dos". */
const SPRINT_LAG = 2;

/* ─── Helpers ─────────────────────────────────────────────── */

function inits(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
}
function daysBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}
function isThisMonth(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
/** Promedio de una métrica de horas, excluyendo null. Sin redondear —
 *  el formateo a "Xh Ym" se hace en la vista.
 *  Devuelve null si ninguna solicitud tiene el dato (para mostrar "—"). */
function avgHoras(requests: Request[], pick: (r: Request) => number | null): number | null {
  const vals = requests.map(pick).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
/** Orden cronológico unificado: por número de sprint del texto ("#11" → 11);
 *  respaldo por fecha o ID. Esto evita que los históricos sin fecha se
 *  desfasen al medir distancia entre sprints. */
function sprintOrder(s: Sprint): number {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  if (m) return Number(m[1]);
  if (s.Sprint_Start_Date) return new Date(s.Sprint_Start_Date).getTime() / 86_400_000;
  return s.Sprint_ID;
}

/* ─── Delta vs sprint anterior ────────────────────────────── */
/** Número de sprint del texto ("Sprint #12 ..." → 12). Null si no hay patrón. */
function sprintNum(s: Sprint): number | null {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
/** Año del sprint: de la fecha si existe, o del patrón (YYYY) del texto. */
function sprintYearLocal(s: Sprint): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  return m ? Number(m[1]) : null;
}
/** Encuentra el sprint inmediatamente anterior DENTRO DEL MISMO LINAJE.
 *  Linaje = con fecha (PRISMA) vs sin fecha (histórico migrado). Nunca se
 *  cruzan: un sprint de PRISMA solo compara con otro de PRISMA, y un
 *  histórico solo con otro histórico. Devuelve null si no hay anterior. */
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
/** Doble de puntos de solicitudes sin resolver que llevan ≥ SPRINT_LAG sprints de atraso
 *  respecto al sprint de referencia (el seleccionado más reciente, o el activo hoy). */
function calcPenalizacion(requests: Request[], allSprints: Sprint[], refSprintId: number | null = null): number {
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
    .filter(r => !DONE_COLUMNS.has(r.columna) && !PENALIZATION_EXEMPT_COLUMNS.has(r.columna) && r.sprintId != null)
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
function calcGeneral(requests: Request[], teams: BoardTeam[], statsConfig?: StatsConfig): GeneralStatsReal {
  // Las columnas done SIEMPRE cuentan (ya pasaron cualquier columna de inicio de stats),
  // sin importar minPos. Esto evita que históricos en "historial" caigan a 0.
  const activeRequests = statsConfig
    ? requests.filter(r => DONE_COLUMNS.has(r.columna) || r.equipo.some(eq => {
        const minPos = statsConfig.statsStartByTeam[eq];
        if (minPos === undefined) return true;
        return (statsConfig.columnPositions[r.columna] ?? 0) >= minPos;
      }))
    : requests;

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
      (DONE_COLUMNS.has(r.columna) || minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos)
    );
    const done    = mine.filter(r => DONE_COLUMNS.has(r.columna));
    const criticas = mine.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;
    const score   = mine.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
    return { equipo: eq, creadas: mine.length, resueltas: done.length, criticas, score };
  });

  return { total, resueltas, tasaGlobal, tiempoPromedio, porEquipo };
}

/* ─── calcBoard ───────────────────────────────────────────── */
function calcBoard(requests: Request[], equipo: string, statsConfig?: StatsConfig, allSprints: Sprint[] = [], selectedSprints: Sprint[] = []): BoardStatsReal {
  const minPos = statsConfig?.statsStartByTeam[equipo];
  // Predicado de conteo: las columnas done siempre entran (bypass de minPos).
  const countable = (r: Request) =>
    DONE_COLUMNS.has(r.columna) || minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos;

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

  // ── Métricas de sprint por equipo ──────────────────────────
  const puntajePlaneado  = mineScoped.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const puntajeRealizado = done.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

  const meta             = Math.round(puntajePlaneado * 0.83334);
  const refSprintId      = selectedSprints.length > 0
    ? [...selectedSprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
  const penalizacion     = calcPenalizacion(mine, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  const cumplimiento     = meta > 0 ? Math.round((puntajeReal / meta) * 100) : 0;
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
    solicitudes: Array<{ id: string; titulo: string; prioridad: Prioridad; fechaCierre: string | null; sprintName: string | null }>;
  };
  const resolMap = new Map<number, ResolAcc>();
  let idx = 0;
  for (const r of done) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++, solicitudes: [] });
      const acc = resolMap.get(a.userId)!;
      acc.count++;
      acc.solicitudes.push({
        id: r.id, titulo: r.titulo, prioridad: r.prioridad,
        fechaCierre: r.fechaCierre, sprintName: r.sprintName,
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

  return { equipo, creadas: mineScoped.length, resueltas: done.length, criticas, meta, penalizacion, puntajeReal, cumplimiento, porColumna, porPrioridad, resolutores };
}

/* ─── calcBoardCombined ───────────────────────────────────── */
/** Igual que calcBoard pero para VARIOS equipos combinados por UNIÓN
 *  deduplicada: una solicitud que pertenece a más de un equipo seleccionado
 *  se cuenta UNA sola vez. Se logra pre-filtrando las solicitudes a las que
 *  tocan cualquiera de los equipos y pasándolas a calcBoard con un predicado
 *  de pertenencia que acepta el conjunto. Reutiliza toda la lógica de
 *  calcBoard sin duplicarla. */
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
    DONE_COLUMNS.has(r.columna) || combinedMinPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= combinedMinPos;

  const allMine = union;
  const mine    = union.filter(countable);

  const sprintSet   = new Set(selectedSprints.map(s => s.Sprint_ID));
  const inSelSprint = (r: Request) =>
    selectedSprints.length === 0 || (r.sprintId != null && sprintSet.has(r.sprintId));

  const allMineInSprint = allMine.filter(inSelSprint);
  const mineScoped      = mine.filter(inSelSprint);

  const done     = mineScoped.filter(r => DONE_COLUMNS.has(r.columna));
  const criticas = mineScoped.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;

  const puntajePlaneado  = mineScoped.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const puntajeRealizado = done.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
  const meta             = Math.round(puntajePlaneado * 0.83334);
  const refSprintId      = selectedSprints.length > 0
    ? [...selectedSprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
  const penalizacion     = calcPenalizacion(mine, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  const cumplimiento     = meta > 0 ? Math.round((puntajeReal / meta) * 100) : 0;

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
    solicitudes: Array<{ id: string; titulo: string; prioridad: Prioridad; fechaCierre: string | null; sprintName: string | null }>;
  };
  const resolMap = new Map<number, ResolAcc>();
  let idx = 0;
  for (const r of done) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++, solicitudes: [] });
      const acc = resolMap.get(a.userId)!;
      acc.count++;
      acc.solicitudes.push({
        id: r.id, titulo: r.titulo, prioridad: r.prioridad,
        fechaCierre: r.fechaCierre, sprintName: r.sprintName,
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
    meta, penalizacion, puntajeReal, cumplimiento,
    porColumna, porPrioridad, resolutores,
  };
}

/* ─── calcSprint ──────────────────────────────────────────── */
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
  const isCountable = (r: Request) =>
    DONE_COLUMNS.has(r.columna) || minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos;

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
      tiempoEstimadoProm:  avgHoras(active, r => r.estimatedHours),
      tiempoConsumidoProm: avgHoras(active.filter(r => DONE_COLUMNS.has(r.columna)), r => r.loggedHours),
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
  const penalizacion     = calcPenalizacion(activeInSprint, allSprints, refSprintId);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  const cumplimiento     = meta > 0 ? Math.round((puntajeReal / meta) * 100) : 0;

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
    tiempoEstimadoProm:  avgHoras(activeInSprint, r => r.estimatedHours),
    tiempoConsumidoProm: avgHoras(activeInSprint.filter(r => DONE_COLUMNS.has(r.columna)), r => r.loggedHours),
    meta, penalizacion, puntajeReal, cumplimiento,
  };
}
/* ─── buildPrimaryTeamMap ─────────────────────────────────── */
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

/* ─── Hook principal ──────────────────────────────────────── */
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

  return {
    general, boards, boardsPrev, boardCombined, sprint,
    allRequests, primaryTeamMap, sprints,
    isLoading: boardQuery.isLoading || sprintsQuery.isLoading,
    isError:   boardQuery.isError   || sprintsQuery.isError,
  };
}