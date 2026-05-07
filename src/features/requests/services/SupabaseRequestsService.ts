// src/features/requests/services/SupabaseRequestsService.ts
import { apiClient } from '@/lib/apiClient';
import type {
  Request, CrearRequestPayload, ActualizarRequestPayload,
  MoverRequestPayload, KanbanColumna, Prioridad, RequestAssignee, RequestExtraFields,
} from '../types';
import { SCORE_TO_PRIORIDAD, PRIORIDAD_TO_SCORE } from '../types';

type RawRequestRow = {
  Request_ID:                number;
  Request_Board_Column_ID:   number;
  Request_Requested_By:      number;
  Request_Template_ID:       number;
  Request_Title:             string | null;
  Request_Description:       string | null;
  Request_Score:             number | null;
  Request_Progress:          number | null;
  Request_Created_At:        string | null;
  Request_Deadline:          string | null;
  Request_Time_Consumed:     string | null;
  Request_Finished_At:       string | null;
  Request_Parent_ID:         number | null;
  Request_Requester_Team_ID: number | null;

  requester:      { User_Name: string; User_Email: string; User_Avatar_url: string } | null;
  requester_team: { Team_ID: number; Team_Name: string; Team_Code: string } | null;
  column:         { Board_Column_Name: string } | null;

  assignments: {
    Request_Assignment_At: string;
    assignee: { User_ID: number; User_Name: string; User_Email: string; User_Avatar_url: string } | null;
  }[];
  teams:      { team:     { Board_Team_ID: number; Board_Team_Code: string } | null }[];
  labels:     { label:    { Label_ID: number; Label_Name: string; Label_Color: string; Label_Icon: string } | null }[];
  sub_teams:  { sub_team: { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string } | null }[];
  sprints:    { Request_Sprint_ID: number; sprint: { Sprint_Text: string } | null }[];
  crm_extra:  { Request_CRM_Example_Store_Name: string } | null;
  child_count?: { count: number }[];
};

const COLUMN_NAME_TO_KANBAN: Record<string, KanbanColumna> = {
  'Sin categorizar': 'sin_categorizar', 'Icebox': 'icebox', 'Backlog': 'backlog',
  'To do': 'todo', 'En progreso': 'en_progreso', 'Hecho': 'hecho',
};

function mapRowToRequest(row: RawRequestRow): Request {
  const columna              = COLUMN_NAME_TO_KANBAN[row.column?.Board_Column_Name ?? ''] ?? 'sin_categorizar';
  const score                = row.Request_Score ?? 3;
  const prioridad: Prioridad = SCORE_TO_PRIORIDAD[score] ?? 'media';

  const assignees: RequestAssignee[] = (row.assignments ?? [])
    .filter((a) => a.assignee !== null)
    .map((a) => ({
      userId: a.assignee!.User_ID, userName: a.assignee!.User_Name,
      userEmail: a.assignee!.User_Email, avatarUrl: a.assignee!.User_Avatar_url,
      assignedAt: a.Request_Assignment_At,
    }));

  const equipoCodes  = (row.teams ?? []).filter((t) => t.team !== null).map((t) => t.team!.Board_Team_Code as Request['equipo'][number]);
  const equipoIds    = (row.teams ?? []).filter((t) => t.team !== null).map((t) => t.team!.Board_Team_ID);
  const boardTeamId  = equipoIds[0] ?? null;
  const subTeamIds   = (row.sub_teams ?? []).filter((s) => s.sub_team !== null).map((s) => s.sub_team!.Sub_Team_ID);
  const subTeamNames = (row.sub_teams ?? []).filter((s) => s.sub_team !== null).map((s) => s.sub_team!.Sub_Team_Name);
  const labelNames   = (row.labels ?? []).filter((l) => l.label !== null).map((l) => l.label!.Label_Name);
  const labelIds     = (row.labels ?? []).filter((l) => l.label !== null).map((l) => l.label!.Label_ID);

  const firstSprint    = row.sprints?.[0] ?? null;
  const sprintId       = firstSprint?.Request_Sprint_ID ?? null;
  const sprintName     = firstSprint?.sprint?.Sprint_Text ?? null;
  const childCount     = row.child_count?.[0]?.count ?? undefined;
  const requesterTeamId = row.Request_Requester_Team_ID ?? null;

  let extraFields: RequestExtraFields | null = null;
  if (row.crm_extra) extraFields = { templateType: 'crm', storeName: row.crm_extra.Request_CRM_Example_Store_Name };

  // NULL = solicitud pers|onal → nombre del usuario
  // número = en nombre del equipo → nombre del equipo via join con TBL_Teams
  const solicitante = requesterTeamId !== null
    ? (row.requester_team?.Team_Name ?? row.requester?.User_Name ?? '')
    : (row.requester?.User_Name ?? '');

  return {
    id: String(row.Request_ID), templateId: row.Request_Template_ID,
    parentId: row.Request_Parent_ID ?? null,
    titulo: row.Request_Title ?? '', descripcion: row.Request_Description ?? '',
    columna, columnId: row.Request_Board_Column_ID, prioridad, score,
    progreso: row.Request_Progress ?? 0,
    solicitante, solicitanteId: row.Request_Requested_By, requesterTeamId,
    assignees, equipo: equipoCodes, equipoIds, boardTeamId,
    subTeamIds, subTeamNames, categoria: labelNames, labelIds,
    sprintId, sprintName,
    fechaApertura: row.Request_Created_At ?? new Date().toISOString(),
    deadline: row.Request_Deadline ?? null,
    fechaCierre: row.Request_Finished_At ?? null,
    tiempoConsuмido: row.Request_Time_Consumed ?? null,
    extraFields, childCount,
  };
}

export class SupabaseRequestsService {
  private readonly boardId: number;
  constructor(boardId: number) { this.boardId = boardId; }

  async fetchAllByBoard(): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchAllByBoard', { boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }
  async fetchByTeamCode(teamCode: string): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchByTeamCode', { boardId: this.boardId, teamCode });
    return rows.map(mapRowToRequest);
  }
  async fetchUncategorized(): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchUncategorized', { boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }
  async fetchById(id: number): Promise<Request> {
    const row = await apiClient.call<RawRequestRow>('fetchById', { id });
    return mapRowToRequest(row);
  }
  async fetchByRequestedBy(userId: number): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchByRequestedBy', { userId, boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }
  async fetchChildRequests(parentId: number): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchChildRequests', { parentId });
    return rows.map(mapRowToRequest);
  }
  async createRequest(payload: CrearRequestPayload): Promise<Request> {
    const row = await apiClient.call<RawRequestRow>('createRequest', {
      boardId:         payload.boardId,
      columnId:        payload.columnId,
      requestedBy:     payload.requestedBy,
      templateId:      payload.templateId,
      titulo:          payload.titulo,
      descripcion:     payload.descripcion,
      score:           PRIORIDAD_TO_SCORE[payload.prioridad],
      equipoIds:       payload.equipoIds,
      labelIds:        payload.labelIds,
      sprintId:        payload.sprintId,
      deadline:        payload.deadline,
      parentId:        payload.parentId,
      requesterTeamId: payload.requesterTeamId ?? null,
    });
    return mapRowToRequest(row);
  }
  async moveToColumn({ id, columnId }: MoverRequestPayload): Promise<void> {
    await apiClient.call('moveToColumn', { id: Number(id), columnId });
  }
  async updateRequest({ id, ...patch }: ActualizarRequestPayload): Promise<void> {
    await apiClient.call('updateRequest', {
      id: Number(id), titulo: patch.titulo, descripcion: patch.descripcion,
      score: patch.prioridad !== undefined ? PRIORIDAD_TO_SCORE[patch.prioridad] : undefined,
      progreso: patch.progreso, equipoIds: patch.equipoIds, labelIds: patch.labelIds,
      sprintId: patch.sprintId, deadline: patch.deadline,
    });
    if (patch.subTeamIds !== undefined)
      await apiClient.call('updateRequestSubTeams', { id: Number(id), subTeamIds: patch.subTeamIds });
  }
  async deleteRequest(id: string): Promise<void> {
    await apiClient.call('deleteRequest', { id: Number(id) });
  }
}