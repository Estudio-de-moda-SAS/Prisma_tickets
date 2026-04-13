/* ============================================================
   Equipos disponibles
   ============================================================ */
export type Equipo = 'desarrollo' | 'crm' | 'sistemas' | 'analisis';

export const EQUIPOS: Record<Equipo, string> = {
  desarrollo: 'Desarrollo',
  crm:        'CRM',
  sistemas:   'Sistemas de Información',
  analisis:   'Análisis de Datos',
};

/* ============================================================
   Columnas Kanban por equipo
   ============================================================ */
export type KanbanColumna =
  | 'sin_categorizar'
  | 'icebox'
  | 'backlog'
  | 'todo'
  | 'en_progreso'
  | 'hecho';

export const KANBAN_COLUMNAS: Record<KanbanColumna, string> = {
  sin_categorizar: 'Sin categorizar',
  icebox:          'Icebox',
  backlog:         'Backlog',
  todo:            'To do',
  en_progreso:     'En progreso',
  hecho:           'Hecho',
};

// Columnas que pertenecen al board de equipo (excluye sin_categorizar)
export const COLUMNAS_BOARD: KanbanColumna[] = [
  'icebox',
  'backlog',
  'todo',
  'en_progreso',
  'hecho',
];

/* ============================================================
   Prioridades
   ============================================================ */
export type Prioridad = 'baja' | 'media' | 'alta' | 'critica';

export const PRIORIDADES: Record<Prioridad, string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  critica: 'Crítica',
};

/* ============================================================
   Modelo principal — Solicitud
   ============================================================ */
export type Request = {
  id:            string;
  titulo:        string;
  descripcion:   string;
  solicitante:   string;
  resolutor:     string | null;
  equipo:        Equipo | null;
  columna:       KanbanColumna;
  prioridad:     Prioridad;
  categoria:     string | null;
  fechaApertura: string;
  fechaMaxima:   string | null;
  progreso:      number; // 0-100
};

/* ============================================================
   Payload para crear una solicitud
   ============================================================ */
export type CrearSolicitudPayload = Omit<
  Request,
  'id' | 'columna' | 'fechaApertura' | 'progreso'
> & {
  columna?: KanbanColumna;
};

/* ============================================================
   Payload para mover una tarjeta (optimistic update)
   ============================================================ */
export type MoverSolicitudPayload = {
  id:      string;
  columna: KanbanColumna;
  equipo?: Equipo;
};

/* ============================================================
   Estado agrupado para el board
   ============================================================ */
export type BoardData = Record<KanbanColumna, Request[]>;