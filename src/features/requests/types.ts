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
   — Siguen siendo strings fijos en el frontend.
   — En Supabase se representan como Board_Column_ID (FK).
   — El service mapea entre ambos.
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
   — Se mapean a/desde Request_Score en Supabase:
       baja=1  media=3  alta=5  critica=8
   ============================================================ */
export type Prioridad = 'baja' | 'media' | 'alta' | 'critica';

export const PRIORIDADES: Record<Prioridad, string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  critica: 'Crítica',
};

/** Mapeo score numérico ↔ prioridad semántica */
export const SCORE_TO_PRIORIDAD: Record<number, Prioridad> = {
  1: 'baja',
  3: 'media',
  5: 'alta',
  8: 'critica',
};

export const PRIORIDAD_TO_SCORE: Record<Prioridad, number> = {
  baja:    1,
  media:   3,
  alta:    5,
  critica: 8,
};

/* ============================================================
   Assignee — usuario asignado a una solicitud
   (viene de TBL_Requests_Assignments JOIN TBL_Users)
   ============================================================ */
export type RequestAssignee = {
  userId:     number;
  userName:   string;
  userEmail:  string;
  avatarUrl:  string;
  assignedAt: string;
};

/* ============================================================
   Label — etiqueta de una solicitud
   (viene de TBL_Request_Labels JOIN TBL_Labels)
   ============================================================ */
export type RequestLabel = {
  labelId:   number;
  nombre:    string;
  color:     string;
  icon:      string;
};

/* ============================================================
   Template — plantilla de la solicitud
   Define qué tipo de tarjeta se renderiza en el board.
   ============================================================ */
export type RequestTemplate = {
  templateId:  number;
  nombre:      string;
  descripcion: string;
};

/* ============================================================
   Campos extra por tipo de template
   Cada template puede tener su propia tabla de campos adicionales.
   Se extiende aquí cuando se agrega un nuevo tipo.
   ============================================================ */
export type RequestExtraFields =
  | { templateType: 'crm';     storeName: string }
  | { templateType: 'default' };
/* ============================================================
   Modelo principal — Request
   Shape aplanado que consume el frontend.
   El service es responsable de componer este objeto desde
   las múltiples tablas de Supabase.
   ============================================================ */
export type Request = {
  // ── Identidad ──────────────────────────────────────────────
  id:           string;           // Request_ID casteado a string para compatibilidad con dnd-kit
  templateId:   number;           // Request_Template_ID → determina qué card se renderiza

  // ── Contenido ──────────────────────────────────────────────
  titulo:       string;
  descripcion:  string;

  // ── Estado del board ───────────────────────────────────────
  columna:      KanbanColumna;    // mapeado desde Request_Board_Column_ID
  columnId:     number;           // Request_Board_Column_ID (para writes a Supabase)

  // ── Prioridad / puntaje ────────────────────────────────────
  prioridad:    Prioridad;        // mapeado desde Request_Score
  score:        number;           // Request_Score (valor raw)

  // ── Progreso ───────────────────────────────────────────────
  progreso:     number;           // Request_Progress (0-100)

  // ── Personas ───────────────────────────────────────────────
  solicitante:  string;           // User_Name del Request_Requested_By
  solicitanteId: number;          // Request_Requested_By
  assignees:    RequestAssignee[]; // TBL_Requests_Assignments

  // ── Relaciones ─────────────────────────────────────────────
  equipo:       Equipo[];         // Board_Team_Code[] desde TBL_Request_Team
  equipoIds:    number[];         // Board_Team_ID[] (para writes)
  categoria:    string[];         // Label_Name[] desde TBL_Request_Labels
  labelIds:     number[];         // Label_ID[] (para writes)

  // ── Sprint ─────────────────────────────────────────────────
  sprintId:     number | null;    // TBL_Request_Sprint

  // ── Fechas ─────────────────────────────────────────────────
  fechaApertura: string;          // Request_Created_At
  deadline:      string | null;   // Request_Deadline
  fechaCierre:   string | null;   // Request_Finished_At

  // ── Tiempo ─────────────────────────────────────────────────
  tiempoConsuмido: string | null; // Request_Time_Consumed (HH:MM:SS)

  // ── Campos extra del template ──────────────────────────────
  extraFields:  RequestExtraFields | null;
};

/* ============================================================
   Payload para crear una solicitud
   ============================================================ */
export type CrearRequestPayload = {
  boardId:      number;
  columnId:     number;
  requestedBy:  number;
  templateId:   number;
  titulo:       string;
  descripcion:  string;
  prioridad:    Prioridad;
  equipoIds:    number[];
  labelIds:     number[];
  sprintId:     number | null;
  deadline:     string | null;
};

/* ============================================================
   Payload para mover una tarjeta entre columnas
   ============================================================ */
export type MoverRequestPayload = {
  id:       string;
  columna:  KanbanColumna;
  columnId: number;
};

/* ============================================================
   Payload para actualizar campos de una solicitud
   ============================================================ */
export type ActualizarRequestPayload = {
  id:          string;
  titulo?:     string;
  descripcion?: string;
  prioridad?:  Prioridad;
  progreso?:   number;
  equipoIds?:  number[];
  labelIds?:   number[];
  sprintId?:   number | null;
  deadline?:   string | null;
};

/* ============================================================
   Estado agrupado para el board
   ============================================================ */
export type BoardData = Record<KanbanColumna, Request[]>;