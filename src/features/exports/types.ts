// src/features/exports/types.ts

/* ============================================================
   Tipos compartidos del módulo de exports
   ============================================================ */

/** Filtros que viajan al Edge Function en exportRequests */
export type ExportFilters = {
  boardId:         number;
  teamIds?:        number[] | null;
  sprintIds?:      number[] | null;
  columnIds?:      number[] | null;
  requestedByIds?: number[] | null;
  assignedToIds?:  number[] | null;
  priorityScores?: number[] | null;
  templateIds?:    number[] | null;
  labelIds?:       number[] | null;
  isConfidential?: boolean | null;
  dateFrom?:       string | null;
  dateTo?:         string | null;
  limit?:          number;
};

/** Formato de archivo a generar */
export type ExportFormat = 'xlsx' | 'csv';

/** Tipo de dato de una columna — determina cómo la formatea el builder */
export type ExportColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'priority';

/** Origen de la columna */
export type ExportColumnSource = 'fixed' | 'dynamic';

/** Descriptor de una columna del export */
export type ExportColumn = {
  /** ID único (e.g. 'request_id', 'dyn:periodicidad') */
  id:        string;
  /** Etiqueta visible en el header del Excel/CSV */
  label:     string;
  /** Tipo de dato */
  type:      ExportColumnType;
  /** Si es fija (estructural) o dinámica (de template snapshot) */
  source:    ExportColumnSource;
  /** Ancho sugerido en caracteres (para XLSX) */
  width?:    number;
  /** Si es dinámica, qué template la define (para agrupar en hojas) */
  templateId?: number;
  /** Función que extrae el valor del ticket */
  accessor:  (ticket: ExportTicket) => unknown;
};

/** Configuración completa de un export */
export type ExportConfig = {
  filters:        ExportFilters;
  selectedColumns: string[];   // IDs ordenados de columnas a incluir
  format:         ExportFormat;
  /** Si true, genera una hoja por template (recomendado). Si false, todo en una hoja. */
  sheetPerTemplate: boolean;
};

/* ── Shape de los datos que devuelve el backend ──────────── */

/** Ticket enriquecido con joins (shape del BASE_SELECT) */
export type ExportTicket = {
  Request_ID:                       string;
  Request_Title:                    string | null;
  Request_Description:              string | null;
  Request_Score:                    number | null;
  Request_Progress:                 number | null;
  Request_Created_At:               string | null;
  Request_Estimated_Hours:          number | null;
  Request_Logged_Hours:             number | null;
  Request_Finished_At:              string | null;
  Request_Is_Confidential:          boolean | null;
  Request_Form_Data:                Record<string, unknown> | null;
  Request_Template_Schema_Snapshot: unknown[] | null;
  Request_Template_ID:              number;
  Request_Parent_ID:                string | null;

  template_schema?: { Request_Template_Form_Schema: unknown[] } | null;

  requester?: {
    User_Name:       string;
    User_Email:      string;
    department?:     { Department_Name: string } | null;
  } | null;

  requester_team?:       { Team_Name: string; Team_Code: string } | null;
  requester_department?: { Department_Name: string } | null;

  column?: {
    Board_Column_Name: string;
    Board_Column_Slug: string | null;
  } | null;

  assignments?: Array<{
    Request_Assignment_At: string;
    assignee: {
      User_ID:    number;
      User_Name:  string;
      User_Email: string;
    } | null;
  }> | null;

  teams?: Array<{
    team: { Board_Team_ID: number; Board_Team_Code: string } | null;
  }> | null;

  labels?: Array<{
    label: {
      Label_ID:    number;
      Label_Name:  string;
      Label_Color: string;
      Label_Icon:  string;
    } | null;
  }> | null;

  sub_teams?: Array<{
    sub_team: { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string } | null;
  }> | null;

  sprints?: Array<{
    sprint: {
      Sprint_ID:         number;
      Sprint_Text:       string;
      Sprint_Start_Date: string;
      Sprint_End_Date:   string;
    } | null;
  }> | null;

  closure?: Array<{
    Closure_ID:   number;
    Closure_Note: string;
    Closure_Type: 'new' | 'reuse' | 'skip';
    Closed_At:    string;
    closer:       { User_ID: number; User_Name: string } | null;
  }> | null;
};

/** Catálogo de templates para agrupar por hoja y resolver dinámicos */
export type ExportTemplate = {
  Request_Template_ID:          number;
  Request_Template_Name:        string;
  Request_Template_Icon:        string | null;
  Request_Template_Color:       string | null;
  Request_Template_Form_Schema: unknown[];
};

export type ExportBoardTeam = {
  Board_Team_ID:    number;
  Board_Team_Name:  string;
  Board_Team_Code:  string;
  Board_Team_Color: string;
};

export type ExportBoardColumn = {
  Board_Column_ID:       number;
  Board_Column_Name:     string;
  Board_Column_Slug:     string | null;
  Board_Column_Position: number;
  Board_Column_Color:    string;
};

/** Response completa del action exportRequests */
export type ExportDataset = {
  tickets:      ExportTicket[];
  templates:    ExportTemplate[];
  boardTeams:   ExportBoardTeam[];
  boardColumns: ExportBoardColumn[];
  meta: {
    totalMatched: number;
    returned:     number;
    truncated:    boolean;
    maxLimit:     number;
    generatedAt:  string;
  };
};

/* ============================================================
   FASE 2 — Job async y historial
   ============================================================ */

export type ExportJobStatus = 'pending' | 'running' | 'done' | 'failed';

/** Shape de TBL_Background_Jobs cuando Job_Type='export_requests' */
export type ExportBackgroundJob = {
  Job_ID:               string;
  Job_Type:             'export_requests';
  Job_Status:           ExportJobStatus;
  Job_Progress_Current: number;
  Job_Progress_Total:   number;
  Job_Result:           {
    exportId?:      string;
    totalChunks?:   number;
    totalTickets?:  number;
    storagePrefix?: string;
    fileName?:      string;
    format?:        ExportFormat;
  } | null;
  Job_Error:            string | null;
  Job_Created_At:       string;
  Job_Updated_At:       string;
  Job_Completed_At:     string | null;
};

/** Shape de fila en TBL_Export_History */
export type ExportHistoryEntry = {
  Export_ID:              string;
  Export_Job_ID:          string;
  Export_Format:          ExportFormat;
  Export_Filters:         ExportFilters;
  Export_Columns:         string[];
  Export_Sheet_Per_Tpl:   boolean;
  Export_Total:           number;
  Export_File_Name:       string | null;
  Export_Storage_Prefix:  string | null;
  Export_Status:          ExportJobStatus | 'expired';
  Export_Error:           string | null;
  Export_Created_At:      string;
  Export_Completed_At:    string | null;
  Export_Downloaded_At:   string | null;
  Export_Download_Count:  number;
  Export_Auto_Delete_At:  string;
};

/** Respuesta de createExportJob */
export type CreateExportJobResponse = {
  jobId:       string;
  exportId:    string;
  total:       number;
  chunksTotal: number;
};

/** Respuesta de getExportArtifactUrls */
export type ExportArtifactUrls = {
  fileName:    string;
  format:      ExportFormat;
  metadataUrl: string | null;
  chunkUrls:   string[];
  chunksTotal: number;
};

/** Payload para crear un export job */
export type CreateExportJobPayload = {
  userId:           number;
  boardId:          number;
  filters:          Omit<ExportFilters, 'boardId'>;
  format:           ExportFormat;
  selectedColumns:  string[];
  sheetPerTemplate: boolean;
};