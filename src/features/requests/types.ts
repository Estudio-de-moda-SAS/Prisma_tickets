/* ============================================================
   Equipos disponibles
   ============================================================ */
export type Equipo = 'desarrollo' | 'crm' | 'sistemas' | 'analisis';

export const EQUIPOS: Record<Equipo, string> = {
  desarrollo: 'Desarrollo & UX',
  crm:        'CRM',
  sistemas:   'Sistemas de Información',
  analisis:   'Ciencia de Datos',
};

/* ============================================================
   Columnas Kanban
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
  equipo:        Equipo[];    // multi
  columna:       KanbanColumna;
  prioridad:     Prioridad;
  categoria:     string[];    // multi
  fechaApertura: string;
  fechaMaxima:   string | null;
  progreso:      number;
};

/* ============================================================
   Payload para crear una solicitud
   ============================================================ */
export type CrearSolicitudPayload = {
  titulo:       string;
  descripcion:  string;
  solicitante:  string;
  resolutor:    string | null;
  equipo:       Equipo[];
  prioridad:    Prioridad;
  categoria:    string[];
  fechaMaxima:  string | null;
  columna?:     KanbanColumna;
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