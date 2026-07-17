// src/features/requests/services/SupabaseRequestsService.ts
import { apiClient } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { config } from '@/config';
import type {
  Request, CrearRequestPayload, ActualizarRequestPayload,
  MoverRequestPayload, KanbanColumna, Prioridad,
  RequestAssignee, RequestExtraFields, CierreInfo, CerrarRequestPayload,
  ClosureAttachment, ClientFeedback, SubmitClientFeedbackPayload,
} from '../types';
import { SCORE_TO_PRIORIDAD, PRIORIDAD_TO_SCORE } from '../types';

// Copia del BASE_SELECT del Edge Function (shared/selects.ts) para reads directos.
// TODO: centralizar para no duplicar. Mantener en sync si cambia el del backend.
const BASE_SELECT_DIRECT = `
  Request_ID,
  Request_Board_Column_ID,
  Request_Requested_By,
  Request_Template_ID,
  Request_Title,
  Request_Description,
  Request_Score,
  Request_Progress,
  Request_Created_At,
  Request_Parent_ID,
  Request_Estimated_Hours,
  Request_Logged_Hours,
  Request_Finished_At,
  Request_Requester_Team_ID,
  Request_Is_Confidential,
  Request_Is_Legacy,
  Request_Legacy_Requester,
  Request_Form_Data,
  Request_Template_Schema_Snapshot,
  template_schema:TBL_Requests_Templates!Request_Template_ID ( Request_Template_Form_Schema ),
  requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url,
    department:TBL_Departments!Department_ID ( Department_Name )
  ),
  requester_team:TBL_Teams!Request_Requester_Team_ID ( Team_ID, Team_Name, Team_Code ),
  requester_department:TBL_Departments!Request_Requester_Department_ID ( Department_Name ),
  column:TBL_Board_Columns!Request_Board_Column_ID ( Board_Column_Name, Board_Column_Slug ),
  assignments:TBL_Requests_Assignments (
    Request_Assignment_At,
    assignee:TBL_Users!Request_Assignment_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url )
  ),
  teams:TBL_Request_Team ( team:TBL_Board_Teams!Request_Team_ID ( Board_Team_ID, Board_Team_Code ) ),
  labels:TBL_Request_Labels ( label:TBL_Labels!Request_Labels_Label_ID ( Label_ID, Label_Name, Label_Color, Label_Icon ) ),
  sub_teams:TBL_Request_Sub_Team ( sub_team:TBL_Sub_Teams!Request_Sub_Team_ID ( Sub_Team_ID, Sub_Team_Name, Sub_Team_Color ) ),
  sprints:TBL_Request_Sprint ( Request_Sprint_ID, sprint:TBL_Sprint!Request_Sprint_ID ( Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date ) ),
  child_count:TBL_Requests!Request_Parent_ID ( count ),
  closure:TBL_Request_Closure (
    Closure_ID, Closure_Note, Closure_Type, Attachment_URL, Attachment_Name, Attachment_Mime, Closed_At,
    closer:TBL_Users!Closed_By ( User_ID, User_Name ),
    closure_attachments:TBL_Closure_Attachments ( Closure_Attachment_ID, Storage_Path, File_Name, Mime_Type, File_Size, Created_At )
  ),
  criteria:TBL_Acceptance_Criteria ( Status )
`.trim();

type RawClosureAttachment = {
  Closure_Attachment_ID: number;
  Storage_Path:          string;
  File_Name:             string;
  Mime_Type:             string;
  File_Size:             number;
  Created_At:            string;
  Signed_Url:            string | null;
};

type RawClientFeedback = {
  Feedback_ID:    number;
  Request_ID:     string;
  Submitted_By:   number;
  Decision:       'approved' | 'rejected';
  Feedback_Note:  string | null;
  Submitted_At:   string;
  submitter: { User_Name: string } | null;
};

type RawRequestRow = {
  Request_ID:                          string;
  Request_Board_Column_ID:             number;
  Request_Requested_By:                number;
  Request_Template_ID:                 number;
  Request_Title:                       string | null;
  Request_Description:                 string | null;
  Request_Score:                       number | null;
  Request_Progress:                    number | null;
  Request_Created_At:                  string | null;
  Request_Estimated_Hours:             number | null;
  Request_Logged_Hours: number | null; 
  Request_Finished_At:                 string | null;
  Request_Parent_ID:                   string | null;
  Request_Requester_Team_ID:           number | null;
  requester_department: { Department_Name: string } | null;
  Request_Is_Confidential:             boolean | null;
  Request_Is_Legacy:                   boolean | null;
  Request_Legacy_Requester:            string | null;
  Request_Form_Data:                   Record<string, unknown> | null;
  // snapshot guardado al crear el ticket — fuente de verdad para filtros
  Request_Template_Schema_Snapshot:    unknown[] | null;
  // fallback live — usado si el snapshot es null (tickets pre-migración)
  template_schema: { Request_Template_Form_Schema: unknown[] } | null;

  requester: { User_Name: string; User_Email: string; User_Avatar_url: string; department?: { Department_Name: string } | null } | null;
  requester_team: { Team_ID: number; Team_Name: string; Team_Code: string } | null;
  column:         { Board_Column_Name: string; Board_Column_Slug: string | null } | null;

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

closure: Array<{
    Closure_ID:      number;
    Closure_Note:    string;
    Closure_Type:    'new' | 'reuse' | 'skip';
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
  }> | null;
};

const COLUMN_NAME_TO_KANBAN: Record<string, KanbanColumna> = {
  'Sin categorizar': 'sin_categorizar',
  'Icebox':          'icebox',
  'Backlog':         'backlog',
  'To do':           'todo',
  'En progreso':     'en_progreso',
  'En revisión QAS': 'en_revision_qas',
  'Client Review':   'cliente_review',
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
  const columna              = row.column?.Board_Column_Slug
    ?? COLUMN_NAME_TO_KANBAN[row.column?.Board_Column_Name ?? '']
    ?? 'sin_categorizar';
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
    // Camino Edge: viene pre-calculado como criteria_summary.
    const s = (row as Record<string, unknown>).criteria_summary as
      { total: number; accepted: number; rejected: number } | null | undefined;
    if (s && s.total > 0) return s;
    // Camino directo: viene como array criteria:[{Status}]; calculamos aquí.
    const arr = (row as Record<string, unknown>).criteria as { Status: string }[] | undefined;
    if (arr && arr.length > 0) {
      const total = arr.length;
      const accepted = arr.filter((c) => c.Status === 'accepted').length;
      const rejected = arr.filter((c) => c.Status === 'rejected').length;
      return { total, accepted, rejected };
    }
    return null;
  })();

  let extraFields: RequestExtraFields | null = null;
  if (row.crm_extra) extraFields = { templateType: 'crm', storeName: row.crm_extra.Request_CRM_Example_Store_Name };

  const solicitante = row.requester?.User_Name ?? '';
  const isLegacy        = row.Request_Is_Legacy ?? false;
  const legacyRequester = row.Request_Legacy_Requester ?? null;

const requesterTeamName =
  row.requester_team?.Team_Name ??
  row.requester_department?.Department_Name ??
  row.requester?.department?.Department_Name ??
  null;
    const formData    = row.Request_Form_Data ?? {};

  // Snapshot tiene prioridad — es el schema que tenía el template cuando se creó el ticket.
  // Si no existe (tickets pre-migración), fallback al schema live del template.
const templateFormSchema = (
  row.template_schema?.Request_Template_Form_Schema ??
  row.Request_Template_Schema_Snapshot ??
  []
);
const templateSchemaSnapshot = (
    row.Request_Template_Schema_Snapshot ??
    row.template_schema?.Request_Template_Form_Schema ??
    []
  );
function mapOneClosure(c: NonNullable<RawRequestRow['closure']>[number]): CierreInfo {
    return {
      closureId:      c.Closure_ID,
      closureNote:    c.Closure_Note,
      closureType:    (c as any).Closure_Type ?? 'new',
      closedAt:       c.Closed_At,
      closedBy: { userId: c.closer?.User_ID ?? 0, userName: c.closer?.User_Name ?? '' },
      attachments:    (c.closure_attachments ?? []).map((a) => ({
        attachmentId: a.Closure_Attachment_ID,
        storagePath:  a.Storage_Path,
        fileName:     a.File_Name,
        mimeType:     a.Mime_Type,
        fileSize:     a.File_Size,
        createdAt:    a.Created_At,
        signedUrl:    null,
      })),
      attachmentUrl:  c.Attachment_URL,
      attachmentName: c.Attachment_Name,
      attachmentMime: c.Attachment_Mime,
    };
  }

  const cierreHistorial: CierreInfo[] = Array.isArray(row.closure)
    ? [...row.closure]
        .sort((a, b) => new Date(b.Closed_At).getTime() - new Date(a.Closed_At).getTime())
        .map(mapOneClosure)
    : [];

  const cierreInfo: CierreInfo | null = cierreHistorial[0] ?? null;
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
    requesterTeamName,
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
    loggedHours:     row.Request_Logged_Hours ?? null,
    extraFields,
    formData,
    templateFormSchema,
    templateSchemaSnapshot,
    childCount,
    criteriaSummary,
    cierreInfo,
    cierreHistorial: cierreHistorial.length > 0 ? cierreHistorial : undefined,
    isConfidential:  row.Request_Is_Confidential ?? false,
    isLegacy,
    legacyRequester,
    clientFeedback:  undefined,
  };
}

function mapRawFeedback(raw: RawClientFeedback): ClientFeedback {
  return {
    feedbackId:    raw.Feedback_ID,
    requestId:     raw.Request_ID,
    submittedBy:   raw.Submitted_By,
    submitterName: raw.submitter?.User_Name ?? '',
    decision:      raw.Decision,
    feedbackNote:  raw.Feedback_Note,
    submittedAt:   raw.Submitted_At,
  };
}

export class SupabaseRequestsService {
  private readonly boardId: number;
  constructor(boardId: number) { this.boardId = boardId; }

  async fetchAllByBoard(): Promise<Request[]> {
        console.log('🔵 fetchAllByBoard (Edge)');
    const rows = await apiClient.call<RawRequestRow[]>('fetchAllByBoard', { boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }
async fetchAllByBoardStats(): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchAllByBoardStats', { boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }
async fetchByTeamCode(teamCode: string): Promise<Request[]> {
    // Read directo a PostgREST (Fase 4). Replica el handler: columnas activas
    // (sin límite) + historial (col 9, límite 50). El filtro !inner por equipo
    // reemplaza el two-step + chunkedIn del Edge Function.
    if (config.USE_DIRECT_READS) {
      const HISTORIAL_COLUMN_ID = 9;
      const HISTORIAL_LIMIT     = 50;

      // Alias 'team_filter' distinto del 'teams' que ya trae BASE_SELECT_DIRECT,
      // para no colisionar (dos relaciones con el mismo alias = error 400).
      const teamFilter = `team_filter:TBL_Request_Team!inner( bt:TBL_Board_Teams!inner(Board_Team_Code) )`;
      const selectWithTeamFilter = `${BASE_SELECT_DIRECT}, ${teamFilter}`;

      // 1. Columnas activas (todo excepto historial), sin límite.
      const activePromise = supabase
        .from('TBL_Requests')
        .select(selectWithTeamFilter)
        .eq('Request_Board_ID', this.boardId)
        .eq('team_filter.bt.Board_Team_Code', teamCode)
        .neq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID)
        .order('Request_Created_At', { ascending: false });

      // 2. Historial (columna 9), limitado a 50, ordenado.
      const historialPromise = supabase
        .from('TBL_Requests')
        .select(selectWithTeamFilter)
        .eq('Request_Board_ID', this.boardId)
        .eq('team_filter.bt.Board_Team_Code', teamCode)
        .eq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID)
        .order('Request_Created_At', { ascending: false })
        .order('Request_ID',         { ascending: false })
        .limit(HISTORIAL_LIMIT);

      const [activeRes, historialRes] = await Promise.all([activePromise, historialPromise]);
      if (activeRes.error)    throw new Error(`[direct] fetchByTeamCode activas: ${activeRes.error.message}`);
      if (historialRes.error) throw new Error(`[direct] fetchByTeamCode historial: ${historialRes.error.message}`);

      const combined = [...(activeRes.data ?? []), ...(historialRes.data ?? [])];
      return combined.map((row) => mapRowToRequest(row as unknown as RawRequestRow));
    }
    
    // [EDGE] Camino actual vía Edge Function
    console.log('🔵 fetchByTeamCode (Edge), team:', teamCode);
    const rows = await apiClient.call<RawRequestRow[]>('fetchByTeamCode', { boardId: this.boardId, teamCode });
    return rows.map(mapRowToRequest);
  }
  
  async fetchUncategorized(): Promise<Request[]> {
    // Read directo a PostgREST (Fase 4) — 0 invocaciones de Edge Function.
    // Requiere USE_SUPABASE_AUTH + token authenticated + RLS activo.
    if (config.USE_DIRECT_READS) {
            console.log('🟢 fetchUncategorized: leyendo DIRECTO de PostgREST');
      const { data, error } = await supabase
        .from('TBL_Requests')
        .select(BASE_SELECT_DIRECT)
        .eq('Request_Board_Column_ID', 1)   // "Sin categorizar" en board 1
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(`[direct] fetchUncategorized: ${error.message}`);
      return (data ?? []).map((row) => mapRowToRequest(row as unknown as RawRequestRow));
    }

    // [EDGE] Camino actual vía Edge Function
        console.log('🔵 fetchUncategorized: leyendo por EDGE FUNCTION');
    const rows = await apiClient.call<RawRequestRow[]>('fetchUncategorized', { boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }

  async fetchById(id: string): Promise<Request> {
    const row    = await apiClient.call<RawRequestRow>('fetchById', { id });
    const mapped = mapRowToRequest(row);

    if (mapped.cierreHistorial && mapped.cierreHistorial.length > 0) {
      mapped.cierreHistorial = await Promise.all(
        mapped.cierreHistorial.map(async (cierre) => {
          if (cierre.attachments.length === 0) return cierre;
          const withUrls = await this.fetchClosureAttachments(cierre.closureId);
          return { ...cierre, attachments: withUrls };
        }),
      );
      mapped.cierreInfo = mapped.cierreHistorial[0] ?? null;
    }
    return mapped;
  }

  async fetchByRequestedBy(userId: number): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchByRequestedBy', { userId, boardId: this.boardId });
    return rows.map(mapRowToRequest);
  }

  async fetchByAssignedTo(userId: number): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchByAssignedTo', { userId, boardId: this.boardId });
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

  async fetchClientFeedback(requestId: string): Promise<ClientFeedback[]> {
    const rows = await apiClient.call<RawClientFeedback[]>('fetchClientFeedback', { requestId });
    return (rows ?? []).map(mapRawFeedback);
  }

  async submitClientFeedback(payload: SubmitClientFeedbackPayload): Promise<ClientFeedback> {
    const raw = await apiClient.call<RawClientFeedback>('submitClientFeedback', {
      requestId:      payload.requestId,
      submittedBy:    payload.submittedBy,
      decision:       payload.decision,
      feedbackNote:   payload.feedbackNote,
      targetColumnId: payload.targetColumnId,
    });
    return mapRawFeedback(raw);
  }

  async createRequest(payload: CrearRequestPayload): Promise<Request> {
    const { acceptanceCriteria: _ignored, ...rest } = payload;
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
      requesterDepartmentId: rest.requesterDepartmentId ?? null,
      isConfidential:  rest.isConfidential ?? false,
      formData:        rest.formData ?? {},
    });
    return mapRowToRequest(row);
  }

async moveToColumn({ id, columnId, movedBy }: MoverRequestPayload): Promise<void> {
  await apiClient.call('moveToColumn', { id, columnId, movedBy });
}
async fetchTeamHistorialPage(
    teamCode: string,
    cursor: { createdAt: string; id: string },
  ): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('fetchTeamHistorialPage', {
      boardId:         this.boardId,
      teamCode,
      cursorCreatedAt: cursor.createdAt,
      cursorId:        cursor.id,
    });
    return rows.map(mapRowToRequest);
  }

  async searchRequests(teamCode: string, query: string): Promise<Request[]> {
    const rows = await apiClient.call<RawRequestRow[]>('searchRequests', {
      boardId: this.boardId,
      teamCode,
      query,
    });
    return rows.map(mapRowToRequest);
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
  loggedHours:    patch.loggedHours,
    formData:       patch.formData, 
  });
        if (patch.subTeamIds !== undefined) {
      await apiClient.call('updateRequestSubTeams', { id, subTeamIds: patch.subTeamIds });
    }
  }

  async deleteRequest(id: string): Promise<void> {
    await apiClient.call('deleteRequest', { id });
  }

async closeRequest(payload: CerrarRequestPayload): Promise<CierreInfo> {
  const mode = payload.evidenceMode ?? 'new';

  const row = await apiClient.call<{
    Closure_ID:   number;
    Closure_Note: string;
    Closure_Type: 'new' | 'reuse' | 'skip';
    Closed_At:    string;
    closer: { User_ID: number; User_Name: string } | null;
  }>('closeRequest', {
    requestId:          payload.requestId,
    closedBy:           payload.closedBy,
    closureNote:        payload.closureNote,
    targetColumnId:     payload.targetColumnId,
    evidenceMode:       mode,
    reuseFromClosureId: mode === 'reuse' ? (payload.reuseFromClosureId ?? null) : null,
    attachmentUrl:      null,
    attachmentName:     null,
    attachmentMime:     null,
  });

  const closureId = row.Closure_ID;
  const uploadedAttachments: ClosureAttachment[] = [];

  // Solo subir archivos en modo 'new'
  if (mode === 'new' && payload.attachments.length > 0) {
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

  // En modo 'reuse', el clone se hizo en el backend → el refetch traerá los attachments

  return {
    closureId,
    closureNote:    row.Closure_Note,
    closureType:    row.Closure_Type,
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