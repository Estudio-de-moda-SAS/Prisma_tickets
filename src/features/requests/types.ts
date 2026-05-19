// src/features/requests/types.ts

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
  | 'en_revision_qas'
  | 'ready_to_deploy'
  | 'hecho'
  | 'historial';

export const KANBAN_COLUMNAS: Record<KanbanColumna, string> = {
  sin_categorizar:  'Sin categorizar',
  icebox:           'Icebox',
  backlog:          'Backlog',
  todo:             'To do',
  en_progreso:      'En progreso',
  en_revision_qas:  'En revisión QAS',
  ready_to_deploy:  'Ready to Deploy',
  hecho:            'Hecho',
  historial:        'Historial',
};

export const COLUMNAS_BOARD: KanbanColumna[] = [
  'icebox',
  'backlog',
  'todo',
  'en_progreso',
  'en_revision_qas',
  'ready_to_deploy',
  'hecho',
  'historial',
];

/** Columnas que requieren evidencia de cierre al mover una tarjeta a ellas */
export const COLUMNAS_CIERRE = new Set<KanbanColumna>([
  'ready_to_deploy',
  'hecho',
  'historial',
]);

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
   Cierre — adjunto individual
   ============================================================ */
export type ClosureAttachment = {
  attachmentId: number;
  storagePath:  string;
  fileName:     string;
  mimeType:     string;
  fileSize:     number;
  createdAt:    string;
  signedUrl:    string | null;
};

/* ============================================================
   Cierre
   ============================================================ */
export type CierreInfo = {
  closureId:   number;
  closureNote: string;
  closedAt:    string;
  closedBy: {
    userId:   number;
    userName: string;
  };
  attachments: ClosureAttachment[];
  attachmentUrl:  string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
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
  parentId:     string | null;

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
  solicitante:     string;
  solicitanteId:   number;
  requesterTeamId: number | null;
  assignees:       RequestAssignee[];

  // ── Relaciones de board ────────────────────────────────────
  equipo:       Equipo[];
  equipoIds:    number[];
  boardTeamId:  number | null;

  // ── Sub-equipos ────────────────────────────────────────────
  subTeamIds:   number[];
  subTeamNames: string[];

  // ── Labels ─────────────────────────────────────────────────
  categoria:    string[];
  labelIds:     number[];

  // ── Sprint ─────────────────────────────────────────────────
  sprintId:     number | null;
  sprintName:   string | null;

  // ── Fechas ─────────────────────────────────────────────────
  fechaApertura: string;
  fechaCierre:   string | null;

  // ── Tiempo estimado ────────────────────────────────────────
  estimatedHours: number | null;

  // ── Confidencialidad ───────────────────────────────────────
  isConfidential: boolean;

  // ── Campos extra del template ──────────────────────────────
  extraFields:  RequestExtraFields | null;

  // ── Hijos ──────────────────────────────────────────────────
  childCount?:  number;

  // ── Resumen de criterios de aceptación ─────────────────────
  criteriaSummary?: {
    total:    number;
    accepted: number;
    rejected: number;
  } | null;

  // ── Cierre ─────────────────────────────────────────────────
  cierreInfo?:  CierreInfo | null;
};

/* ============================================================
   Payloads
   ============================================================ */
export type CrearRequestPayload = {
  boardId:             number;
  columnId:            number;
  requestedBy:         number;
  templateId:          number;
  titulo:              string;
  descripcion:         string;
  prioridad:           Prioridad;
  equipoIds:           number[];
  subTeamIds:          number[];
  labelIds:            number[];
  sprintId:            number | null;
  estimatedHours:      number | null;
  parentId:            string | null;
  requesterTeamId:     number | null;
  isConfidential:      boolean;
  /** Títulos de criterios de aceptación — mínimo 1 requerido */
  acceptanceCriteria:  string[];
};

export type MoverRequestPayload = {
  id:       string;
  columna:  KanbanColumna;
  columnId: number;
};

export type ActualizarRequestPayload = {
  id:              string;
  titulo?:         string;
  descripcion?:    string;
  prioridad?:      Prioridad;
  progreso?:       number;
  equipoIds?:      number[];
  subTeamIds?:     number[];
  labelIds?:       number[];
  sprintId?:       number | null;
  estimatedHours?: number | null;
};

export type CerrarRequestPayload = {
  requestId:      string;
  closedBy:       number;
  closureNote:    string;
  targetColumnId: number;
  attachments:    File[];
};

export type BoardData = Record<KanbanColumna, Request[]>;