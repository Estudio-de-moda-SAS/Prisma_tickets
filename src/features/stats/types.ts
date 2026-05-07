// src/features/requests/types.ts — reemplaza completo

export type Equipo = 'desarrollo' | 'crm' | 'sistemas' | 'analisis';

export const EQUIPOS: Record<Equipo, string> = {
  desarrollo: 'Desarrollo & UX',
  crm:        'CRM',
  sistemas:   'Sistemas de Información',
  analisis:   'Ciencia de Datos',
};

export type KanbanColumna =
  | 'sin_categorizar' | 'icebox' | 'backlog'
  | 'todo' | 'en_progreso' | 'hecho';

export const KANBAN_COLUMNAS: Record<KanbanColumna, string> = {
  sin_categorizar: 'Sin categorizar', icebox: 'Icebox', backlog: 'Backlog',
  todo: 'To do', en_progreso: 'En progreso', hecho: 'Hecho',
};

export const COLUMNAS_BOARD: KanbanColumna[] = ['icebox','backlog','todo','en_progreso','hecho'];

export type Prioridad = 'baja' | 'media' | 'alta' | 'critica';

export const PRIORIDADES: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

export const SCORE_TO_PRIORIDAD: Record<number, Prioridad> = {
  1: 'baja', 3: 'media', 5: 'alta', 8: 'critica',
};

export const PRIORIDAD_TO_SCORE: Record<Prioridad, number> = {
  baja: 1, media: 3, alta: 5, critica: 8,
};

export type RequestAssignee = {
  userId:     number;
  userName:   string;
  userEmail:  string;
  avatarUrl:  string;
  assignedAt: string;
};

export type RequestLabel = {
  labelId: number;
  nombre:  string;
  color:   string;
  icon:    string;
};

export type RequestTemplate = {
  templateId:  number;
  nombre:      string;
  descripcion: string;
};

export type RequestExtraFields =
  | { templateType: 'crm'; storeName: string }
  | { templateType: 'default' };

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
  solicitante:     string;       // nombre display — persona o equipo según requesterTeamId
  solicitanteId:   number;       // User_ID real siempre
  requesterTeamId: number | null; // null = personal; número = en nombre del equipo
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
};

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

export type BoardData = Record<KanbanColumna, Request[]>;