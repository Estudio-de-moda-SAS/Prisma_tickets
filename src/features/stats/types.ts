// src/features/requests/types.ts
 
export type Equipo = 'desarrollo' | 'crm' | 'sistemas' | 'analisis';
 
export const EQUIPOS: Record<Equipo, string> = {
  desarrollo: 'Desarrollo & UX',
  crm:        'CRM',
  sistemas:   'Sistemas de Información',
  analisis:   'Ciencia de Datos',
};
 
export type KanbanColumna =
  | 'sin_categorizar'
  | 'icebox'
  | 'backlog'
  | 'todo'
  | 'en_progreso'
  | 'ready_to_deploy'
  | 'hecho';
 
export const KANBAN_COLUMNAS: Record<KanbanColumna, string> = {
  sin_categorizar: 'Sin categorizar',
  icebox:          'Icebox',
  backlog:         'Backlog',
  todo:            'To do',
  en_progreso:     'En progreso',
  ready_to_deploy: 'Ready to Deploy',
  hecho:           'Hecho',
};
 
export const COLUMNAS_BOARD: KanbanColumna[] = [
  'icebox',
  'backlog',
  'todo',
  'en_progreso',
  'ready_to_deploy',
  'hecho',
];
 
// Columnas que requieren evidencia de cierre al mover a ellas
export const COLUMNAS_CIERRE = new Set<KanbanColumna>(['ready_to_deploy', 'hecho']);
 
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
   Cierre
   ============================================================ */
export type CierreInfo = {
  closureId:      number;
  closureNote:    string;
  attachmentUrl:  string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  closedAt:       string;
  closedBy: {
    userId:   number;
    userName: string;
  };
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
  id:         string;
  templateId: number;
 
  // ── Jerarquía ──────────────────────────────────────────────
  parentId: number | null;
 
  // ── Contenido ──────────────────────────────────────────────
  titulo:      string;
  descripcion: string;
 
  // ── Estado del board ───────────────────────────────────────
  columna:  KanbanColumna;
  columnId: number;
 
  // ── Prioridad / puntaje ────────────────────────────────────
  prioridad: Prioridad;
  score:     number;
 
  // ── Progreso ───────────────────────────────────────────────
  progreso: number;
 
  // ── Personas ───────────────────────────────────────────────
  solicitante:     string;
  solicitanteId:   number;
  requesterTeamId: number | null;
  assignees:       RequestAssignee[];
 
  // ── Relaciones de board ────────────────────────────────────
  equipo:      Equipo[];
  equipoIds:   number[];
  boardTeamId: number | null;
 
  // ── Sub-equipos ────────────────────────────────────────────
  subTeamIds:   number[];
  subTeamNames: string[];
 
  // ── Labels ─────────────────────────────────────────────────
  categoria: string[];
  labelIds:  number[];
 
  // ── Sprint ─────────────────────────────────────────────────
  sprintId:   number | null;
  sprintName: string | null;
 
  // ── Fechas ─────────────────────────────────────────────────
  fechaApertura: string;
  deadline:      string | null;
  fechaCierre:   string | null;
 
  // ── Tiempo ─────────────────────────────────────────────────
  tiempoConsuмido: string | null;
 
  // ── Campos extra del template ──────────────────────────────
  extraFields: RequestExtraFields | null;
 
  // ── Hijos ──────────────────────────────────────────────────
  childCount?: number;
 
  // ── Cierre (cargado junto con la request) ──────────────────
  cierreInfo?: CierreInfo | null;
};
 
/* ============================================================
   Payloads
   ============================================================ */
export type CrearRequestPayload = {
  boardId:         number;
  columnId:        number;
  requestedBy:     number;
  templateId:      number;
  titulo:          string;
  descripcion:     string;
  prioridad:       Prioridad;
  equipoIds:       number[];
  subTeamIds:      number[];
  labelIds:        number[];
  sprintId:        number | null;
  deadline:        string | null;
  parentId:        number | null;
  requesterTeamId: number | null;
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
 
export type CerrarRequestPayload = {
  requestId:      number;
  closedBy:       number;
  closureNote:    string;
  targetColumnId: number;
  attachment?:    File | null;
};
 
export type BoardData = Record<KanbanColumna, Request[]>;