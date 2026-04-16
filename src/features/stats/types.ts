/* ============================================================
   Panel de estadísticas — Tipos completos
   Incluye: vista general (todos los equipos) + vista por board
   ============================================================ */

import type { Equipo } from '@/features/requests/types';

export type RangoTiempo = 'week' | 'month' | 'quarter';

export const RANGO_LABELS: Record<RangoTiempo, string> = {
  week:    'Esta semana',
  month:   'Este mes',
  quarter: 'Trimestre',
};

export type TrendDir = 'up' | 'down' | 'neutral';

/* ──── Vista general ────────────────────────────────────────── */
export type GeneralKPIs = {
  total:          number;
  resueltas:      number;
  tasaGlobal:     number; // 0–100
  tiempoPromedio: number; // días
};

export type EquipoStats = {
  equipo:    Equipo;
  creadas:   number;
  resueltas: number;
  sla:       number; // 0–100
  criticas:  number;
};

export type GeneralStatsData = {
  kpis:       GeneralKPIs;
  porEquipo:  EquipoStats[];
};

/* ──── Vista por board / equipo ─────────────────────────────── */
export type BoardKPIs = {
  creadas:    number;
  resueltas:  number;
  sla:        number;
  criticas:   number;
};

export type ColStats = { label: string; value: number; color: string };
export type PriStats = { label: string; value: number; color: string };

export type Resolutor = {
  nombre:    string;
  initials:  string;
  resueltas: number;
  avatarBg:  string;
};

export type BoardStatsData = {
  kpis:         BoardKPIs;
  porColumna:   ColStats[];
  porPrioridad: PriStats[];
  resolutores:  Resolutor[];
};

export type AllStatsData = {
  general: Record<RangoTiempo, GeneralStatsData>;
  boards:  Record<Equipo, BoardStatsData>;
};

/* ──── Actividad reciente ───────────────────────────────────── */
export type ActividadTipo =
  | 'mover_solicitud'
  | 'cerrar_solicitud'
  | 'crear_solicitud'
  | 'asignar_resolutor'
  | 'crear_automatizacion'
  | 'cambiar_prioridad';

export type ActividadItem = {
  id:          string;
  tipo:        ActividadTipo;
  descripcion: string;
  timestamp:   string;
  equipo:      string | null;
  requestId:   string | null;
};

export const ACTIVIDAD_COLORS: Record<ActividadTipo, string> = {
  mover_solicitud:       'var(--accent)',
  cerrar_solicitud:      'var(--success)',
  crear_solicitud:       'var(--accent)',
  asignar_resolutor:     'var(--warn)',
  crear_automatizacion:  'var(--info)',
  cambiar_prioridad:     'var(--danger)',
};

/* ──── Colores canónicos por equipo ─────────────────────────── */
export const EQUIPO_COLORS: Record<Equipo, string> = {
  desarrollo: '#378ADD',
  crm:        '#1D9E75',
  sistemas:   '#EF9F27',
  analisis:   '#7F77DD',
};

/* ──── Mock data ────────────────────────────────────────────── */

const COL_COLORS  = ['rgba(90,106,138,0.6)','rgba(127,119,221,0.6)','rgba(239,159,39,0.6)','rgba(0,200,255,0.6)','rgba(0,229,160,0.6)'];
const COL_LABELS  = ['Sin cat.','Backlog','To do','En prog.','Hecho'];

function makeCols(vals: number[]): ColStats[] {
  return COL_LABELS.map((label, i) => ({ label, value: vals[i], color: COL_COLORS[i] }));
}

const PRI_COLORS = ['#ff4757','#ffa502','#a78bfa','#5a6a8a'];
const PRI_LABELS = ['Crítica','Alta','Media','Baja'];

function makePri(vals: number[]): PriStats[] {
  return PRI_LABELS.map((label, i) => ({ label, value: vals[i], color: PRI_COLORS[i] }));
}

export const MOCK_ALL_STATS: AllStatsData = {
  general: {
    week: {
      kpis: { total: 52, resueltas: 34, tasaGlobal: 65, tiempoPromedio: 2.1 },
      porEquipo: [
        { equipo: 'desarrollo', creadas: 18, resueltas: 13, sla: 72, criticas: 3 },
        { equipo: 'crm',        creadas: 12, resueltas:  7, sla: 58, criticas: 1 },
        { equipo: 'sistemas',   creadas: 14, resueltas: 11, sla: 80, criticas: 0 },
        { equipo: 'analisis',   creadas:  8, resueltas:  5, sla: 63, criticas: 2 },
      ],
    },
    month: {
      kpis: { total: 182, resueltas: 131, tasaGlobal: 72, tiempoPromedio: 1.9 },
      porEquipo: [
        { equipo: 'desarrollo', creadas: 64, resueltas: 49, sla: 76, criticas: 9 },
        { equipo: 'crm',        creadas: 48, resueltas: 29, sla: 61, criticas: 4 },
        { equipo: 'sistemas',   creadas: 42, resueltas: 35, sla: 84, criticas: 2 },
        { equipo: 'analisis',   creadas: 28, resueltas: 18, sla: 67, criticas: 5 },
      ],
    },
    quarter: {
      kpis: { total: 520, resueltas: 401, tasaGlobal: 77, tiempoPromedio: 1.6 },
      porEquipo: [
        { equipo: 'desarrollo', creadas: 190, resueltas: 154, sla: 81, criticas: 22 },
        { equipo: 'crm',        creadas: 130, resueltas:  89, sla: 68, criticas: 12 },
        { equipo: 'sistemas',   creadas: 120, resueltas: 107, sla: 89, criticas:  6 },
        { equipo: 'analisis',   creadas:  80, resueltas:  58, sla: 72, criticas: 14 },
      ],
    },
  },

  boards: {
    desarrollo: {
      kpis:       { creadas: 18, resueltas: 13, sla: 72, criticas: 3 },
      porColumna: makeCols([2, 4, 3, 3, 6]),
      porPrioridad: makePri([3, 6, 7, 2]),
      resolutores: [
        { nombre: 'Carlos M.',  initials: 'CM', resueltas: 5, avatarBg: 'linear-gradient(135deg,#0055cc,#00c8ff)' },
        { nombre: 'Ana L.',     initials: 'AL', resueltas: 4, avatarBg: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
        { nombre: 'Juan R.',    initials: 'JR', resueltas: 3, avatarBg: 'linear-gradient(135deg,#0f6e56,#00e5a0)' },
        { nombre: 'María P.',   initials: 'MP', resueltas: 1, avatarBg: 'linear-gradient(135deg,#854F0B,#EF9F27)' },
      ],
    },
    crm: {
      kpis:         { creadas: 12, resueltas: 7, sla: 58, criticas: 1 },
      porColumna:   makeCols([3, 5, 2, 2, 5]),
      porPrioridad: makePri([1, 4, 5, 2]),
      resolutores: [
        { nombre: 'Sofía T.',   initials: 'ST', resueltas: 4, avatarBg: 'linear-gradient(135deg,#0f6e56,#00e5a0)' },
        { nombre: 'Pedro G.',   initials: 'PG', resueltas: 3, avatarBg: 'linear-gradient(135deg,#0055cc,#00c8ff)' },
      ],
    },
    sistemas: {
      kpis:         { creadas: 14, resueltas: 11, sla: 80, criticas: 0 },
      porColumna:   makeCols([1, 3, 4, 2, 8]),
      porPrioridad: makePri([0, 5, 6, 3]),
      resolutores: [
        { nombre: 'Valentina R.', initials: 'VR', resueltas: 6, avatarBg: 'linear-gradient(135deg,#534AB7,#a78bfa)' },
        { nombre: 'Luis H.',      initials: 'LH', resueltas: 5, avatarBg: 'linear-gradient(135deg,#854F0B,#EF9F27)' },
      ],
    },
    analisis: {
      kpis:         { creadas: 8, resueltas: 5, sla: 63, criticas: 2 },
      porColumna:   makeCols([2, 2, 3, 2, 2]),
      porPrioridad: makePri([2, 3, 4, 1]),
      resolutores: [
        { nombre: 'Daniela F.', initials: 'DF', resueltas: 3, avatarBg: 'linear-gradient(135deg,#185FA5,#378ADD)' },
        { nombre: 'Andrés M.',  initials: 'AM', resueltas: 2, avatarBg: 'linear-gradient(135deg,#3B6D11,#97C459)' },
      ],
    },
  },
};

export const MOCK_ACTIVIDAD: ActividadItem[] = [
  { id: 'a1', tipo: 'mover_solicitud',    descripcion: 'Movió #REQ-041 a En progreso · Desarrollo', timestamp: new Date(Date.now() - 7200000).toISOString(),   equipo: 'desarrollo', requestId: 'REQ-041' },
  { id: 'a2', tipo: 'cerrar_solicitud',   descripcion: 'Cerró #REQ-038 — "Migración DB staging"',   timestamp: new Date(Date.now() - 18000000).toISOString(),  equipo: 'sistemas',   requestId: 'REQ-038' },
  { id: 'a3', tipo: 'crear_automatizacion', descripcion: 'Creó automatización "Notif. prioridad crítica"', timestamp: new Date(Date.now() - 86400000).toISOString(), equipo: null, requestId: null },
  { id: 'a4', tipo: 'asignar_resolutor',  descripcion: 'Asignó #REQ-035 a Carlos M. · CRM',         timestamp: new Date(Date.now() - 90000000).toISOString(),  equipo: 'crm',        requestId: 'REQ-035' },
  { id: 'a5', tipo: 'crear_solicitud',    descripcion: 'Creó #REQ-033 — "Error en reportes BI"',     timestamp: new Date(Date.now() - 172800000).toISOString(), equipo: 'analisis',   requestId: 'REQ-033' },
];