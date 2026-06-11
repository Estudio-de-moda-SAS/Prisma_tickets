/* ============================================================
   useStatsData — calcula todas las métricas de estadísticas
   ============================================================ */

import { useMemo } from 'react';
import { useBoardCompleto }    from '@/features/requests/hooks/useRequests';
import { useSprints }          from '@/features/requests/hooks/useSprints';
import { PRIORIDAD_TO_SCORE }  from '@/features/requests/types';
import type { Request, KanbanColumna, RequestAssignee } from '@/features/requests/types';
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
};

export type EquipoStatsReal = {
  equipo:    string;
  creadas:   number;
  resueltas: number;
  sla:       number;
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
  sla:          number;
  criticas:     number;
  porColumna:   ColStatReal[];
  porPrioridad: PriStatReal[];
  resolutores:  Array<{
    userId:    number;
    nombre:    string;
    initials:  string;
    resueltas: number;
    avatarBg:  string;
  }>;
};

export type StatsData = {
  general:      GeneralStatsReal;
  boards:       Record<string, BoardStatsReal>;
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

/** SLA targets por prioridad (días corridos desde apertura hasta cierre) */
const SLA_TARGETS: Record<string, number> = {
  critica:  1,
  alta:     3,
  media:    7,
  baja:    14,
};
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

/* ─── calcGeneral ─────────────────────────────────────────── */
function calcGeneral(requests: Request[], teams: BoardTeam[]): GeneralStatsReal {
  const total     = requests.length;
  const resueltas = requests.filter(r => DONE_COLUMNS.has(r.columna)).length;
  const tasaGlobal = total > 0 ? Math.round((resueltas / total) * 100) : 0;

  const conCierre = requests.filter(r => DONE_COLUMNS.has(r.columna) && r.fechaCierre && r.fechaApertura);
  const tiempoPromedio = conCierre.length > 0
    ? parseFloat((conCierre.reduce((a, r) => a + daysBetween(r.fechaApertura, r.fechaCierre!), 0) / conCierre.length).toFixed(1))
    : 0;

  const porEquipo: EquipoStatsReal[] = teams.map(team => {
    const eq   = team.Board_Team_Code;
    const mine = requests.filter(r => r.equipo.includes(eq));
    const done = mine.filter(r => DONE_COLUMNS.has(r.columna));
    const criticas = mine.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;
const sla = done.length > 0
  ? Math.round(
      done.filter(r =>
        r.fechaCierre && r.fechaApertura &&
        daysBetween(r.fechaApertura, r.fechaCierre) <= (SLA_TARGETS[r.prioridad] ?? 7)
      ).length / done.length * 100
    )
  : 0;
    const score = mine.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
    return { equipo: eq, creadas: mine.length, resueltas: done.length, sla, criticas, score };
  });

  return { total, resueltas, tasaGlobal, tiempoPromedio, porEquipo };
}

/* ─── calcBoard ───────────────────────────────────────────── */
function calcBoard(requests: Request[], equipo: string): BoardStatsReal {
  const mine = requests.filter(r => r.equipo.includes(equipo));
  const done = mine.filter(r => DONE_COLUMNS.has(r.columna));
  const criticas = mine.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;
const sla = done.length > 0
  ? Math.round(
      done.filter(r =>
        r.fechaCierre && r.fechaApertura &&
        daysBetween(r.fechaApertura, r.fechaCierre) <= (SLA_TARGETS[r.prioridad] ?? 7)
      ).length / done.length * 100
    )
  : 0;
  const colOrder: KanbanColumna[] = [
    'sin_categorizar','icebox','backlog','todo',
    'en_progreso','en_revision_qas','ready_to_deploy','hecho',
  ];
  const porColumna: ColStatReal[] = colOrder.map(col => ({
    label: COL_META[col].label,
    value: mine.filter(r => r.columna === col).length,
    color: COL_META[col].color,
  }));
  const porPrioridad: PriStatReal[] = PRI_META.map(p => ({
    label: p.label,
    value: mine.filter(r => r.prioridad === p.key).length,
    color: p.color,
  }));

  const resolMap = new Map<number, { name: string; count: number; idx: number }>();
  let idx = 0;
  for (const r of done) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++ });
      resolMap.get(a.userId)!.count++;
    }
  }
  const resolutores = [...resolMap.entries()]
    .sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    .map(([userId, { name, count, idx: i }]) => ({
      userId, nombre: name, initials: inits(name), resueltas: count,
      avatarBg: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
    }));

  return { equipo, creadas: mine.length, resueltas: done.length, sla, criticas, porColumna, porPrioridad, resolutores };
}

/* ─── calcSprint ──────────────────────────────────────────── */
function calcSprint(requests: Request[], sprint: Sprint | null): SprintStats {
  const score = (rs: Request[]) => rs.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);

  if (!sprint) {
    return {
      sprint: null, planeadas: requests.length,
      activas:      requests.filter(r => r.columna === 'en_progreso').length,
// 7
completadas: requests.filter(r => DONE_COLUMNS.has(r.columna)).length,      bloqueadas:   requests.filter(r => r.columna === 'icebox').length,
      postPlanning: 0,
      puntajePlaneado:     score(requests),
      puntajeRealizado:    score(requests.filter(r =>
        r.columna === 'ready_to_deploy' || r.columna === 'hecho' || r.columna === 'historial'
      )),
      puntajePostPlanning: 0,
      planeadasMes: requests.filter(r => isThisMonth(r.fechaApertura)).length,
      cerradasMes: requests.filter(r =>
        DONE_COLUMNS.has(r.columna) &&
        isThisMonth(r.fechaCierre ?? r.fechaApertura)
      ).length,
    };
  }

  const start       = new Date(sprint.Sprint_Start_Date);
  const inSprint    = requests.filter(r => r.sprintId === sprint.Sprint_ID);
  const planeadas   = inSprint.filter(r => new Date(r.fechaApertura) <= start);
  const postPlan    = inSprint.filter(r => new Date(r.fechaApertura) >  start);
const activas     = inSprint.filter(r => r.columna === 'en_progreso');
  // "Completada" = cualquier columna final (hecho + historial), alineado con COLUMNAS_FINALES
  const completadas = inSprint.filter(r =>
    r.columna === 'ready_to_deploy' ||
    r.columna === 'hecho'           ||
    r.columna === 'historial'
  );
  const bloqueadas  = inSprint.filter(r => r.columna === 'icebox');
  
  const sy = start.getFullYear(), sm = start.getMonth();
  const isSM = (iso: string | null) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === sy && d.getMonth() === sm; };

  return {
    sprint, planeadas: planeadas.length, activas: activas.length,
    completadas: completadas.length, bloqueadas: bloqueadas.length, postPlanning: postPlan.length,
puntajePlaneado:     score(inSprint),   
    puntajeRealizado:    score(completadas),
    puntajePostPlanning: 0,           
    planeadasMes: requests.filter(r => isSM(r.fechaApertura)).length,
    cerradasMes: requests.filter(r =>
      DONE_COLUMNS.has(r.columna) &&
      isSM(r.fechaCierre ?? r.fechaApertura)
    ).length,
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
  selectedSprintId: number | null,
  teams:            BoardTeam[]    = [],
  userFilter:       number | null  = null,
  /** Cuando se elige un equipo específico, el sprint se filtra a ese equipo */
  teamCodeFilter:   string | null  = null,
): StatsData {
  const boardQuery   = useBoardCompleto();
  const sprintsQuery = useSprints();

  const allRequests: Request[] = useMemo(() => {
    if (!boardQuery.data) return [];
    return Object.values(boardQuery.data).flat();
  }, [boardQuery.data]);

  const sprints: Sprint[] = sprintsQuery.data ?? [];

  const selectedSprint = useMemo(
    () => sprints.find(s => s.Sprint_ID === selectedSprintId) ?? null,
    [sprints, selectedSprintId],
  );

  /** Map userId → primaryTeam (derivado de historial de asignaciones) */
  const primaryTeamMap = useMemo(() => buildPrimaryTeamMap(allRequests), [allRequests]);

  /** Requests filtrados por assignee */
  const filteredRequests = useMemo(() => {
    if (!userFilter) return allRequests;
    return allRequests.filter(r => r.assignees.some(a => a.userId === userFilter));
  }, [allRequests, userFilter]);

  /** Requests filtrados por equipo — solo para calcSprint */
  const sprintRequests = useMemo(() => {
    if (!teamCodeFilter) return filteredRequests;
    return filteredRequests.filter(r => r.equipo.includes(teamCodeFilter));
  }, [filteredRequests, teamCodeFilter]);

  const general = useMemo(() => calcGeneral(filteredRequests, teams), [filteredRequests, teams]);

  const boards = useMemo(
    () => Object.fromEntries(teams.map(t => [t.Board_Team_Code, calcBoard(filteredRequests, t.Board_Team_Code)])) as Record<string, BoardStatsReal>,
    [filteredRequests, teams],
  );

  const sprint = useMemo(
    () => calcSprint(sprintRequests, selectedSprint),
    [sprintRequests, selectedSprint],
  );

  return {
    general, boards, sprint,
    allRequests, primaryTeamMap, sprints,
    isLoading: boardQuery.isLoading || sprintsQuery.isLoading,
    isError:   boardQuery.isError   || sprintsQuery.isError,
  };
}