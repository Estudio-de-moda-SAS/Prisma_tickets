// supabase/functions/api/index.ts
// @ts-ignore
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TENANT_ID    = Deno.env.get('AZURE_TENANT_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function verifyAzureToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('[API] Formato de token inválido');
  const payload = JSON.parse(
    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
  ) as Record<string, unknown>;
  if (payload['tid'] !== TENANT_ID)
    throw new Error('[API] Token de tenant no autorizado: ' + payload['tid']);
  const iss = String(payload['iss'] ?? '');
  if (!iss.includes(TENANT_ID))
    throw new Error('[API] Issuer no autorizado: ' + iss);
  if ((payload['exp'] as number) < Math.floor(Date.now() / 1000))
    throw new Error('[API] Token expirado');
  return payload;
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

/* ============================================================
   Query base — sin crm_extra
   ============================================================ */
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
  Request_Deadline,
  Request_Time_Consumed,
  Request_Finished_At,
  requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url
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
  child_count:TBL_Requests!Request_Parent_ID ( count )
`.trim();

/* ============================================================
   Router
   ============================================================ */
async function handleAction(
  action: string,
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<unknown> {
  switch (action) {

    // ── Solicitudes ──────────────────────────────────────────

    case 'fetchAllByBoard': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
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
      const ids = (links as { Request_Team_Request_ID: number }[]).map((l) => l.Request_Team_Request_ID);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .in('Request_ID', ids).eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchByRequestedBy': {
      const { userId, boardId } = payload as { userId: number; boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Requested_By', userId).eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
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
      const { id } = payload as { id: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createRequest': {
      const p = payload as {
        boardId: number; columnId: number; requestedBy: number;
        templateId: number; titulo: string; descripcion: string;
        score: number; equipoIds: number[]; labelIds: number[];
        sprintId: number | null; deadline: string | null; parentId: number | null;
      };
      const { data: inserted, error: insErr } = await supabase
        .from('TBL_Requests')
        .insert({
          Request_Board_ID:        p.boardId,
          Request_Board_Column_ID: p.columnId,
          Request_Requested_By:    p.requestedBy,
          Request_Template_ID:     p.templateId,
          Request_Title:           p.titulo,
          Request_Description:     p.descripcion,
          Request_Score:           p.score,
          Request_Progress:        0,
          Request_Created_At:      new Date().toISOString(),
          Request_Deadline:        p.deadline,
          Request_Parent_ID:       p.parentId ?? null,
        })
        .select('Request_ID').single();
      if (insErr) throw new Error(insErr.message);
      const newId = (inserted as { Request_ID: number }).Request_ID;
      const ops = [];
      if (p.equipoIds.length > 0)
        ops.push(supabase.from('TBL_Request_Team').insert(p.equipoIds.map((tid) => ({ Request_Team_Request_ID: newId, Request_Team_ID: tid }))));
      if (p.labelIds.length > 0)
        ops.push(supabase.from('TBL_Request_Labels').insert(p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid }))));
      if (p.sprintId !== null)
        ops.push(supabase.from('TBL_Request_Sprint').insert({ Request_Sprint_Request_ID: newId, Request_Sprint_ID: p.sprintId }));
      await Promise.all(ops);
      const { data, error } = await supabase.from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', newId).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'moveToColumn': {
      const { id, columnId } = payload as { id: number; columnId: number };
      const { error } = await supabase.from('TBL_Requests').update({ Request_Board_Column_ID: columnId }).eq('Request_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'updateRequest': {
      const { id, ...patch } = payload as {
        id: number; titulo?: string; descripcion?: string; score?: number;
        progreso?: number; deadline?: string | null;
        equipoIds?: number[]; labelIds?: number[]; sprintId?: number | null;
      };
      const scalarUpdate: Record<string, unknown> = {};
      if (patch.titulo      !== undefined) scalarUpdate['Request_Title']       = patch.titulo;
      if (patch.descripcion !== undefined) scalarUpdate['Request_Description'] = patch.descripcion;
      if (patch.score       !== undefined) scalarUpdate['Request_Score']       = patch.score;
      if (patch.progreso    !== undefined) scalarUpdate['Request_Progress']    = Math.min(100, Math.max(0, patch.progreso));
      if (patch.deadline    !== undefined) scalarUpdate['Request_Deadline']    = patch.deadline;
      if (Object.keys(scalarUpdate).length > 0) {
        const { error } = await supabase.from('TBL_Requests').update(scalarUpdate).eq('Request_ID', id);
        if (error) throw new Error(error.message);
      }
      if (patch.equipoIds !== undefined) {
        await supabase.from('TBL_Request_Team').delete().eq('Request_Team_Request_ID', id);
        if (patch.equipoIds.length > 0)
          await supabase.from('TBL_Request_Team').insert(patch.equipoIds.map((tid) => ({ Request_Team_Request_ID: id, Request_Team_ID: tid })));
      }
      if (patch.labelIds !== undefined) {
        await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Request_ID', id);
        if (patch.labelIds.length > 0)
          await supabase.from('TBL_Request_Labels').insert(patch.labelIds.map((lid) => ({ Request_Labels_Request_ID: id, Request_Labels_Label_ID: lid })));
      }
      if (patch.sprintId !== undefined) {
        await supabase.from('TBL_Request_Sprint').delete().eq('Request_Sprint_Request_ID', id);
        if (patch.sprintId !== null)
          await supabase.from('TBL_Request_Sprint').insert({ Request_Sprint_Request_ID: id, Request_Sprint_ID: patch.sprintId });
      }
      return { ok: true };
    }

    case 'deleteRequest': {
      const { id } = payload as { id: number };
      await Promise.all([
        supabase.from('TBL_Request_Team').delete().eq('Request_Team_Request_ID', id),
        supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Request_ID', id),
        supabase.from('TBL_Request_Sprint').delete().eq('Request_Sprint_Request_ID', id),
        supabase.from('TBL_Requests_Assignments').delete().eq('Request_Assignment_ID', id),
      ]);
      const { error } = await supabase.from('TBL_Requests').delete().eq('Request_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Usuarios ─────────────────────────────────────────────

    case 'upsertUserByEntraId': {
      const p = payload as { entraId: string; name: string; email: string };
      const { data: existing, error: findErr } = await supabase
        .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
        .eq('User_EntraID', p.entraId).maybeSingle();
      if (findErr) throw new Error(findErr.message);
      if (existing) return existing;
      const { data, error: insertErr } = await supabase
        .from('TBL_Users')
        .insert({ User_EntraID: p.entraId, User_Name: p.name.slice(0, 150), User_Email: p.email.slice(0, 150), User_Avatar_url: '', User_Role: 'member', User_Created_At: new Date().toISOString() })
        .select('User_ID, User_Name, User_Email, User_Role').single();
      if (insertErr) throw new Error(insertErr.message);
      return data;
    }

    case 'fetchUserByEntraId': {
      const { entraId } = payload as { entraId: string };
      const { data, error } = await supabase
        .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
        .eq('User_EntraID', entraId).single();
      if (error) throw new Error(error.message);
      return data;
    }

    // ── Equipos ──────────────────────────────────────────────

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

    // ── Columnas ─────────────────────────────────────────────

    case 'fetchBoardColumns': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Columns').select('Board_Column_ID, Board_Column_Name')
        .eq('Board_Column_Board_ID', boardId).order('Board_Column_Position', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    // ── Labels ───────────────────────────────────────────────

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
      const { boardId, teamId, name, color, icon } = payload as { boardId: number; teamId: number; name: string; color: string; icon: string };
      const { data, error } = await supabase
        .from('TBL_Labels')
        .insert({ Label_Board_ID: boardId, Label_Team_ID: teamId, Label_Name: name, Label_Color: color, Label_Icon: icon })
        .select('Label_ID, Label_Name, Label_Color, Label_Icon').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateLabel': {
      const { id, name, color, icon } = payload as { id: number; name: string; color: string; icon: string };
      const { error } = await supabase.from('TBL_Labels').update({ Label_Name: name, Label_Color: color, Label_Icon: icon }).eq('Label_ID', id);
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

    // ── Templates ────────────────────────────────────────────

    case 'fetchTemplatesByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests_Templates')
        .select(`
          Request_Template_ID,
          Request_Template_Name,
          Request_Template_Description,
          Request_Template_Icon,
          Request_Template_Color,
          Request_Template_Badge,
          Request_Template_Form_Schema,
          Request_Template_Teams,
          Request_Template_Is_Active
        `)
        .eq('Request_Template_Board_ID', boardId)
        .order('Request_Template_ID', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createTemplate': {
      const p = payload as {
        boardId: number; name: string; description: string;
        icon: string; color: string; badge: string;
        formSchema: unknown[]; teamIds: number[]; isActive: boolean;
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
          Request_Template_ID,
          Request_Template_Name,
          Request_Template_Description,
          Request_Template_Icon,
          Request_Template_Color,
          Request_Template_Badge,
          Request_Template_Form_Schema,
          Request_Template_Teams,
          Request_Template_Is_Active
        `)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateTemplate': {
      const { id, ...p } = payload as {
        id: number; name: string; description: string;
        icon: string; color: string; badge: string;
        formSchema: unknown[]; teamIds: number[]; isActive: boolean;
      };
      const { error } = await supabase
        .from('TBL_Requests_Templates')
        .update({
          Request_Template_Name:        p.name,
          Request_Template_Description: p.description,
          Request_Template_Icon:        p.icon,
          Request_Template_Color:       p.color,
          Request_Template_Badge:       p.badge,
          Request_Template_Form_Schema: p.formSchema,
          Request_Template_Teams:       p.teamIds,
          Request_Template_Is_Active:   p.isActive,
        })
        .eq('Request_Template_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteTemplate': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Requests_Templates').delete().eq('Request_Template_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Sub-equipos ──────────────────────────────────────────

    case 'fetchSubTeamsByTeamId': {
      const { teamId } = payload as { teamId: number };
      const { data, error } = await supabase
        .from('TBL_Sub_Teams').select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color').eq('Sub_Team_Team_ID', teamId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createSubTeam': {
      const { teamId, name, color } = payload as { teamId: number; name: string; color: string };
      const { data, error } = await supabase
        .from('TBL_Sub_Teams').insert({ Sub_Team_Team_ID: teamId, Sub_Team_Name: name, Sub_Team_Color: color })
        .select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateSubTeam': {
      const { id, name, color } = payload as { id: number; name: string; color: string };
      const { error } = await supabase.from('TBL_Sub_Teams').update({ Sub_Team_Name: name, Sub_Team_Color: color }).eq('Sub_Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteSubTeam': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Sub_Teams').delete().eq('Sub_Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'updateRequestSubTeams': {
      const { id, subTeamIds } = payload as { id: number; subTeamIds: number[] };
      await supabase.from('TBL_Request_Sub_Team').delete().eq('Request_Sub_Team_Request_ID', id);
      if (subTeamIds.length > 0) {
        const { error } = await supabase.from('TBL_Request_Sub_Team').insert(
          subTeamIds.map((sid) => ({ Request_Sub_Team_Request_ID: id, Request_Sub_Team_ID: sid }))
        );
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }

    case 'fetchSubTeamMembers': {
      const { subTeamId } = payload as { subTeamId: number };
      const { data, error } = await supabase
        .from('TBL_Sub_Team_Members')
        .select(`
          user:TBL_Users!Sub_Team_Member_User_ID (
            User_ID, User_Name, User_Email, User_Avatar_url, User_Role
          )
        `)
        .eq('Sub_Team_Member_Sub_Team_ID', subTeamId);
      if (error) throw new Error(error.message);
      // aplanamos el join para devolver un array plano de AppUser
      return (data as { user: Record<string, unknown> }[]).map((r) => r.user);
    }

    case 'addSubTeamMember': {
      const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
      // upsert para evitar duplicados si ya estaba
      const { error } = await supabase
        .from('TBL_Sub_Team_Members')
        .upsert(
          { Sub_Team_Member_Sub_Team_ID: subTeamId, Sub_Team_Member_User_ID: userId },
          { onConflict: 'Sub_Team_Member_Sub_Team_ID,Sub_Team_Member_User_ID' },
        );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'removeSubTeamMember': {
      const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
      const { error } = await supabase
        .from('TBL_Sub_Team_Members')
        .delete()
        .eq('Sub_Team_Member_Sub_Team_ID', subTeamId)
        .eq('Sub_Team_Member_User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Sprints ──────────────────────────────────────────────

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
        .from('TBL_Sprint').insert({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate })
        .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date').single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateSprint': {
      const { id, text, startDate, endDate } = payload as { id: number; text: string; startDate: string; endDate: string };
      const { error } = await supabase.from('TBL_Sprint').update({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate }).eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteSprint': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Sprint').delete().eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Usuarios (lista) ─────────────────────────────────────

    case 'fetchAllUsers': {
      const { data, error } = await supabase
        .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Avatar_url, User_Role')
        .order('User_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'assignRequest': {
      const { requestId, userId } = payload as { requestId: number; userId: number };
      await supabase.from('TBL_Requests_Assignments').delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
      const { error } = await supabase.from('TBL_Requests_Assignments').insert({ Request_Assignment_ID: requestId, Request_Assignment_User_ID: userId, Request_Assignment_At: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'unassignRequest': {
      const { requestId, userId } = payload as { requestId: number; userId: number };
      const { error } = await supabase.from('TBL_Requests_Assignments').delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Comentarios ──────────────────────────────────────────

    case 'fetchComments': {
      const { requestId } = payload as { requestId: number };
      const { data, error } = await supabase
        .from('TBL_Comments')
        .select(`Comment_ID, Comment_Text, Comment_Created_At, author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
        .eq('Comment_Request_ID', requestId).order('Comment_Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createComment': {
      const { requestId, userId, text } = payload as { requestId: number; userId: number; text: string };
      const { data, error } = await supabase
        .from('TBL_Comments')
        .insert({ Comment_Request_ID: requestId, Comment_User_ID: userId, Comment_Text: text.trim(), Comment_Created_At: new Date().toISOString() })
        .select(`Comment_ID, Comment_Text, Comment_Created_At, author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'deleteComment': {
      const { commentId } = payload as { commentId: number };
      const { error } = await supabase.from('TBL_Comments').delete().eq('Comment_ID', commentId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Sub-requests ─────────────────────────────────────────

    case 'fetchChildRequests': {
      const { parentId } = payload as { parentId: number };
      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT)
        .eq('Request_Parent_ID', parentId).order('Request_Created_At', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }

    default:
      throw new Error(`[API] Acción desconocida: ${action}`);
  }
}

/* ============================================================
   Handler principal
   ============================================================ */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('Método no permitido', 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return errorResponse('Token de autorización requerido', 401);

  try {
    await verifyAzureToken(token);
  } catch (err) {
    return errorResponse(`No autorizado: ${(err as Error).message}`, 401);
  }

  let body: { action: string; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Body inválido', 400);
  }

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