// shared/selects.ts

/**
 * Cadenas de `select` de PostgREST reutilizables para leer requests.
 *
 * Centraliza los grafos de columnas y relaciones que se piden a Supabase, para
 * no duplicarlos entre handlers. Cada constante representa un nivel de detalle:
 * - {@link BASE_SELECT} — lectura completa del ticket (incluye adjuntos de cierre).
 * - {@link DETAIL_SELECT} — {@link BASE_SELECT} + criterios de aceptación.
 * - {@link BASE_SELECT_LIGHT} — versión aligerada (sin schema de plantilla ni
 *   adjuntos de cierre).
 * - {@link STATS_SELECT} — subconjunto mínimo para métricas/estadísticas.
 *
 * @module selects
 */

/**
 * Select completo de un request.
 *
 * @remarks
 * Incluye datos escalares, el schema de la plantilla (`template_schema`),
 * solicitante con su departamento, equipo y departamento del solicitante,
 * columna, asignaciones, equipos, etiquetas, subequipos, sprints, conteo de
 * hijos y el bloque de cierre (`closure`) con sus adjuntos (`closure_attachments`).
 * Es el select "pesado" usado, por ejemplo, en la exportación.
 */
export const BASE_SELECT = `
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
  template_schema:TBL_Requests_Templates!Request_Template_ID (
    Request_Template_Form_Schema
  ),
  requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url,
    department:TBL_Departments!Department_ID (
      Department_Name
    )
  ),
    requester_team:TBL_Teams!Request_Requester_Team_ID (
    Team_ID, Team_Name, Team_Code
  ),
    requester_department:TBL_Departments!Request_Requester_Department_ID (
    Department_Name
  ),
  column:TBL_Board_Columns!Request_Board_Column_ID (
    Board_Column_Name, Board_Column_Slug
  ),
  assignments:TBL_Requests_Assignments (
    Request_Assignment_At,
    assignee:TBL_Users!Request_Assignment_User_ID (
      User_ID, User_Name, User_Email, User_Avatar_url
    )
  ),
  teams:TBL_Request_Team (
    team:TBL_Board_Teams!Request_Team_ID (
      Board_Team_ID, Board_Team_Code
    )
  ),
  labels:TBL_Request_Labels (
    label:TBL_Labels!Request_Labels_Label_ID (
      Label_ID, Label_Name, Label_Color, Label_Icon
    )
  ),
  sub_teams:TBL_Request_Sub_Team (
    sub_team:TBL_Sub_Teams!Request_Sub_Team_ID (
      Sub_Team_ID, Sub_Team_Name, Sub_Team_Color
    )
  ),
  sprints:TBL_Request_Sprint (
    Request_Sprint_ID,
    sprint:TBL_Sprint!Request_Sprint_ID (
      Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date
    )
  ),
  child_count:TBL_Requests!Request_Parent_ID ( count ),
closure:TBL_Request_Closure (
  Closure_ID,
  Closure_Note,
  Closure_Type,
      Attachment_URL,
    Attachment_Name,
    Attachment_Mime,
    Closed_At,
    closer:TBL_Users!Closed_By ( User_ID, User_Name ),
    closure_attachments:TBL_Closure_Attachments (
      Closure_Attachment_ID,
      Storage_Path,
      File_Name,
      Mime_Type,
      File_Size,
      Created_At
    )
  )
`.trim();

/**
 * Select de detalle de un request.
 *
 * @remarks
 * Extiende {@link BASE_SELECT} añadiendo los criterios de aceptación
 * (`criteria`). Se usa en la vista de detalle del ticket.
 */
export const DETAIL_SELECT = `${BASE_SELECT},
  criteria:TBL_Acceptance_Criteria (
    Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At
  )
`.trim();

/**
 * Select aligerado de un request.
 *
 * @remarks
 * Igual que {@link BASE_SELECT} pero sin el `template_schema` de la plantilla y
 * con el bloque `closure` sin sus adjuntos (`closure_attachments`). Pensado para
 * listados donde no hace falta el peso extra de esos joins.
 */
export const BASE_SELECT_LIGHT = `
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
  requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url,
    department:TBL_Departments!Department_ID (
      Department_Name
    )
  ),
  requester_team:TBL_Teams!Request_Requester_Team_ID (
    Team_ID, Team_Name, Team_Code
  ),
  requester_department:TBL_Departments!Request_Requester_Department_ID (
    Department_Name
  ),
  column:TBL_Board_Columns!Request_Board_Column_ID (
    Board_Column_Name, Board_Column_Slug
  ),
  assignments:TBL_Requests_Assignments (
    Request_Assignment_At,
    assignee:TBL_Users!Request_Assignment_User_ID (
      User_ID, User_Name, User_Email, User_Avatar_url
    )
  ),
  teams:TBL_Request_Team (
    team:TBL_Board_Teams!Request_Team_ID (
      Board_Team_ID, Board_Team_Code
    )
  ),
  labels:TBL_Request_Labels (
    label:TBL_Labels!Request_Labels_Label_ID (
      Label_ID, Label_Name, Label_Color, Label_Icon
    )
  ),
  sub_teams:TBL_Request_Sub_Team (
    sub_team:TBL_Sub_Teams!Request_Sub_Team_ID (
      Sub_Team_ID, Sub_Team_Name, Sub_Team_Color
    )
  ),
  sprints:TBL_Request_Sprint (
    Request_Sprint_ID,
    sprint:TBL_Sprint!Request_Sprint_ID (
      Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date
    )
  ),
  child_count:TBL_Requests!Request_Parent_ID ( count ),
  closure:TBL_Request_Closure (
    Closure_ID,
    Closure_Note,
    Closure_Type,
    Attachment_URL,
    Attachment_Name,
    Attachment_Mime,
    Closed_At,
    closer:TBL_Users!Closed_By ( User_ID, User_Name )
  )
`.trim();

/**
 * Select mínimo para estadísticas/métricas.
 *
 * @remarks
 * Trae solo lo necesario para calcular indicadores (puntaje, fechas, horas
 * estimadas/registradas) junto con columna, asignados, equipos, sprints y
 * etiquetas. Omite descripción, plantilla, cierre y demás campos pesados.
 */
export const STATS_SELECT = `
  Request_ID,
  Request_Board_Column_ID,
  Request_Score,
  Request_Created_At,
  Request_Finished_At,
  Request_Estimated_Hours,
  Request_Logged_Hours,
  Request_Title,
  column:TBL_Board_Columns!Request_Board_Column_ID (
    Board_Column_Name, Board_Column_Slug
  ),
  assignments:TBL_Requests_Assignments (
    Request_Assignment_At,
    assignee:TBL_Users!Request_Assignment_User_ID (
      User_ID, User_Name
    )
  ),
  teams:TBL_Request_Team (
    team:TBL_Board_Teams!Request_Team_ID (
      Board_Team_ID, Board_Team_Code
    )
  ),
  sprints:TBL_Request_Sprint (
    Request_Sprint_ID,
    sprint:TBL_Sprint!Request_Sprint_ID (
      Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date
    )
  ),
  labels:TBL_Request_Labels (
    label:TBL_Labels!Request_Labels_Label_ID (
      Label_ID, Label_Name, Label_Color, Label_Icon
    )
  )
`.trim();