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
   Assignee
   ============================================================ */
export type RequestAssignee = {
  userId:     number;
  userName:   string;
  userEmail:  string;
  avatarUrl:  string;
  assignedAt: string;
};

/* ============================================================
   Label
   ============================================================ */
export type RequestLabel = {
  labelId: number;
  nombre:  string;
  color:   string;
  icon:    string;
};

/* ============================================================
   Template
   ============================================================ */
export type RequestTemplate = {
  templateId:  number;
  nombre:      string;
  descripcion: string;
};

/* ============================================================
   Campos extra por tipo de template
   ============================================================ */
export type RequestExtraFields =
  | { templateType: 'crm';     storeName: string }
  | { templateType: 'default' };

/* ============================================================
   Modelo principal — Request
   ============================================================ */
export type Request = {
  // ── Identidad ──────────────────────────────────────────────
  id:           string;
  templateId:   number;

  // ── Jerarquía ──────────────────────────────────────────────
  parentId:     number | null;   // null = request raíz; number = es hija de esa request

  // ── Contenido ──────────────────────────────────────────────
  titulo:       string;
  descripcion:  string;

  // ── Estado del board ───────────────────────────────────────
  columna:      KanbanColumna;
  columnId:     number;

  // ── Prioridad / puntaje ────────────────────────────────────
  prioridad:    Prioridad;
  score:        number;

  // ── Progreso ───────────────────────────────────────────────
  progreso:     number;

  // ── Personas ───────────────────────────────────────────────
  solicitante:   string;
  solicitanteId: number;
  assignees:     RequestAssignee[];

  // ── Relaciones de board ────────────────────────────────────
  equipo:       Equipo[];      // Board_Team_Code[] — para display
  equipoIds:    number[];      // Board_Team_ID[]   — para writes
  boardTeamId:  number | null;

  // ── Sub-equipos (TBL_Sub_Teams) ────────────────────────────
  subTeamIds:   number[];      // Sub_Team_ID[] — para writes
  subTeamNames: string[];      // Sub_Team_Name[] — para display en card

  // ── Labels ─────────────────────────────────────────────────
  categoria:    string[];      // Label_Name[] — para display en card
  labelIds:     number[];      // Label_ID[]   — para writes

  // ── Sprint ─────────────────────────────────────────────────
  sprintId:     number | null;
  sprintName:   string | null; // Sprint_Text — para display en card

  // ── Fechas ─────────────────────────────────────────────────
  fechaApertura: string;
  deadline:      string | null;
  fechaCierre:   string | null;

  // ── Tiempo ─────────────────────────────────────────────────
  tiempoConsuмido: string | null;

  // ── Campos extra del template ──────────────────────────────
  extraFields:  RequestExtraFields | null;

  // ── Hijos (cargados bajo demanda) ──────────────────────────
  childCount?:  number;        // cuántas sub-requests tiene (opcional, para la card)
};

/* ============================================================
   Payloads
   ============================================================ */
export type CrearRequestPayload = {
  boardId:     number;
  columnId:    number;
  requestedBy: number;
  templateId:  number;
  titulo:      string;
  descripcion: string;
  prioridad:   Prioridad;
  equipoIds:   number[];
  subTeamIds:  number[];
  labelIds:    number[];
  sprintId:    number | null;
  deadline:    string | null;
  parentId:    number | null;  // null = raíz; number = sub-request
};

export type MoverRequestPayload = {
  id:       string;
  columna:  KanbanColumna;
  columnId: number;
};

export type ActualizarRequestPayload = {
  id:           string;
  titulo?:      string;
  descripcion?: string;
  prioridad?:   Prioridad;
  progreso?:    number;
  equipoIds?:   number[];
  subTeamIds?:  number[];
  labelIds?:    number[];
  sprintId?:    number | null;
  deadline?:    string | null;
};

export type BoardData = Record<KanbanColumna, Request[]>;