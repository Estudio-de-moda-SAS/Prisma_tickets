// supabase/functions/api/index.ts
// @ts-ignore
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';
// @ts-ignore
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const TENANT_ID    = Deno.env.get('AZURE_TENANT_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID    = Deno.env.get('AZURE_CLIENT_ID')!;
const ENTRA_ISSUER_V2 = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const ENTRA_ISSUER_V1 = `https://sts.windows.net/${TENANT_ID}/`;

const ENTRA_JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`)
);

async function verifyAzureToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  const raw = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  const issuer = raw.iss?.includes('sts.windows.net') ? ENTRA_ISSUER_V1 : ENTRA_ISSUER_V2;
  const { payload } = await jwtVerify(token, ENTRA_JWKS, {
    issuer,
    audience: `api://${CLIENT_ID}`,
  });
  if (payload['tid'] !== TENANT_ID)
    throw new Error('[API] Token de tenant no autorizado: ' + payload['tid']);
  return payload as Record<string, unknown>;
}

function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number) {
  return corsResponse({ error: message }, status);
}

const SIGNED_URL_EXPIRES_IN = 3600;

/** Columnas que al llegar a ellas finalizan el ticket */
const FINAL_COLUMN_IDS = new Set([6, 9]); // hecho=6, historial=9

function extractStoragePath(storedValue: string): string {
  if (!storedValue.startsWith('http')) return storedValue;
  const marker = '/object/public/attachments/';
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) return storedValue.slice(idx + marker.length);
  return storedValue;
}

/* ── Helper: mapear fila DB → AcceptanceCriteria frontend ── */
function mapCriteria(row: Record<string, unknown>) {
  return {
    criteriaId:    row['Criteria_ID'],
    requestId:     row['Request_ID'],
    title:         row['Title'],
    status:        row['Status'],
    reviewerNotes: row['Reviewer_Notes'] ?? null,
    reviewedBy:    row['Reviewed_By']    ?? null,
    reviewedAt:    row['Reviewed_At']    ?? null,
    createdAt:     row['Created_At'],
    updatedAt:     row['Updated_At'],
  };
}

const BASE_SELECT = `
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
  Request_Form_Data,
  Request_Template_Schema_Snapshot,
  template_schema:TBL_Requests_Templates!Request_Template_ID (
    Request_Template_Form_Schema
  ),
    requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url
  ),
  requester_team:TBL_Teams!Request_Requester_Team_ID (
    Team_ID, Team_Name, Team_Code
  ),
  column:TBL_Board_Columns!Request_Board_Column_ID (
    Board_Column_Name
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
      Sprint_Text
    )
  ),
  child_count:TBL_Requests!Request_Parent_ID ( count ),
  closure:TBL_Request_Closure (
    Closure_ID,
    Closure_Note,
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

/* ── Helper: batch fetch criteria summaries ── */
async function attachCriteriaSummary(
  rows: Record<string, unknown>[],
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r['Request_ID'] as string);
  const { data, error } = await supabase
    .from('TBL_Acceptance_Criteria')
    .select('Request_ID, Status')
    .in('Request_ID', ids);
  if (error || !data) return rows;

  const map: Record<string, { total: number; accepted: number; rejected: number }> = {};
  for (const c of data as { Request_ID: string; Status: string }[]) {
    if (!map[c.Request_ID]) map[c.Request_ID] = { total: 0, accepted: 0, rejected: 0 };
    map[c.Request_ID].total++;
    if (c.Status === 'accepted') map[c.Request_ID].accepted++;
    if (c.Status === 'rejected') map[c.Request_ID].rejected++;
  }

  return rows.map((r) => ({
    ...r,
    criteria_summary: map[r['Request_ID'] as string] ?? null,
  }));
}

/* ── Helper: insertar notificaciones a múltiples usuarios ── */
async function insertNotifications(
  supabase: ReturnType<typeof createServiceClient>,
  notifications: {
    userIds:   number[];
    type:      string;
    title:     string;
    body:      string;
    requestId: string | null;
    actorId:   number | null;
  },
): Promise<void> {
  if (notifications.userIds.length === 0) return;
  const rows = notifications.userIds.map((uid) => ({
    Notification_User_ID:    uid,
    Notification_Type:       notifications.type,
    Notification_Title:      notifications.title,
    Notification_Body:       notifications.body,
    Notification_Request_ID: notifications.requestId,
    Notification_Actor_ID:   notifications.actorId,
    Notification_Is_Read:    false,
    Notification_Created_At: new Date().toISOString(),
  }));
  await supabase.from('TBL_Notifications').insert(rows);
}

/* ── Helper: obtener asignados + solicitante de un ticket ── */
async function getRequestParticipants(
  supabase: ReturnType<typeof createServiceClient>,
  requestId: string,
): Promise<{ assigneeIds: number[]; requestedBy: number | null }> {
  const [assignmentsRes, requestRes] = await Promise.all([
    supabase
      .from('TBL_Requests_Assignments')
      .select('Request_Assignment_User_ID')
      .eq('Request_Assignment_ID', requestId),
    supabase
      .from('TBL_Requests')
      .select('Request_Requested_By')
      .eq('Request_ID', requestId)
      .single(),
  ]);

  const assigneeIds = (
    (assignmentsRes.data ?? []) as { Request_Assignment_User_ID: number }[]
  ).map((a) => a.Request_Assignment_User_ID);

  const requestedBy = requestRes.data
    ? (requestRes.data as { Request_Requested_By: number }).Request_Requested_By
    : null;

  return { assigneeIds, requestedBy };
}
/* ── Helper: renderizar template con variables ── */
function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/* ── Helper: enviar email por evento ── */
async function sendEventEmail(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    eventKey:  string;
    requestId: string;
    userIds:   number[];
    vars:      Record<string, string>;
  },
): Promise<void> {
  if (params.userIds.length === 0) return;

  // 1. Buscar template activo para este evento
  const { data: tpl } = await supabase
    .from('TBL_Email_Templates')
    .select('Email_Template_ID, Email_Template_Name, Email_Template_Subject, Email_Template_Body_html')
    .eq('Email_Template_Event_Key', params.eventKey)
    .eq('Email_Template_Is_Active', true)
    .single();

  if (!tpl) return; // no hay template activo, salir silenciosamente

  // 2. Obtener emails de los destinatarios
  const { data: users } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Email')
    .in('User_ID', params.userIds);

  if (!users || users.length === 0) return;

  const subject  = renderTemplate((tpl as any).Email_Template_Subject, params.vars);
  const htmlBody = renderTemplate((tpl as any).Email_Template_Body_html, params.vars);

  // 3. Por cada destinatario: loguear + (cuando haya proveedor) enviar
  for (const user of users as { User_ID: number; User_Email: string }[]) {
    // ── ENVÍO REAL (descomentar cuando tengas Resend u otro proveedor) ──
    // let status = 'sent';
    // try {
    //   await fetch('https://api.resend.com/emails', {
    //     method: 'POST',
    //     headers: {
    //       'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       from: 'PRISMA <noreply@tudominio.com>',
    //       to:   user.User_Email,
    //       subject,
    //       html: htmlBody,
    //     }),
    //   });
    // } catch {
    //   status = 'error';
    // }

    const status = 'pending'; // cambiar a variable cuando actives el envío

    await supabase.from('TBL_Email_Logs').insert({
      Email_Log_Request_ID:    params.requestId,
      Email_Log_Sent_To:       user.User_ID,
      Email_Log_Template_Name: (tpl as any).Email_Template_Name,
      Email_Log_Subject_Sent:  subject,
      Email_Log_Body_Sent:     htmlBody,
      Email_Log_Status:        status,
      Email_Log_Sent_At:       new Date().toISOString(),
    });
  }
}

async function handleAction(
  action: string,
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<unknown> {
  switch (action) {

    case 'fetchAllByBoard': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
    }

    case 'fetchByTeamCode': {
      const { boardId, teamCode } = payload as { boardId: number; teamCode: string };
      const { data: teamData, error: teamErr } = await supabase
        .from('TBL_Board_Teams').select('Board_Team_ID')
        .eq('Board_Team_Code', teamCode).single();
      if (teamErr) throw new Error(teamErr.message);
      const { data: links, error: linksErr } = await supabase
        .from('TBL_Request_Team').select('Request_Team_Request_ID')
        .eq('Request_Team_ID', teamData.Board_Team_ID);
      if (linksErr) throw new Error(linksErr.message);
      const ids = (links as { Request_Team_Request_ID: string }[]).map((l) => l.Request_Team_Request_ID);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .in('Request_ID', ids).eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
    }

    case 'fetchByRequestedBy': {
      const { userId, boardId } = payload as { userId: number; boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Requested_By', userId).eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
    }

    case 'fetchUncategorized': {
      const { boardId } = payload as { boardId: number };
      const { data: col, error: colErr } = await supabase
        .from('TBL_Board_Columns').select('Board_Column_ID')
        .eq('Board_Column_Board_ID', boardId).eq('Board_Column_Name', 'Sin categorizar').single();
      if (colErr) throw new Error(colErr.message);
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Board_Column_ID', (col as { Board_Column_ID: number }).Board_Column_ID)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchById': {
      const { id } = payload as { id: string };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createRequest': {
      const p = payload as {
        boardId: number; columnId: number; requestedBy: number; templateId: number;
        titulo: string; descripcion: string; score: number; equipoIds: number[];
        labelIds: number[]; sprintId: number | null; estimatedHours: number | null;
        parentId: string | null; requesterTeamId: number | null;
        isConfidential: boolean | null;
        formData?: Record<string, unknown>;
      };
      const { data: tplData } = await supabase
        .from('TBL_Requests_Templates')
        .select('Request_Template_Form_Schema')
        .eq('Request_Template_ID', p.templateId)
        .single();
      const schemaSnapshot = tplData?.Request_Template_Form_Schema ?? [];

      const { data: inserted, error: insErr } = await supabase
        .from('TBL_Requests')
        .insert({
          Request_Board_ID:                    p.boardId,
          Request_Board_Column_ID:             p.columnId,
          Request_Requested_By:                p.requestedBy,
          Request_Template_ID:                 p.templateId,
          Request_Title:                       p.titulo,
          Request_Description:                 p.descripcion,
          Request_Score:                       p.score,
          Request_Progress:                    0,
          Request_Created_At:                  new Date().toISOString(),
          Request_Estimated_Hours:             p.estimatedHours ?? null,
          Request_Parent_ID:                   p.parentId ?? null,
          Request_Requester_Team_ID:           p.requesterTeamId ?? null,
          Request_Is_Confidential:             p.isConfidential ?? false,
          Request_Form_Data:                   p.formData ?? {},
          Request_Template_Schema_Snapshot:    schemaSnapshot,
        })
        .select('Request_ID').single();
      if (insErr) throw new Error(insErr.message);
      const newId = (inserted as { Request_ID: string }).Request_ID;
      const ops = [];
      if (p.equipoIds.length > 0)
        ops.push(supabase.from('TBL_Request_Team').insert(
          p.equipoIds.map((tid) => ({ Request_Team_Request_ID: newId, Request_Team_ID: tid }))
        ));
      if (p.labelIds.length > 0)
        ops.push(supabase.from('TBL_Request_Labels').insert(
          p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid }))
        ));
      if (p.sprintId !== null)
        ops.push(supabase.from('TBL_Request_Sprint').insert(
          { Request_Sprint_Request_ID: newId, Request_Sprint_ID: p.sprintId }
        ));
      await Promise.all(ops);
const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', newId).single();
      if (error) throw new Error(error.message);

      // Email al solicitante
      const { data: requesterData } = await supabase
        .from('TBL_Users')
        .select('User_Name')
        .eq('User_ID', p.requestedBy)
        .single();

      await sendEventEmail(supabase, {
        eventKey:  'ticket_recibido',
        requestId: newId,
        userIds:   [p.requestedBy],
        vars: {
          ticket_id:          newId,
          ticket_title:       p.titulo,
          ticket_url:         `${Deno.env.get('APP_URL') ?? ''}/ticket/${newId}`,
          requester_name:     (requesterData as any)?.User_Name ?? '',
          ticket_description: p.descripcion,
        },
      });

      return data;
    }
    case 'moveToColumn': {
      const { id, columnId, movedBy } = payload as { id: string; columnId: number; movedBy?: number };
      const { data: colData } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_Name')
        .eq('Board_Column_ID', columnId)
        .single();

      // Si es columna final, sellar fecha de cierre y progreso
      const isFinal   = FINAL_COLUMN_IDS.has(columnId);
      const updateData: Record<string, unknown> = { Request_Board_Column_ID: columnId };
      if (isFinal) {
        updateData['Request_Finished_At'] = new Date().toISOString();
        updateData['Request_Progress']    = 100;
      }

      const { error } = await supabase
        .from('TBL_Requests').update(updateData).eq('Request_ID', id);
      if (error) throw new Error(error.message);

      if (movedBy) {
        const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, id);
        const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
          .filter((uid) => uid !== movedBy);
        const colName = (colData as { Board_Column_Name: string } | null)?.Board_Column_Name ?? 'otra columna';
        await insertNotifications(supabase, {
          userIds:   recipientIds,
          type:      'column_move',
          title:     `Ticket movido a "${colName}"`,
          body:      `El ticket ${id} fue movido a la columna "${colName}".`,
          requestId: id,
          actorId:   movedBy,
        });
      }
      // Email
      if (movedBy) {
        const { data: reqDataMove } = await supabase
          .from('TBL_Requests')
          .select('Request_Title')
          .eq('Request_ID', id)
          .single();
        const { assigneeIds: aIds, requestedBy: rBy } = await getRequestParticipants(supabase, id);
        const emailRecipMove = [...new Set([...aIds, ...(rBy ? [rBy] : [])])];
        await sendEventEmail(supabase, {
          eventKey:  'moveToColumn',
          requestId: id,
          userIds:   emailRecipMove,
          vars: {
            ticket_id:    id,
            ticket_title: (reqDataMove as any)?.Request_Title ?? '',
            ticket_url:   `${Deno.env.get('APP_URL') ?? ''}/ticket/${id}`,
            column_name:  (colData as any)?.Board_Column_Name ?? '',
            actor_name:   '',
          },
        });
      }
      return { ok: true };
    }

case 'updateRequest': {
  const { id, ...patch } = payload as {
    id: string; titulo?: string; descripcion?: string; score?: number;
    progreso?: number; estimatedHours?: number | null; loggedHours?: number | null;
    equipoIds?: number[]; labelIds?: number[]; sprintId?: number | null;
  };
  const scalarUpdate: Record<string, unknown> = {};
  if (patch.titulo         !== undefined) scalarUpdate['Request_Title']           = patch.titulo;
  if (patch.descripcion    !== undefined) scalarUpdate['Request_Description']     = patch.descripcion;
  if (patch.score          !== undefined) scalarUpdate['Request_Score']           = patch.score;
  if (patch.progreso       !== undefined) scalarUpdate['Request_Progress']        = Math.min(100, Math.max(0, patch.progreso));
  if (patch.estimatedHours !== undefined) scalarUpdate['Request_Estimated_Hours'] = patch.estimatedHours;
  if (patch.loggedHours    !== undefined) scalarUpdate['Request_Logged_Hours']    = patch.loggedHours;  // ← nuevo
  if (Object.keys(scalarUpdate).length > 0) {
    const { error } = await supabase.from('TBL_Requests').update(scalarUpdate).eq('Request_ID', id);
    if (error) throw new Error(error.message);
  }
  if (patch.equipoIds !== undefined) {
    await supabase.from('TBL_Request_Team').delete().eq('Request_Team_Request_ID', id);
    if (patch.equipoIds.length > 0)
      await supabase.from('TBL_Request_Team').insert(
        patch.equipoIds.map((tid) => ({ Request_Team_Request_ID: id, Request_Team_ID: tid }))
      );
  }
  if (patch.labelIds !== undefined) {
    await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Request_ID', id);
    if (patch.labelIds.length > 0)
      await supabase.from('TBL_Request_Labels').insert(
        patch.labelIds.map((lid) => ({ Request_Labels_Request_ID: id, Request_Labels_Label_ID: lid }))
      );
  }
  if (patch.sprintId !== undefined) {
    await supabase.from('TBL_Request_Sprint').delete().eq('Request_Sprint_Request_ID', id);
    if (patch.sprintId !== null)
      await supabase.from('TBL_Request_Sprint').insert(
        { Request_Sprint_Request_ID: id, Request_Sprint_ID: patch.sprintId }
      );
  }
  return { ok: true };
}

    case 'updateRequestSubTeams': {
      const { id, subTeamIds } = payload as { id: string; subTeamIds: number[] };
      await supabase.from('TBL_Request_Sub_Team').delete().eq('Request_Sub_Team_Request_ID', id);
      if (subTeamIds.length > 0) {
        const { error } = await supabase.from('TBL_Request_Sub_Team').insert(
          subTeamIds.map((sid) => ({ Request_Sub_Team_Request_ID: id, Request_Sub_Team_ID: sid }))
        );
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }

    case 'deleteRequest': {
      const { id } = payload as { id: string };
      await Promise.all([
        supabase.from('TBL_Request_Team').delete().eq('Request_Team_Request_ID', id),
        supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Request_ID', id),
        supabase.from('TBL_Request_Sprint').delete().eq('Request_Sprint_Request_ID', id),
        supabase.from('TBL_Requests_Assignments').delete().eq('Request_Assignment_ID', id),
        supabase.from('TBL_Request_Sub_Team').delete().eq('Request_Sub_Team_Request_ID', id),
        supabase.from('TBL_Acceptance_Criteria').delete().eq('Request_ID', id),
        supabase.from('TBL_Client_Feedback').delete().eq('Request_ID', id),
      ]);
      const { error } = await supabase.from('TBL_Requests').delete().eq('Request_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'fetchChildRequests': {
      const { parentId } = payload as { parentId: string };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Parent_ID', parentId).order('Request_Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'closeRequest': {
      const p = payload as {
        requestId: string; closedBy: number; closureNote: string;
        targetColumnId: number; attachmentUrl: string | null;
        attachmentName: string | null; attachmentMime: string | null;
      };

      // Crear el registro de closure (evidencia)
      // NOTA: ya NO sella Request_Finished_At aquí — eso ocurre en moveToColumn
      // cuando la columna destino es hecho (6) o historial (9).
      const { data: closure, error: closureErr } = await supabase
        .from('TBL_Request_Closure')
        .insert({
          Request_ID:       p.requestId,
          Closed_By:        p.closedBy,
          Closure_Note:     p.closureNote,
          Target_Column_ID: p.targetColumnId,
          Attachment_URL:   p.attachmentUrl  ?? null,
          Attachment_Name:  p.attachmentName ?? null,
          Attachment_Mime:  p.attachmentMime ?? null,
          Closed_At:        new Date().toISOString(),
        })
        .select(`
          Closure_ID, Closure_Note,
          Attachment_URL, Attachment_Name, Attachment_Mime, Closed_At,
          closer:TBL_Users!Closed_By ( User_ID, User_Name )
        `)
        .single();
      if (closureErr) throw new Error(closureErr.message);

      // Mover la columna (moveToColumn se encarga del Finished_At si aplica)
      const isFinal = FINAL_COLUMN_IDS.has(p.targetColumnId);
      const updateData: Record<string, unknown> = {
        Request_Board_Column_ID: p.targetColumnId,
      };
      if (isFinal) {
        updateData['Request_Finished_At'] = new Date().toISOString();
        updateData['Request_Progress']    = 100;
      }
      const { error: updateErr } = await supabase
        .from('TBL_Requests')
        .update(updateData)
        .eq('Request_ID', p.requestId);
      if (updateErr) throw new Error(updateErr.message);

      const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, p.requestId);
      const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
        .filter((uid) => uid !== p.closedBy);
      await insertNotifications(supabase, {
        userIds:   recipientIds,
        type:      'closure',
        title:     `Ticket ${p.requestId} enviado a revisión`,
        body:      `El ticket fue enviado a revisión con evidencia adjunta. Nota: ${p.closureNote.slice(0, 80)}${p.closureNote.length > 80 ? '…' : ''}`,
        requestId: p.requestId,
        actorId:   p.closedBy,
      });
// Obtener datos del ticket para las variables del email
      const { data: requestData } = await supabase
        .from('TBL_Requests')
        .select('Request_Title, Request_Requested_By')
        .eq('Request_ID', p.requestId)
        .single();

      const ticketTitle = (requestData as any)?.Request_Title ?? '';
      const ticketUrl   = `${Deno.env.get('APP_URL') ?? 'https://tusistema.com'}/ticket/${p.requestId}`;

      // Resolver destinatarios del email (mismos que la notificación)
      const emailRecipients = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])];

      await sendEventEmail(supabase, {
        eventKey:  'closeRequest',
        requestId: p.requestId,
        userIds:   emailRecipients,
        vars: {
          ticket_id:     p.requestId,
          ticket_title:  ticketTitle,
          ticket_url:    ticketUrl,
          actor_name:    '', // se resuelve por User_ID abajo si es necesario
          closure_notes: p.closureNote,
        },
      });

      return closure;
    }

    case 'fetchClosureAttachments': {
      const { closureId } = payload as { closureId: number };
      const { data, error } = await supabase
        .from('TBL_Closure_Attachments')
        .select('Closure_Attachment_ID, Storage_Path, File_Name, Mime_Type, File_Size, Created_At')
        .eq('Closure_ID', closureId);
      if (error) throw new Error(error.message);
      const results = await Promise.all(
        (data as any[]).map(async (a) => {
          const { data: signed, error: signErr } = await supabase.storage
            .from('attachments')
            .createSignedUrl(a.Storage_Path, SIGNED_URL_EXPIRES_IN);
          return {
            Closure_Attachment_ID: a.Closure_Attachment_ID,
            Storage_Path:          a.Storage_Path,
            File_Name:             a.File_Name,
            Mime_Type:             a.Mime_Type,
            File_Size:             a.File_Size,
            Created_At:            a.Created_At,
            Signed_Url:            signErr ? null : signed?.signedUrl ?? null,
          };
        })
      );
      return results;
    }

    case 'uploadClosureAttachment': {
      const p = payload as {
        closureId: number; requestId: string; userId: number;
        fileName: string; mimeType: string; sizeBytes: number; base64: string;
      };
      const bucket   = 'attachments';
      const filePath = `closures/${p.requestId}/${Date.now()}_${p.fileName}`;
      const bytes    = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, bytes, { contentType: p.mimeType, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: inserted, error: insertErr } = await supabase
        .from('TBL_Closure_Attachments')
        .insert({
          Closure_ID:   p.closureId,
          Storage_Path: filePath,
          File_Name:    p.fileName,
          Mime_Type:    p.mimeType,
          File_Size:    p.sizeBytes,
          Created_At:   new Date().toISOString(),
        })
        .select('Closure_Attachment_ID, Storage_Path, File_Name, Mime_Type, File_Size, Created_At')
        .single();
      if (insertErr) throw new Error(insertErr.message);

      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

      return {
        Closure_Attachment_ID: (inserted as any).Closure_Attachment_ID,
        Storage_Path:          (inserted as any).Storage_Path,
        File_Name:             (inserted as any).File_Name,
        Mime_Type:             (inserted as any).Mime_Type,
        File_Size:             (inserted as any).File_Size,
        Created_At:            (inserted as any).Created_At,
        Signed_Url:            signErr ? null : signedData?.signedUrl ?? null,
      };
    }

    /* ── Feedback del cliente ───────────────────────────────── */

    case 'fetchClientFeedback': {
      const { requestId } = payload as { requestId: string };
      const { data, error } = await supabase
        .from('TBL_Client_Feedback')
        .select(`
          Feedback_ID, Request_ID, Submitted_By, Decision, Feedback_Note, Submitted_At,
          submitter:TBL_Users!Submitted_By ( User_Name )
        `)
        .eq('Request_ID', requestId)
        .order('Submitted_At', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    }

    case 'submitClientFeedback': {
      const p = payload as {
        requestId:      string;
        submittedBy:    number;
        decision:       'approved' | 'rejected';
        feedbackNote:   string | null;
        targetColumnId: number;
      };

      // Guardar el feedback
      const { data: feedback, error: fbErr } = await supabase
        .from('TBL_Client_Feedback')
        .insert({
          Request_ID:   p.requestId,
          Submitted_By: p.submittedBy,
          Decision:     p.decision,
          Feedback_Note: p.feedbackNote ?? null,
          Submitted_At:  new Date().toISOString(),
        })
        .select(`
          Feedback_ID, Request_ID, Submitted_By, Decision, Feedback_Note, Submitted_At,
          submitter:TBL_Users!Submitted_By ( User_Name )
        `)
        .single();
      if (fbErr) throw new Error(fbErr.message);

      // Mover la columna
      // ready_to_deploy (7) no es final → no sella Finished_At
      // Si el cliente rechaza vuelve a en_revision_qas (8) → tampoco es final
      const { error: moveErr } = await supabase
        .from('TBL_Requests')
        .update({ Request_Board_Column_ID: p.targetColumnId })
        .eq('Request_ID', p.requestId);
      if (moveErr) throw new Error(moveErr.message);

      // Notificar a asignados y solicitante
      const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, p.requestId);
      const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
        .filter((uid) => uid !== p.submittedBy);

      const isApproved  = p.decision === 'approved';
      const notifTitle  = isApproved
        ? `Ticket ${p.requestId} aprobado por el cliente ✓`
        : `Ticket ${p.requestId} rechazado por el cliente ✗`;
      const notifBody   = isApproved
        ? `El cliente aprobó la solicitud. Pasa a Ready to Deploy.${p.feedbackNote ? ` Nota: ${p.feedbackNote.slice(0, 60)}` : ''}`
        : `El cliente rechazó la solicitud y solicita correcciones.${p.feedbackNote ? ` Nota: ${p.feedbackNote.slice(0, 60)}` : ''}`;

      await insertNotifications(supabase, {
        userIds:   recipientIds,
        type:      isApproved ? 'client_approved' : 'client_rejected',
        title:     notifTitle,
        body:      notifBody,
        requestId: p.requestId,
        actorId:   p.submittedBy,
      });

// Email
const { data: actorData } = await supabase
  .from('TBL_Users')
  .select('User_Name')
  .eq('User_ID', p.submittedBy)
  .single();
      const { data: reqDataFb } = await supabase
        .from('TBL_Requests')
        .select('Request_Title')
        .eq('Request_ID', p.requestId)
        .single();
      const emailRecipFb = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])];
      await sendEventEmail(supabase, {
        eventKey:  'submitClientFeedback',
        requestId: p.requestId,
        userIds:   emailRecipFb,
        vars: {
          ticket_id:       p.requestId,
          ticket_title:    (reqDataFb as any)?.Request_Title ?? '',
          ticket_url:      `${Deno.env.get('APP_URL') ?? ''}/ticket/${p.requestId}`,
          feedback_status: p.decision === 'approved' ? 'aprobado ✓' : 'rechazado ✗',
          actor_name:      (actorData as any)?.User_Name ?? '',
        },
      });
      return feedback;
    }

    case 'deleteAttachment': {
      const { attachmentId } = payload as { attachmentId: number };
      const { data: existing, error: fetchErr } = await supabase
        .from('TBL_Attachments').select('Attachment_File_url').eq('Attachment_ID', attachmentId).single();
      if (fetchErr) throw new Error(fetchErr.message);
      const storagePath = extractStoragePath((existing as any).Attachment_File_url as string);
      await supabase.storage.from('attachments').remove([storagePath]);
      const { error } = await supabase.from('TBL_Attachments').delete().eq('Attachment_ID', attachmentId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Criterios de aceptación ─────────────────────────────

    case 'fetchAcceptanceCriteria': {
      const { requestId } = payload as { requestId: string };
      const { data, error } = await supabase
        .from('TBL_Acceptance_Criteria')
        .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
        .eq('Request_ID', requestId)
        .order('Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as Record<string, unknown>[]).map(mapCriteria);
    }

    case 'createAcceptanceCriteria': {
      const { requestId, title } = payload as { requestId: string; title: string };
      const { data, error } = await supabase
        .from('TBL_Acceptance_Criteria')
        .insert({
          Request_ID: requestId,
          Title:      title.trim(),
          Status:     'pending',
          Created_At: new Date().toISOString(),
          Updated_At: new Date().toISOString(),
        })
        .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
        .single();
      if (error) throw new Error(error.message);
      return mapCriteria(data as Record<string, unknown>);
    }

    case 'updateAcceptanceCriteriaStatus': {
      const { criteriaId, status, reviewedBy, reviewerNotes, requestId } = payload as {
        criteriaId:    number;
        status:        'accepted' | 'rejected' | 'pending';
        reviewedBy:    number;
        reviewerNotes: string | null;
        requestId:     string;
      };
      const { data, error } = await supabase
        .from('TBL_Acceptance_Criteria')
        .update({
          Status:         status,
          Reviewed_By:    reviewedBy,
          Reviewer_Notes: reviewerNotes ?? null,
          Reviewed_At:    status !== 'pending' ? new Date().toISOString() : null,
          Updated_At:     new Date().toISOString(),
        })
        .eq('Criteria_ID', criteriaId)
        .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
        .single();
      if (error) throw new Error(error.message);

      if (requestId && status !== 'pending') {
        const { assigneeIds } = await getRequestParticipants(supabase, requestId);
        const recipientIds = assigneeIds.filter((uid) => uid !== reviewedBy);
        const statusLabel = status === 'accepted' ? 'aceptado ✓' : 'rechazado ✗';
        await insertNotifications(supabase, {
          userIds:   recipientIds,
          type:      'criteria_reviewed',
          title:     `Criterio ${statusLabel}`,
          body:      `Un criterio de aceptación fue ${statusLabel} en el ticket ${requestId}.`,
          requestId: requestId,
          actorId:   reviewedBy,
        });
      }

// Email
      if (requestId && status !== 'pending') {
        const { data: reqDataCrit } = await supabase
          .from('TBL_Requests')
          .select('Request_Title')
          .eq('Request_ID', requestId)
          .single();
        const { assigneeIds: aIdsCrit } = await getRequestParticipants(supabase, requestId);
        await sendEventEmail(supabase, {
          eventKey:  'updateAcceptanceCriteriaStatus',
          requestId: requestId,
          userIds:   aIdsCrit,
          vars: {
            ticket_id:      requestId,
            ticket_title:   (reqDataCrit as any)?.Request_Title ?? '',
            ticket_url:     `${Deno.env.get('APP_URL') ?? ''}/ticket/${requestId}`,
            criteria_title: '',
            new_status:     status,
            actor_name:     '',
          },
        });
      }
      return mapCriteria(data as Record<string, unknown>);
    }

    case 'deleteAcceptanceCriteria': {      const { criteriaId } = payload as { criteriaId: number };
      const { error } = await supabase
        .from('TBL_Acceptance_Criteria')
        .delete()
        .eq('Criteria_ID', criteriaId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Usuarios ────────────────────────────────────────────────

    case 'fetchUserByEntraId': {
      const { entraId } = payload as { entraId: string };
      const { data, error } = await supabase
        .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
        .eq('User_EntraID', entraId).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchAllUsers': {
      const { data, error } = await supabase
        .from('TBL_Users')
        .select(`
          User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
          Department_ID, Team_ID, Is_New,
          department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
          team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
        `)
        .order('User_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

case 'fetchAllUsers': {
      const { data, error } = await supabase
        .from('TBL_Users')
        .select(`
          User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
          Department_ID, Team_ID, Is_New, "Is_Active",
          department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
          team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
        `)
        .order('User_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

case 'upsertUserByEntraId': {
  const p = payload as { entraId: string; name: string; email: string };

  // 1. Buscar por EntraID (flujo normal)
  const { data: existing, error: findErr } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active"')
    .eq('User_EntraID', p.entraId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing) {
    const userId = (existing as any).User_ID;
    const teamId = (existing as any).Team_ID;
    let teamData = null;
    if (teamId) {
      const { data: t } = await supabase
        .from('TBL_Teams').select('Team_Code, Team_Name').eq('Team_ID', teamId).single();
      teamData = t;
    }
    return { ...existing, team: teamData };
  }

  // 2. NO encontró por EntraID → buscar pre-registro por email
  const normalizedEmail = p.email.toLowerCase().trim();
  const { data: preReg, error: preRegErr } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active"')
    .eq('User_EntraID', '')
    .ilike('User_Email', normalizedEmail)
    .maybeSingle();
  if (preRegErr) throw new Error(preRegErr.message);

  if (preReg) {
    // Encontró pre-registro → vincular el EntraID real
    const { data: linked, error: linkErr } = await supabase
      .from('TBL_Users')
      .update({
        User_EntraID: p.entraId,
        User_Name:    p.name.slice(0, 150),
      })
      .eq('User_ID', (preReg as any).User_ID)
      .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active"')
      .single();
    if (linkErr) throw new Error(linkErr.message);

    const teamId = (linked as any).Team_ID;
    let teamData = null;
    if (teamId) {
      const { data: t } = await supabase
        .from('TBL_Teams').select('Team_Code, Team_Name').eq('Team_ID', teamId).single();
      teamData = t;
    }
    return { ...(linked as any), team: teamData };
  }

  // 3. No hay pre-registro → crear nuevo (flujo original)
  const { data, error: insertErr } = await supabase
    .from('TBL_Users')
    .insert({
      User_EntraID:    p.entraId,
      User_Name:       p.name.slice(0, 150),
      User_Email:      normalizedEmail,
      User_Avatar_url: '',
      User_Role:       'member',
      Is_New:          true,
      User_Created_At: new Date().toISOString(),
    })
    .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active"')
    .single();
  if (insertErr) throw new Error(insertErr.message);
  return { ...(data as any), team: null };
}

case 'fetchMembersBySubTeams': {
  const { subTeamIds } = payload as { subTeamIds: number[] };
  if (!subTeamIds?.length) return [];
  
  const { data, error } = await supabase
    .from('TBL_Sub_Team_Members')
    .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
    .in('Sub_Team_Member_Sub_Team_ID', subTeamIds);
  
  if (error) throw new Error(error.message);
  
  const seen = new Set<number>();
  return (data as { user: Record<string, unknown> }[])
    .map((r) => r.user)
    .filter((u) => u && !seen.has(u['User_ID'] as number) && seen.add(u['User_ID'] as number));
}

case 'preRegisterUser': {
  const p = payload as {
    email:        string;
    role:         'admin' | 'member';
    departmentId: number | null;
    teamId:       number | null;
    isNew:        boolean;
  };

  const normalizedEmail = p.email.toLowerCase().trim();

  // Verificar que no exista ya (por email)
  const { data: existing } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Email')
    .ilike('User_Email', normalizedEmail)
    .maybeSingle();

  if (existing) throw new Error(`Ya existe un usuario con el correo ${normalizedEmail}`);

  const { data, error } = await supabase
    .from('TBL_Users')
    .insert({
      User_EntraID:    '',
      User_Name:       '',
      User_Email:      normalizedEmail,
      User_Avatar_url: '',
      User_Role:       p.role,
      Department_ID:   p.departmentId,
      Team_ID:         p.teamId,
      Is_New:          p.isNew,
      User_Created_At: new Date().toISOString(),
    })
    .select(`
      User_ID, User_Name, User_Email, User_Role,
      Department_ID, Team_ID, Is_New,
      department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
      team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
    `)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

    case 'completeOnboarding': {
      const p = payload as { userId: number; departmentId: number; teamId: number };
      const { data, error } = await supabase
        .from('TBL_Users')
        .update({ Department_ID: p.departmentId, Team_ID: p.teamId, Is_New: false })
        .eq('User_ID', p.userId)
        .select(`User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New,
                 team:TBL_Teams!Team_ID ( Team_Code, Team_Name )`)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateUser': {
      const p = payload as {
        userId: number; role: 'admin' | 'member';
        departmentId: number | null; teamId: number | null; isNew: boolean;
      };
      const { data, error } = await supabase
        .from('TBL_Users')
        .update({
          User_Role:     p.role,
          Department_ID: p.departmentId,
          Team_ID:       p.teamId,
          Is_New:        p.isNew,
        })
        .eq('User_ID', p.userId)
        .select(`
          User_ID, User_Name, User_Email, User_Role,
          Department_ID, Team_ID, Is_New,
          department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
          team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
        `)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'getDepartments': {
      const { data, error } = await supabase
        .from('TBL_Departments').select('Department_ID, Department_Name, Department_Code')
        .order('Department_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'getTeamsByDepartment': {
      const p = payload as { departmentId: number };
      const { data, error } = await supabase
        .from('TBL_Teams').select('Team_ID, Team_Name, Team_Code, Department_ID')
        .eq('Department_ID', p.departmentId).order('Team_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    // ── Equipos de board ────────────────────────────────────────

    case 'fetchAllTeams': {
      const { data, error } = await supabase
        .from('TBL_Board_Teams').select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color');
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchTeamsByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Teams').select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color')
        .eq('Board_Team_ID', boardId);
      if (error) throw new Error(error.message);
      return data;
    }

    // ── Columnas ────────────────────────────────────────────────

    case 'fetchBoardColumns': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Columns').select('Board_Column_ID, Board_Column_Name')
        .eq('Board_Column_Board_ID', boardId).order('Board_Column_Position', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    // ── Labels ──────────────────────────────────────────────────

    case 'fetchLabelsByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon, Label_Team_ID')
        .eq('Label_Board_ID', boardId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchLabelsByTeamId': {
      const { boardId, teamId } = payload as { boardId: number; teamId: number };
      const { data, error } = await supabase
        .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon')
        .eq('Label_Board_ID', boardId).eq('Label_Team_ID', teamId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createLabel': {
      const { boardId, teamId, name, color, icon } = payload as {
        boardId: number; teamId: number; name: string; color: string; icon: string;
      };
      const { data, error } = await supabase
        .from('TBL_Labels')
        .insert({ Label_Board_ID: boardId, Label_Team_ID: teamId, Label_Name: name, Label_Color: color, Label_Icon: icon })
        .select('Label_ID, Label_Name, Label_Color, Label_Icon').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateLabel': {
      const { id, name, color, icon } = payload as { id: number; name: string; color: string; icon: string };
      const { error } = await supabase
        .from('TBL_Labels').update({ Label_Name: name, Label_Color: color, Label_Icon: icon }).eq('Label_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteLabel': {
      const { id } = payload as { id: number };
      await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Label_ID', id);
      const { error } = await supabase.from('TBL_Labels').delete().eq('Label_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Templates ───────────────────────────────────────────────

    case 'fetchTemplatesByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests_Templates')
        .select(`
          Request_Template_ID, Request_Template_Name, Request_Template_Description,
          Request_Template_Icon, Request_Template_Color, Request_Template_Badge,
          Request_Template_Form_Schema, Request_Template_Teams, Request_Template_Is_Active
        `)
        .eq('Request_Template_Board_ID', boardId)
        .order('Request_Template_ID', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createTemplate': {
      const p = payload as {
        boardId: number; name: string; description: string; icon: string; color: string;
        badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
      };
      const { data, error } = await supabase
        .from('TBL_Requests_Templates')
        .insert({
          Request_Template_Board_ID:    p.boardId,
          Request_Template_Name:        p.name,
          Request_Template_Description: p.description,
          Request_Template_Icon:        p.icon,
          Request_Template_Color:       p.color,
          Request_Template_Badge:       p.badge,
          Request_Template_Form_Schema: p.formSchema,
          Request_Template_Teams:       p.teamIds,
          Request_Template_Is_Active:   p.isActive,
          Request_Template_Created_At:  new Date().toISOString(),
        })
        .select(`
          Request_Template_ID, Request_Template_Name, Request_Template_Description,
          Request_Template_Icon, Request_Template_Color, Request_Template_Badge,
          Request_Template_Form_Schema, Request_Template_Teams, Request_Template_Is_Active
        `)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateTemplate': {
      const { id, ...p } = payload as {
        id: number; name: string; description: string; icon: string; color: string;
        badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
      };
      const { error } = await supabase.from('TBL_Requests_Templates').update({
        Request_Template_Name:        p.name,
        Request_Template_Description: p.description,
        Request_Template_Icon:        p.icon,
        Request_Template_Color:       p.color,
        Request_Template_Badge:       p.badge,
        Request_Template_Form_Schema: p.formSchema,
        Request_Template_Teams:       p.teamIds,
        Request_Template_Is_Active:   p.isActive,
      }).eq('Request_Template_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteTemplate': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Requests_Templates').delete().eq('Request_Template_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Sub-equipos ─────────────────────────────────────────────

    case 'fetchSubTeamsByTeamId': {
      const { teamId } = payload as { teamId: number };
      const { data, error } = await supabase
        .from('TBL_Sub_Teams').select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color')
        .eq('Sub_Team_Team_ID', teamId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createSubTeam': {
      const { teamId, name, color } = payload as { teamId: number; name: string; color: string };
      const { data, error } = await supabase
        .from('TBL_Sub_Teams')
        .insert({ Sub_Team_Team_ID: teamId, Sub_Team_Name: name, Sub_Team_Color: color })
        .select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateSubTeam': {
      const { id, name, color } = payload as { id: number; name: string; color: string };
      const { error } = await supabase
        .from('TBL_Sub_Teams').update({ Sub_Team_Name: name, Sub_Team_Color: color }).eq('Sub_Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteSubTeam': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Sub_Teams').delete().eq('Sub_Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'fetchSubTeamMembers': {
      const { subTeamId } = payload as { subTeamId: number };
      const { data, error } = await supabase
        .from('TBL_Sub_Team_Members')
        .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
        .eq('Sub_Team_Member_Sub_Team_ID', subTeamId);
      if (error) throw new Error(error.message);
      return (data as { user: Record<string, unknown> }[]).map((r) => r.user);
    }

    case 'addSubTeamMember': {
      const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
      const { error } = await supabase.from('TBL_Sub_Team_Members').upsert(
        { Sub_Team_Member_Sub_Team_ID: subTeamId, Sub_Team_Member_User_ID: userId },
        { onConflict: 'Sub_Team_Member_Sub_Team_ID,Sub_Team_Member_User_ID' },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'removeSubTeamMember': {
      const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
      const { error } = await supabase.from('TBL_Sub_Team_Members')
        .delete().eq('Sub_Team_Member_Sub_Team_ID', subTeamId).eq('Sub_Team_Member_User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Sprints ─────────────────────────────────────────────────

    case 'fetchSprints': {
      const { data, error } = await supabase
        .from('TBL_Sprint').select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date')
        .order('Sprint_Start_Date', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createSprint': {
      const { text, startDate, endDate } = payload as { text: string; startDate: string; endDate: string };
      const { data, error } = await supabase
        .from('TBL_Sprint')
        .insert({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate })
        .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateSprint': {
      const { id, text, startDate, endDate } = payload as { id: number; text: string; startDate: string; endDate: string };
      const { error } = await supabase
        .from('TBL_Sprint').update({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate }).eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteSprint': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Sprint').delete().eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Assignments ─────────────────────────────────────────────

case 'assignRequest': {
  const { requestId, userId, assignedBy } = payload as {
    requestId: string; userId: number; assignedBy?: number;
  };
  await supabase.from('TBL_Requests_Assignments')
    .delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
  const { error } = await supabase.from('TBL_Requests_Assignments').insert({
    Request_Assignment_ID:      requestId,
    Request_Assignment_User_ID: userId,
    Request_Assignment_At:      new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  if (assignedBy && userId !== assignedBy) {
    // Verificar si ya existe una notificación de asignación no leída para este ticket+usuario
    const { data: existing } = await supabase
      .from('TBL_Notifications')
      .select('Notification_ID')
      .eq('Notification_User_ID', userId)
      .eq('Notification_Type', 'assignment')
      .eq('Notification_Request_ID', requestId)
      .eq('Notification_Is_Read', false)
      .limit(1);

    if (!existing || existing.length === 0) {
      await insertNotifications(supabase, {
        userIds:   [userId],
        type:      'assignment',
        title:     `Te asignaron el ticket ${requestId}`,
        body:      `Fuiste asignado al ticket ${requestId}.`,
        requestId: requestId,
        actorId:   assignedBy,
      });
    }
  }
// Email
  const { data: reqDataAssign } = await supabase
    .from('TBL_Requests')
    .select('Request_Title')
    .eq('Request_ID', requestId)
    .single();
  await sendEventEmail(supabase, {
    eventKey:  'assignRequest',
    requestId: requestId,
    userIds:   [userId],
    vars: {
      ticket_id:     requestId,
      ticket_title:  (reqDataAssign as any)?.Request_Title ?? '',
      ticket_url:    `${Deno.env.get('APP_URL') ?? ''}/ticket/${requestId}`,
      assignee_name: '',
      actor_name:    '',
    },
  });
  return { ok: true };
}

    case 'unassignRequest': {
      const { requestId, userId } = payload as { requestId: string; userId: number };
      const { error } = await supabase.from('TBL_Requests_Assignments')
        .delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Comentarios ─────────────────────────────────────────────

    case 'fetchComments': {
      const { requestId } = payload as { requestId: string };
      const { data, error } = await supabase
        .from('TBL_Comments')
        .select(`Comment_ID, Comment_Text, Comment_Created_At,
                 author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
        .eq('Comment_Request_ID', requestId).order('Comment_Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createComment': {
      const { requestId, userId, text } = payload as { requestId: string; userId: number; text: string };
      const { data, error } = await supabase
        .from('TBL_Comments')
        .insert({
          Comment_Request_ID: requestId,
          Comment_User_ID:    userId,
          Comment_Text:       text.trim(),
          Comment_Created_At: new Date().toISOString(),
        })
        .select(`Comment_ID, Comment_Text, Comment_Created_At,
                 author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
        .single();
      if (error) throw new Error(error.message);

      const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, requestId);
      const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
        .filter((uid) => uid !== userId);
      if (recipientIds.length > 0) {
        const preview = text.trim().slice(0, 80) + (text.trim().length > 80 ? '…' : '');
        await insertNotifications(supabase, {
          userIds:   recipientIds,
          type:      'comment',
          title:     `Nuevo comentario en ${requestId}`,
          body:      preview,
          requestId: requestId,
          actorId:   userId,
        });
      }
      // Email
      const { data: reqDataComment } = await supabase
        .from('TBL_Requests')
        .select('Request_Title')
        .eq('Request_ID', requestId)
        .single();
      await sendEventEmail(supabase, {
        eventKey:  'createComment',
        requestId: requestId,
        userIds:   recipientIds,
        vars: {
          ticket_id:       requestId,
          ticket_title:    (reqDataComment as any)?.Request_Title ?? '',
          ticket_url:      `${Deno.env.get('APP_URL') ?? ''}/ticket/${requestId}`,
          actor_name:      '',
          comment_preview: text.trim().slice(0, 120),
        },
      });
      return data;
    }

    case 'deleteComment': {
      const { commentId } = payload as { commentId: number };
      const { error } = await supabase.from('TBL_Comments').delete().eq('Comment_ID', commentId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Attachments ─────────────────────────────────────────────

    case 'fetchAttachments': {
      const { requestId } = payload as { requestId: string };
      const { data, error } = await supabase
        .from('TBL_Attachments')
        .select(`Attachment_ID, Attachment_File_Name, Attachment_File_url,
                 Attachment_File_Size, Attachment_Mime_Type, Attachment_Created_At,
                 uploader:TBL_Users!Attachment_Uploaded_By ( User_ID, User_Name )`)
        .eq('Attachment_Request_ID', requestId)
        .order('Attachment_Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      const results = await Promise.all(
        (data as any[]).map(async (a) => {
          const storagePath = extractStoragePath(a.Attachment_File_url as string);
          const { data: signedData, error: signErr } = await supabase.storage
            .from('attachments')
            .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);
          return {
            Attachment_ID:         a.Attachment_ID,
            Attachment_Name:       a.Attachment_File_Name,
            Attachment_Url:        signErr ? null : signedData?.signedUrl ?? null,
            Attachment_Size:       a.Attachment_File_Size,
            Attachment_Mime_Type:  a.Attachment_Mime_Type,
            Attachment_Created_At: a.Attachment_Created_At,
            uploader:              a.uploader,
          };
        })
      );
      return results;
    }

    case 'uploadAttachment': {
      const p = payload as {
        requestId: string; userId: number; fileName: string;
        mimeType: string; sizeBytes: number; base64: string;
      };
      const bucket   = 'attachments';
      const filePath = `requests/${p.requestId}/${Date.now()}_${p.fileName}`;
      const bytes    = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
      const { error: uploadErr } = await supabase.storage
        .from(bucket).upload(filePath, bytes, { contentType: p.mimeType, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data, error: insertErr } = await supabase
        .from('TBL_Attachments')
        .insert({
          Attachment_Request_ID:  p.requestId,
          Attachment_Uploaded_By: p.userId,
          Attachment_File_Name:   p.fileName,
          Attachment_File_url:    filePath,
          Attachment_File_Size:   p.sizeBytes,
          Attachment_Mime_Type:   p.mimeType,
          Attachment_Created_At:  new Date().toISOString(),
        })
        .select(`Attachment_ID, Attachment_File_Name, Attachment_File_url,
                 Attachment_File_Size, Attachment_Mime_Type, Attachment_Created_At,
                 uploader:TBL_Users!Attachment_Uploaded_By ( User_ID, User_Name )`)
        .single();
      if (insertErr) throw new Error(insertErr.message);
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket).createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);
      if (signErr) throw new Error(signErr.message);
      return {
        Attachment_ID:         (data as any).Attachment_ID,
        Attachment_Name:       (data as any).Attachment_File_Name,
        Attachment_Url:        signedData.signedUrl,
        Attachment_Size:       (data as any).Attachment_File_Size,
        Attachment_Mime_Type:  (data as any).Attachment_Mime_Type,
        Attachment_Created_At: (data as any).Attachment_Created_At,
        uploader:              (data as any).uploader,
      };
    }

    // ── Notificaciones ───────────────────────────────────────────

    case 'getNotifications': {
      const { userId, limit = 40 } = payload as { userId: number; limit?: number };
      const { data, error } = await supabase
        .from('TBL_Notifications')
        .select(`
          Notification_ID, Notification_Type, Notification_Title,
          Notification_Body, Notification_Request_ID,
          Notification_Is_Read, Notification_Created_At,
          actor:TBL_Users!Notification_Actor_ID (
            User_ID, User_Name, User_Avatar_url
          )
        `)
        .eq('Notification_User_ID', userId)
        .order('Notification_Created_At', { ascending: false })
        .limit(limit as number);
      if (error) throw new Error(error.message);
      const unreadCount = (data as any[]).filter((n) => !n.Notification_Is_Read).length;
      return { notifications: data, unreadCount };
    }

    case 'markNotificationRead': {
      const { notificationId, userId } = payload as { notificationId: number; userId: number };
      const { error } = await supabase
        .from('TBL_Notifications')
        .update({ Notification_Is_Read: true })
        .eq('Notification_ID', notificationId)
        .eq('Notification_User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'markAllNotificationsRead': {
      const { userId } = payload as { userId: number };
      const { error } = await supabase
        .from('TBL_Notifications')
        .update({ Notification_Is_Read: true })
        .eq('Notification_User_ID', userId)
        .eq('Notification_Is_Read', false);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'fetchByAssignedTo': {
      const { userId, boardId } = payload as { userId: number; boardId: number };
      const { data: links, error: linksErr } = await supabase
        .from('TBL_Requests_Assignments')
        .select('Request_Assignment_ID')
        .eq('Request_Assignment_User_ID', userId);
      if (linksErr) throw new Error(linksErr.message);
      const ids = (links as { Request_Assignment_ID: string }[]).map((l) => l.Request_Assignment_ID);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .in('Request_ID', ids).eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
    }

    // ── Email Templates ─────────────────────────────────────────

case 'fetchEmailTemplates': {
  const { boardId } = payload as { boardId: number };
  const { data, error } = await supabase
    .from('TBL_Email_Templates')
    .select(`
      Email_Template_ID,
      Email_Template_Name,
      Email_Template_Subject,
      Email_Template_Body_html,
      Email_Template_Body_Text,
      Email_Template_Event_Key,
Email_Template_Is_Active,
      Email_Template_Variables,
      Email_Template_Updated_At
    `)
    .eq('Email_Template_Board_ID', boardId)
    .order('Email_Template_ID', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

case 'updateEmailTemplate': {
  const p = payload as {
    id:      number;
    subject: string;
    html:    string;
    text:    string;
  };
  const { error } = await supabase
    .from('TBL_Email_Templates')
    .update({
      Email_Template_Subject:     p.subject,
      Email_Template_Body_html:   p.html,
      Email_Template_Body_Text:   p.text,
      Email_Template_Updated_At:  new Date().toISOString(),
    })
    .eq('Email_Template_ID', p.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

case 'toggleEmailTemplate': {
  const { id, isActive } = payload as { id: number; isActive: boolean };
  const { error } = await supabase
    .from('TBL_Email_Templates')
    .update({ Email_Template_Is_Active: isActive })
    .eq('Email_Template_ID', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

case 'createEmailTemplate': {
  const p = payload as {
    boardId:   number;
    name:      string;
    eventKey:  string;
    subject:   string;
    variables: string[];
  };

  // Verificar que el event_key no exista ya
  const { data: existing } = await supabase
    .from('TBL_Email_Templates')
    .select('Email_Template_ID')
    .eq('Email_Template_Event_Key', p.eventKey)
    .maybeSingle();
  if (existing) throw new Error(`Ya existe un template con el event key "${p.eventKey}"`);

  const { data, error } = await supabase
    .from('TBL_Email_Templates')
    .insert({
      Email_Template_Board_ID:   p.boardId,
      Email_Template_Name:       p.name,
      Email_Template_Subject:    p.subject,
      Email_Template_Body_html:  '',
      Email_Template_Body_Text:  '',
      Email_Template_Event_Key:  p.eventKey,
      Email_Template_Is_Active:  true,
      Email_Template_Variables:  p.variables,
      Email_Template_Created_At: new Date().toISOString(),
      Email_Template_Updated_At: new Date().toISOString(),
    })
    .select(`
      Email_Template_ID, Email_Template_Name, Email_Template_Subject,
      Email_Template_Body_html, Email_Template_Body_Text,
      Email_Template_Event_Key, Email_Template_Is_Active,
      Email_Template_Variables, Email_Template_Updated_At
    `)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

case 'deleteEmailTemplate': {
  const { id } = payload as { id: number };
  const { error } = await supabase
    .from('TBL_Email_Templates')
    .delete()
    .eq('Email_Template_ID', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

case 'updateEmailTemplateMetadata': {
  const p = payload as {
    id:        number;
    name:      string;
    subject:   string;
    variables: string[];
  };
  const { error } = await supabase
    .from('TBL_Email_Templates')
    .update({
      Email_Template_Name:      p.name,
      Email_Template_Subject:   p.subject,
      Email_Template_Variables: p.variables,
      Email_Template_Updated_At: new Date().toISOString(),
    })
    .eq('Email_Template_ID', p.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

  case 'deactivateUser': {
      const { userId } = payload as { userId: number };
      const { error } = await supabase
        .from('TBL_Users')
        .update({ "Is_Active": false })
        .eq('User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'reactivateUser': {
      const { userId } = payload as { userId: number };
      const { error } = await supabase
        .from('TBL_Users')
        .update({ "Is_Active": true })
        .eq('User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    default:
      throw new Error(`[API] Acción desconocida: ${action}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return errorResponse('Método no permitido', 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return errorResponse('Token de autorización requerido', 401);

  try { await verifyAzureToken(token); } catch (err) {
    console.error('[API] auth error:', (err as Error).message);
    return errorResponse(`No autorizado: ${(err as Error).message}`, 401);
  }

  let body: { action: string; payload: Record<string, unknown> };
  try { body = await req.json(); } catch { return errorResponse('Body inválido', 400); }
  if (!body.action) return errorResponse('Campo "action" requerido', 400);

  const supabase = createServiceClient();
  try {
    const result = await handleAction(body.action, body.payload ?? {}, supabase);
    return corsResponse({ data: result });
  } catch (err) {
    console.error('[API] Error en acción:', body.action, err);
    return errorResponse((err as Error).message, 500);
  }
});