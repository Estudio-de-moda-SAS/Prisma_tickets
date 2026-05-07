/* ============================================================
   useStatsData — calcula todas las métricas de estadísticas
   desde los requests reales + sprints.
   Compatible con mock (USE_MOCK: true) y live data.
   ============================================================ */

import { useMemo } from 'react';
import { useBoardCompleto } from '@/features/requests/hooks/useRequests';
import { useSprints }       from '@/features/requests/hooks/useSprints';
import {
  PRIORIDAD_TO_SCORE,
  EQUIPOS,
} from '@/features/requests/types';
import type { Equipo, Request, KanbanColumna } from '@/features/requests/types';
import type { Sprint }                          from '@/features/requests/hooks/useSprints';

/* ─── Tipos de salida ─────────────────────────────────────── */

export type SprintStats = {
  sprint:           Sprint | null;
  planeadas:        number;   // en columna todo/en_progreso/hecho al inicio del sprint
  activas:          number;   // en_progreso
  completadas:      number;   // hecho
  bloqueadas:       number;   // icebox
  postPlanning:     number;   // creadas DESPUÉS del inicio del sprint
  puntajeTotal:     number;   // sum score de todas (planeadas + nuevas)
  puntajeRealizado: number;   // sum score de las completadas
  planeadasMes:     number;   // creadas en el mes actual
  cerradasMes:      number;   // cerradas (fechaCierre) en el mes actual
};

export type EquipoStatsReal = {
  equipo:    Equipo;
  creadas:   number;
  resueltas: number;
  sla:       number;   // % con deadline cumplido
  criticas:  number;
  score:     number;
};

export type GeneralStatsReal = {
  total:          number;
  resueltas:      number;
  tasaGlobal:     number;
  tiempoPromedio: number;   // días promedio hasta cierre
  porEquipo:      EquipoStatsReal[];
};

export type ColStatReal  = { label: string; value: number; color: string };
export type PriStatReal  = { label: string; value: number; color: string };

export type BoardStatsReal = {
  equipo:       Equipo;
  creadas:      number;
  resueltas:    number;
  sla:          number;
  criticas:     number;
  porColumna:   ColStatReal[];
  porPrioridad: PriStatReal[];
  resolutores:  Array<{ nombre: string; initials: string; resueltas: number; avatarBg: string }>;
};

export type StatsData = {
  general:      GeneralStatsReal;
  boards:       Record<Equipo, BoardStatsReal>;
  sprint:       SprintStats;
  allRequests:  Request[];
  sprints:      Sprint[];
  isLoading:    boolean;
  isError:      boolean;
};

const COL_META: Record<KanbanColumna, { label: string; color: string }> = {
  sin_categorizar: { label: 'Sin cat.',    color: 'rgba(90,106,138,0.7)'  },
  icebox:          { label: 'Icebox',      color: 'rgba(120,130,160,0.7)' },
  backlog:         { label: 'Backlog',     color: 'rgba(127,119,221,0.7)' },
  todo:            { label: 'To do',       color: 'rgba(239,159,39,0.7)'  },
  en_progreso:     { label: 'En prog.',    color: 'rgba(0,200,255,0.7)'   },
  hecho:           { label: 'Hecho',       color: 'rgba(0,229,160,0.7)'   },
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

/* ─── Helpers ─────────────────────────────────────────────── */
function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

function daysBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

function isThisMonth(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/* ─── Cálculo general ─────────────────────────────────────── */
function calcGeneral(requests: Request[]): GeneralStatsReal {
  const total     = requests.length;
  const resueltas = requests.filter((r) => r.columna === 'hecho').length;
  const tasaGlobal = total > 0 ? Math.round((resueltas / total) * 100) : 0;

  const conCierre = requests.filter((r) => r.columna === 'hecho' && r.fechaCierre && r.fechaApertura);
  const tiempoPromedio = conCierre.length > 0
    ? parseFloat((conCierre.reduce((acc, r) => acc + daysBetween(r.fechaApertura, r.fechaCierre!), 0) / conCierre.length).toFixed(1))
    : 0;

  const equipos = Object.keys(EQUIPOS) as Equipo[];
  const porEquipo: EquipoStatsReal[] = equipos.map((eq) => {
    const mine     = requests.filter((r) => r.equipo.includes(eq));
    const resuelts = mine.filter((r) => r.columna === 'hecho');
    const criticas = mine.filter((r) => r.prioridad === 'critica' && r.columna !== 'hecho').length;

    // SLA: % de resueltas que cerraron antes o en el deadline
    const conDl  = resuelts.filter((r) => r.deadline && r.fechaCierre);
    const sla    = conDl.length > 0
      ? Math.round(conDl.filter((r) => new Date(r.fechaCierre!) <= new Date(r.deadline!)).length / conDl.length * 100)
      : mine.length > 0 ? 85 : 0; // fallback si no hay deadlines

    const score = mine.reduce((acc, r) => acc + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

    return {
      equipo: eq, creadas: mine.length, resueltas: resuelts.length,
      sla, criticas, score,
    };
  });

  return { total, resueltas, tasaGlobal, tiempoPromedio, porEquipo };
}

/* ─── Cálculo por board ───────────────────────────────────── */
function calcBoard(requests: Request[], equipo: Equipo): BoardStatsReal {
  const mine     = requests.filter((r) => r.equipo.includes(equipo));
  const resuelts = mine.filter((r) => r.columna === 'hecho');
  const criticas = mine.filter((r) => r.prioridad === 'critica' && r.columna !== 'hecho').length;

  const conDl = resuelts.filter((r) => r.deadline && r.fechaCierre);
  const sla   = conDl.length > 0
    ? Math.round(conDl.filter((r) => new Date(r.fechaCierre!) <= new Date(r.deadline!)).length / conDl.length * 100)
    : mine.length > 0 ? 85 : 0;

  const colOrder: KanbanColumna[] = ['sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso', 'hecho'];
  const porColumna: ColStatReal[] = colOrder.map((col) => ({
    label: COL_META[col].label,
    value: mine.filter((r) => r.columna === col).length,
    color: COL_META[col].color,
  }));

  const porPrioridad: PriStatReal[] = PRI_META.map((p) => ({
    label: p.label,
    value: mine.filter((r) => r.prioridad === p.key).length,
    color: p.color,
  }));

  // Resolutores: agrupa por assignee
  const resolMap = new Map<string, { count: number; idx: number }>();
  let idx = 0;
  for (const r of resuelts) {
    for (const a of r.assignees) {
      const k = a.userName;
      if (!resolMap.has(k)) { resolMap.set(k, { count: 0, idx: idx++ }); }
      resolMap.get(k)!.count++;
    }
  }

  const resolutores = [...resolMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([nombre, { count, idx: i }]) => ({
      nombre,
      initials: initials(nombre),
      resueltas: count,
      avatarBg: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
    }));

  return { equipo, creadas: mine.length, resueltas: resuelts.length, sla, criticas, porColumna, porPrioridad, resolutores };
}

/* ─── Cálculo sprint ──────────────────────────────────────── */
function calcSprint(requests: Request[], sprint: Sprint | null): SprintStats {
  if (!sprint) {
    // Sin sprint seleccionado: métricas globales del mes
    const now = new Date();
    const all = requests;
    return {
      sprint:           null,
      planeadas:        all.length,
      activas:          all.filter((r) => r.columna === 'en_progreso').length,
      completadas:      all.filter((r) => r.columna === 'hecho').length,
      bloqueadas:       all.filter((r) => r.columna === 'icebox').length,
      postPlanning:     0,
      puntajeTotal:     all.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0),
      puntajeRealizado: all.filter((r) => r.columna === 'hecho').reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0),
      planeadasMes:     all.filter((r) => isThisMonth(r.fechaApertura)).length,
      cerradasMes:      all.filter((r) => isThisMonth(r.fechaCierre)).length,
    };
  }

  const start = new Date(sprint.Sprint_Start_Date);
  const end   = new Date(sprint.Sprint_End_Date);

  // Requests asociadas al sprint
  const inSprint = requests.filter((r) => r.sprintId === sprint.Sprint_ID);
  // Creadas antes o al inicio del sprint = "planeadas"
  const planeadas = inSprint.filter((r) => new Date(r.fechaApertura) <= start);
  // Ingresadas post planning
  const postPlanning = inSprint.filter((r) => new Date(r.fechaApertura) > start);

  const activas     = inSprint.filter((r) => r.columna === 'en_progreso');
  const completadas = inSprint.filter((r) => r.columna === 'hecho');
  const bloqueadas  = inSprint.filter((r) => r.columna === 'icebox');

  const score = (rs: Request[]) => rs.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

  // Mes del sprint (usamos fecha de inicio)
  const sprintMonth = start.getMonth();
  const sprintYear  = start.getFullYear();
  const isSprintMonth = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === sprintYear && d.getMonth() === sprintMonth;
  };

  return {
    sprint,
    planeadas:        planeadas.length,
    activas:          activas.length,
    completadas:      completadas.length,
    bloqueadas:       bloqueadas.length,
    postPlanning:     postPlanning.length,
    puntajeTotal:     score(inSprint),
    puntajeRealizado: score(completadas),
    planeadasMes:     requests.filter((r) => isSprintMonth(r.fechaApertura)).length,
    cerradasMes:      requests.filter((r) => isSprintMonth(r.fechaCierre)).length,
  };
}

/* ─── Hook principal ──────────────────────────────────────── */
export function useStatsData(selectedSprintId: number | null): StatsData {
  const boardQuery   = useBoardCompleto();
  const sprintsQuery = useSprints();

  const allRequests: Request[] = useMemo(() => {
    if (!boardQuery.data) return [];
    return Object.values(boardQuery.data).flat();
  }, [boardQuery.data]);

  const sprints: Sprint[] = sprintsQuery.data ?? [];

  const selectedSprint = useMemo(
    () => sprints.find((s) => s.Sprint_ID === selectedSprintId) ?? null,
    [sprints, selectedSprintId],
  );

  const general = useMemo(() => calcGeneral(allRequests), [allRequests]);

  const boards = useMemo(() => {
    const equipos = Object.keys(EQUIPOS) as Equipo[];
    return Object.fromEntries(
      equipos.map((eq) => [eq, calcBoard(allRequests, eq)]),
    ) as Record<Equipo, BoardStatsReal>;
  }, [allRequests]);

  const sprint = useMemo(
    () => calcSprint(allRequests, selectedSprint),
    [allRequests, selectedSprint],
  );

  return {
    general,
    boards,
    sprint,
    allRequests,
    sprints,
    isLoading: boardQuery.isLoading || sprintsQuery.isLoading,
    isError:   boardQuery.isError   || sprintsQuery.isError,
  };
}