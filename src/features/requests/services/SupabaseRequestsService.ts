// src/features/requests/services/SupabaseRequestsService.ts
import { apiClient } from '@/lib/apiClient';
import type {
  Request, CrearRequestPayload, ActualizarRequestPayload,
  MoverRequestPayload, KanbanColumna, Prioridad,
  RequestAssignee, RequestExtraFields, CierreInfo, CerrarRequestPayload,
  ClosureAttachment,
} from '../types';
import { SCORE_TO_PRIORIDAD, PRIORIDAD_TO_SCORE } from '../types';

type RawClosureAttachment = {
  Closure_Attachment_ID: number;
  Storage_Path:          string;
  File_Name:             string;
  Mime_Type:             string;
  File_Size:             number;
  Created_At:            string;
  Signed_Url:            string | null;
};

type RawRequestRow = {
  Request_ID:                string;
  Request_Board_Column_ID:   number;
  Request_Requested_By:      number;
  Request_Template_ID:       number;
  Request_Title:             string | null;
  Request_Description:       string | null;
  Request_Score:             number | null;
  Request_Progress:          number | null;
  Request_Created_At:        string | null;
  Request_Estimated_Hours:   number | null;
  Request_Finished_At:       string | null;
  Request_Parent_ID:         string | null;
  Request_Requester_Team_ID: number | null;
  Request_Is_Confidential: boolean | null;

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
  criteria_summary?: { total: number; accepted: number; rejected: number } | null;

  closure: {
    Closure_ID:      number;
    Closure_Note:    string;
    Attachment_URL:  string | null;
    Attachment_Name: string | null;
    Attachment_Mime: string | null;
    Closed_At:       string;
    closer: { User_ID: number; User_Name: string } | null;
    closure_attachments: {
      Closure_Attachment_ID: number;
      Storage_Path:          string;
      File_Name:             string;
      Mime_Type:             string;
      File_Size:             number;
      Created_At:            string;
    }[];
  } | null;
};

const COLUMN_NAME_TO_KANBAN: Record<string, KanbanColumna> = {
  'Sin categorizar': 'sin_categorizar',
  'Icebox':          'icebox',
  'Backlog':         'backlog',
  'To do':           'todo',
  'En progreso':     'en_progreso',
  'En revisión QAS': 'en_revision_qas',
  'Ready to Deploy': 'ready_to_deploy',
  'Hecho':           'hecho',
  'Historial':       'historial',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsDataURL(file);
  });
}

function mapRowToRequest(row: RawRequestRow): Request {
  const columna              = COLUMN_NAME_TO_KANBAN[row.column?.Board_Column_Name ?? ''] ?? 'sin_categorizar';
  const score                = row.Request_Score ?? 3;
  const prioridad: Prioridad = SCORE_TO_PRIORIDAD[score] ?? 'media';

  const assignees: RequestAssignee[] = (row.assignments ?? [])
    .filter((a) => a.assignee !== null)
    .map((a) => ({
      userId:     a.assignee!.User_ID,
      userName:   a.assignee!.User_Name,
      userEmail:  a.assignee!.User_Email,
      avatarUrl:  a.assignee!.User_Avatar_url,
      assignedAt: a.Request_Assignment_At,
    }));

  const equipoCodes  = (row.teams ?? []).filter((t) => t.team !== null).map((t) => t.team!.Board_Team_Code as Request['equipo'][number]);
  const equipoIds    = (row.teams ?? []).filter((t) => t.team !== null).map((t) => t.team!.Board_Team_ID);
  const boardTeamId  = equipoIds[0] ?? null;
  const subTeamIds   = (row.sub_teams ?? []).filter((s) => s.sub_team !== null).map((s) => s.sub_team!.Sub_Team_ID);
  const subTeamNames = (row.sub_teams ?? []).filter((s) => s.sub_team !== null).map((s) => s.sub_team!.Sub_Team_Name);
  const labelNames   = (row.labels ?? []).filter((l) => l.label !== null).map((l) => l.label!.Label_Name);
  const labelIds     = (row.labels ?? []).filter((l) => l.label !== null).map((l) => l.label!.Label_ID);

  const firstSprint     = row.sprints?.[0] ?? null;
  const sprintId        = firstSprint?.Request_Sprint_ID ?? null;
  const sprintName      = firstSprint?.sprint?.Sprint_Text ?? null;
  const childCount      = row.child_count?.[0]?.count ?? undefined;
  const requesterTeamId = row.Request_Requester_Team_ID ?? null;
  const criteriaSummary = (() => {
    const s = (row as Record<string, unknown>).criteria_summary as
      { total: number; accepted: number; rejected: number } | null | undefined;
    return (s && s.total > 0) ? s : null;
  })();

  let extraFields: RequestExtraFields | null = null;
  if (row.crm_extra) extraFields = { templateType: 'crm', storeName: row.crm_extra.Request_CRM_Example_Store_Name };

  const solicitante = row.requester?.User_Name ?? '';

  let cierreInfo: CierreInfo | null = null;
  if (row.closure) {
    const rawAtts = row.closure.closure_attachments ?? [];
    const attachments: ClosureAttachment[] = rawAtts.map((a) => ({
      attachmentId: a.Closure_Attachment_ID,
      storagePath:  a.Storage_Path,
      fileName:     a.File_Name,
      mimeType:     a.Mime_Type,
      fileSize:     a.File_Size,
      createdAt:    a.Created_At,
      signedUrl:    null,
    }));

    cierreInfo = {
      closureId:      row.closure.Closure_ID,
      closureNote:    row.closure.Closure_Note,
      closedAt:       row.closure.Closed_At,
      closedBy: {
        userId:   row.closure.closer?.User_ID   ?? 0,
        userName: row.closure.closer?.User_Name ?? '',
      },
      attachments,
      attachmentUrl:  row.closure.Attachment_URL,
      attachmentName: row.closure.Attachment_Name,
      attachmentMime: row.closure.Attachment_Mime,
    };
  }

  return {
    id:              row.Request_ID,
    templateId:      row.Request_Template_ID,
    parentId:        row.Request_Parent_ID ?? null,
    titulo:          row.Request_Title ?? '',
    descripcion:     row.Request_Description ?? '',
    columna,
    columnId:        row.Request_Board_Column_ID,
    prioridad,
    score,
    progreso:        row.Request_Progress ?? 0,
    solicitante,
    solicitanteId:   row.Request_Requested_By,
    requesterTeamId,
    assignees,
    equipo:          equipoCodes,
    equipoIds,
    boardTeamId,
    subTeamIds,
    subTeamNames,
    categoria:       labelNames,
    labelIds,
    sprintId,
    sprintName,
    fechaApertura:   row.Request_Created_At ?? new Date().toISOString(),
    fechaCierre:     row.Request_Finished_At ?? null,
    estimatedHours:  row.Request_Estimated_Hours ?? null,
    extraFields,
    childCount,
    criteriaSummary,
    cierreInfo,
    isConfidential: row.Request_Is_Confidential ?? false,
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

  async fetchById(id: string): Promise<Request> {
    const row    = await apiClient.call<RawRequestRow>('fetchById', { id });
    const mapped = mapRowToRequest(row);

    if (mapped.cierreInfo && mapped.cierreInfo.attachments.length > 0) {
      mapped.cierreInfo.attachments = await this.fetchClosureAttachments(mapped.cierreInfo.closureId);
    }
    return mapped;
  }

  async fetchByRequestedBy(userId: number): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchByRequestedBy', { userId, boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }

  async fetchChildRequests(parentId: string): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchChildRequests', { parentId });
    return rows.map(mapRowToRequest);
  }

  async fetchClosureAttachments(closureId: number): Promise<ClosureAttachment[]> {
    const rows = await apiClient.call<RawClosureAttachment[]>('fetchClosureAttachments', { closureId });
    return rows.map((r) => ({
      attachmentId: r.Closure_Attachment_ID,
      storagePath:  r.Storage_Path,
      fileName:     r.File_Name,
      mimeType:     r.Mime_Type,
      fileSize:     r.File_Size,
      createdAt:    r.Created_At,
      signedUrl:    r.Signed_Url,
    }));
  }

  async createRequest(payload: CrearRequestPayload): Promise<Request> {
    const { acceptanceCriteria: _ignored, ...rest } = payload;
    console.log('[DEBUG] service isConfidential:', rest.isConfidential);
    const row = await apiClient.call<RawRequestRow>('createRequest', {
      boardId:         rest.boardId,
      columnId:        rest.columnId,
      requestedBy:     rest.requestedBy,
      templateId:      rest.templateId,
      titulo:          rest.titulo,
      descripcion:     rest.descripcion,
      score:           PRIORIDAD_TO_SCORE[rest.prioridad],
      equipoIds:       rest.equipoIds,
      labelIds:        rest.labelIds,
      sprintId:        rest.sprintId,
      estimatedHours:  rest.estimatedHours,
      parentId:        rest.parentId,
      requesterTeamId: rest.requesterTeamId,
      isConfidential: rest.isConfidential ?? false,
    });
    return mapRowToRequest(row);
  }

  async moveToColumn({ id, columnId }: MoverRequestPayload): Promise<void> {
    await apiClient.call('moveToColumn', { id, columnId });
  }

  async updateRequest({ id, ...patch }: ActualizarRequestPayload): Promise<void> {
    await apiClient.call('updateRequest', {
      id,
      titulo:         patch.titulo,
      descripcion:    patch.descripcion,
      score:          patch.prioridad !== undefined ? PRIORIDAD_TO_SCORE[patch.prioridad] : undefined,
      progreso:       patch.progreso,
      equipoIds:      patch.equipoIds,
      labelIds:       patch.labelIds,
      sprintId:       patch.sprintId,
      estimatedHours: patch.estimatedHours,
    });
    if (patch.subTeamIds !== undefined) {
      await apiClient.call('updateRequestSubTeams', { id, subTeamIds: patch.subTeamIds });
    }
  }

  async deleteRequest(id: string): Promise<void> {
    await apiClient.call('deleteRequest', { id });
  }

  async closeRequest(payload: CerrarRequestPayload): Promise<CierreInfo> {
    const row = await apiClient.call<{
      Closure_ID:   number;
      Closure_Note: string;
      Closed_At:    string;
      closer: { User_ID: number; User_Name: string } | null;
    }>('closeRequest', {
      requestId:      payload.requestId,
      closedBy:       payload.closedBy,
      closureNote:    payload.closureNote,
      targetColumnId: payload.targetColumnId,
      attachmentUrl:  null,
      attachmentName: null,
      attachmentMime: null,
    });

    const closureId = row.Closure_ID;
    const uploadedAttachments: ClosureAttachment[] = [];

    if (payload.attachments.length > 0) {
      const uploads = await Promise.all(
        payload.attachments.map(async (file) => {
          const base64 = await fileToBase64(file);
          return apiClient.call<RawClosureAttachment>('uploadClosureAttachment', {
            closureId,
            requestId: payload.requestId,
            userId:    payload.closedBy,
            fileName:  file.name,
            mimeType:  file.type,
            sizeBytes: file.size,
            base64,
          });
        }),
      );

      for (const u of uploads) {
        uploadedAttachments.push({
          attachmentId: u.Closure_Attachment_ID,
          storagePath:  u.Storage_Path,
          fileName:     u.File_Name,
          mimeType:     u.Mime_Type,
          fileSize:     u.File_Size,
          createdAt:    u.Created_At,
          signedUrl:    u.Signed_Url,
        });
      }
    }

    return {
      closureId,
      closureNote:    row.Closure_Note,
      closedAt:       row.Closed_At,
      closedBy: {
        userId:   row.closer?.User_ID   ?? payload.closedBy,
        userName: row.closer?.User_Name ?? '',
      },
      attachments:    uploadedAttachments,
      attachmentUrl:  null,
      attachmentName: null,
      attachmentMime: null,
    };
  }
}