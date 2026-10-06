/**
 * Constantes de las métricas de estadísticas: columnas, metadatos visuales,
 * umbrales de penalización y buckets de aging.
 *
 * @module stats/constants
 */

import type { KanbanColumna } from '@/features/requests/types';

/* ─── Columnas ────────────────────────────────────────────── */

/** Columnas que cuentan como resueltas en todas las métricas */
export const DONE_COLUMNS = new Set(['ready_to_deploy', 'hecho', 'historial']);
/** Columnas que cuentan como "activas" en las métricas de sprint */
export const ACTIVE_COLUMNS = new Set<KanbanColumna>(['todo', 'en_progreso', 'cliente_review']);
/** Columnas de trabajo en curso vs backlog (para aging). 'ready_to_deploy'
 *  se considera done en todo el dashboard, así que no entra en WIP. */
export const WIP_COLUMNS = new Set<KanbanColumna>(['todo', 'en_progreso', 'en_revision_qas', 'cliente_review']);
/** Columnas de backlog (para aging del backlog). */
export const BACKLOG_COLUMNS = new Set<KanbanColumna>(['sin_categorizar', 'icebox', 'backlog']);
/** Orden de columnas para la distribución por columna de un board. */
export const BOARD_COLUMN_ORDER: KanbanColumna[] = [
  'sin_categorizar','icebox','backlog','todo',
  'en_progreso','en_revision_qas','ready_to_deploy','hecho',
];

/* ─── Metadatos visuales ──────────────────────────────────── */

/** Metadatos visuales (label + color) por columna del kanban. */
export const COL_META: Record<KanbanColumna, { label: string; color: string }> = {
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
export const PRI_META = [
  { key: 'critica', label: 'Crítica', color: '#ff4757' },
  { key: 'alta',    label: 'Alta',    color: '#ffa502' },
  { key: 'media',   label: 'Media',   color: '#a78bfa' },
  { key: 'baja',    label: 'Baja',    color: '#5a6a8a' },
] as const;

/** Gradientes de avatar asignados cíclicamente a los resolutores. */
export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#0055cc,#00c8ff)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0f6e56,#00e5a0)',
  'linear-gradient(135deg,#854F0B,#EF9F27)',
  'linear-gradient(135deg,#185FA5,#378ADD)',
  'linear-gradient(135deg,#3B6D11,#97C459)',
  'linear-gradient(135deg,#534AB7,#a78bfa)',
  'linear-gradient(135deg,#8B1A1A,#ff6b6b)',
];

/* ─── Puntaje y penalización ──────────────────────────────── */

/** Fracción del puntaje planeado que constituye la meta del sprint. */
export const META_RATIO = 0.83334;

/**
 * ⚠️ PENALIZACIÓN DESACTIVADA temporalmente.
 *
 * @remarks
 * Para reactivar, poner en `true`. El cálculo original queda intacto en
 * `calcPenalizacion`; con la bandera en `false` devuelve 0 (no penaliza) y
 * la vista muestra "N/A".
 */
export const PENALIZACION_ACTIVA: boolean = false;

/** Columnas exentas de penalización (además de las done y bloqueadas). */
export const PENALIZATION_EXEMPT_COLUMNS = new Set(['icebox']);
/** Sprints de atraso a partir de los cuales una solicitud abierta se penaliza.
 *  2 = penaliza al llevar 2 o más sprints de atraso. Cambiar a 3 para "estrictamente más de dos". */
export const SPRINT_LAG = 2;

/* ─── Aging ───────────────────────────────────────────────── */

/** Buckets de antigüedad (aging) con su umbral máximo en días y color. */
export const AGING_BUCKETS = [
  { label: '< 1d',   max: 1,        color: 'rgba(0,229,160,0.75)'  },
  { label: '1-3d',   max: 3,        color: 'rgba(0,200,255,0.75)'  },
  { label: '3-7d',   max: 7,        color: 'rgba(239,159,39,0.75)' },
  { label: '7-30d',  max: 30,       color: 'rgba(251,113,33,0.75)' },
  { label: '> 30d',  max: Infinity, color: 'rgba(255,71,87,0.85)'  },
] as const;
