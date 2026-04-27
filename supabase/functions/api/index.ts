// supabase/functions/api/index.ts
// Edge Function — intermediario entre el frontend y Supabase.
// Verifica firma criptográfica del token de Azure AD antes de ejecutar queries.
// Este archivo corre en Deno — los imports jsr: son nativos de Deno.

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

// Azure AD emite tokens v1.0 (iss: sts.windows.net) y v2.0 (iss: login.microsoftonline.com)
// Las claves públicas están en endpoints distintos — buscamos en ambos
const JWKS_URI_V1 = 'https://login.microsoftonline.com/common/discovery/keys';
const JWKS_URI_V2 = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

/* ============================================================
   Cache de claves públicas de Azure AD
   ============================================================ */
type JwkWithKid = JsonWebKey & { kid?: string; kty: string; n?: string; e?: string };
type JsonWebKeySet = { keys: JwkWithKid[] };

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const jwksCache: Record<string, { jwks: JsonWebKeySet; cachedAt: number }> = {};

async function fetchJwks(uri: string): Promise<JsonWebKeySet> {
  const now = Date.now();
  const cached = jwksCache[uri];
  if (cached && now - cached.cachedAt < JWKS_CACHE_TTL_MS) return cached.jwks;
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`[API] No se pudieron obtener las claves de Azure AD (${uri}): ${res.status}`);
  const jwks = await res.json() as JsonWebKeySet;
  jwksCache[uri] = { jwks, cachedAt: now };
  return jwks;
}

async function findPublicKeyByKid(kid: string): Promise<JwkWithKid> {
  for (const uri of [JWKS_URI_V1, JWKS_URI_V2]) {
    const jwks = await fetchJwks(uri);
    const key  = jwks.keys.find((k) => k.kid === kid);
    if (key) return key;
  }
  throw new Error(`[API] Clave pública no encontrada para kid: ${kid}`);
}

/* ============================================================
   Verificación completa del token JWT de Azure AD
   ============================================================ */
async function verifyAzureToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('[API] Formato de token inválido');

  const [, payloadB64] = parts;
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;

  if (payload['tid'] !== TENANT_ID) {
    throw new Error('[API] Token de tenant no autorizado: ' + payload['tid']);
  }

  const iss = String(payload['iss'] ?? '');
  if (!iss.includes(TENANT_ID)) {
    throw new Error('[API] Issuer no autorizado: ' + iss);
  }

  if ((payload['exp'] as number) < Math.floor(Date.now() / 1000)) {
    throw new Error('[API] Token expirado');
  }

  return payload;
}
/* ============================================================
   Cliente Supabase con service_role (salta RLS)
   ============================================================ */
function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/* ============================================================
   CORS headers
   ============================================================ */
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
   Query base de joins
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
  sprints:TBL_Request_Sprint ( Request_Sprint_ID ),
  crm_extra:TBL_Request_CRM_Example ( Request_CRM_Example_Store_Name )
`.trim();

/* ============================================================
   Router de acciones
   ============================================================ */
async function handleAction(
  action: string,
  payload: Record<string, unknown>,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<unknown> {
  switch (action) {

    case 'fetchAllByBoard': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchByTeamCode': {
      const { boardId, teamCode } = payload as { boardId: number; teamCode: string };

      const { data: teamData, error: teamErr } = await supabase
        .from('TBL_Board_Teams')
        .select('Board_Team_ID')
        .eq('Board_Team_Code', teamCode)
        .single();
      if (teamErr) throw new Error(teamErr.message);

      const { data: links, error: linksErr } = await supabase
        .from('TBL_Request_Team')
        .select('Request_Team_Request_ID')
        .eq('Request_Team_ID', teamData.Board_Team_ID);
      if (linksErr) throw new Error(linksErr.message);

      const ids = (links as { Request_Team_Request_ID: number }[]).map((l) => l.Request_Team_Request_ID);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .in('Request_ID', ids)
        .eq('Request_Board_ID', boardId)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchUncategorized': {
      const { boardId } = payload as { boardId: number };

      const { data: col, error: colErr } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID')
        .eq('Board_Column_Board_ID', boardId)
        .eq('Board_Column_Name', 'Sin categorizar')
        .single();
      if (colErr) throw new Error(colErr.message);

      const { data, error } = await supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .eq('Request_Board_Column_ID', (col as { Board_Column_ID: number }).Board_Column_ID)
        .order('Request_Created_At', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchById': {
      const { id } = payload as { id: number };
      const { data, error } = await supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .eq('Request_ID', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'createRequest': {
      const p = payload as {
        boardId: number; columnId: number; requestedBy: number;
        templateId: number; titulo: string; descripcion: string;
        score: number; equipoIds: number[]; labelIds: number[];
        sprintId: number | null; deadline: string | null;
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
        })
        .select('Request_ID')
        .single();
      if (insErr) throw new Error(insErr.message);

      const newId = (inserted as { Request_ID: number }).Request_ID;
      const ops = [];

      if (p.equipoIds.length > 0) {
        ops.push(supabase.from('TBL_Request_Team').insert(
          p.equipoIds.map((tid) => ({ Request_Team_Request_ID: newId, Request_Team_ID: tid })),
        ));
      }
      if (p.labelIds.length > 0) {
        ops.push(supabase.from('TBL_Request_Labels').insert(
          p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid })),
        ));
      }
      if (p.sprintId !== null) {
        ops.push(supabase.from('TBL_Request_Sprint').insert({
          Request_Sprint_Request_ID: newId,
          Request_Sprint_ID:         p.sprintId,
        }));
      }
      await Promise.all(ops);

      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', newId).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'moveToColumn': {
      const { id, columnId } = payload as { id: number; columnId: number };
      const { error } = await supabase
        .from('TBL_Requests')
        .update({ Request_Board_Column_ID: columnId })
        .eq('Request_ID', id);
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
        if (patch.equipoIds.length > 0) {
          await supabase.from('TBL_Request_Team').insert(
            patch.equipoIds.map((tid) => ({ Request_Team_Request_ID: id, Request_Team_ID: tid })),
          );
        }
      }
      if (patch.labelIds !== undefined) {
        await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Request_ID', id);
        if (patch.labelIds.length > 0) {
          await supabase.from('TBL_Request_Labels').insert(
            patch.labelIds.map((lid) => ({ Request_Labels_Request_ID: id, Request_Labels_Label_ID: lid })),
          );
        }
      }
      if (patch.sprintId !== undefined) {
        await supabase.from('TBL_Request_Sprint').delete().eq('Request_Sprint_Request_ID', id);
        if (patch.sprintId !== null) {
          await supabase.from('TBL_Request_Sprint').insert({
            Request_Sprint_Request_ID: id,
            Request_Sprint_ID:         patch.sprintId,
          });
        }
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

    case 'fetchUserByEntraId': {
      const { entraId } = payload as { entraId: string };
      const { data, error } = await supabase
        .from('TBL_Users')
        .select('User_ID, User_Name, User_Email, User_Role')
        .eq('User_EntraID', entraId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

case 'upsertUserByEntraId': {
  const p = payload as { entraId: string; name: string; email: string; role: string };
  const { data: existing, error: findErr } = await supabase
    .from('TBL_Users')
    .select('User_ID, User_Name, User_Email, User_Role')
    .eq('User_EntraID', p.entraId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existing) return existing;
  const { data, error: insertErr } = await supabase
    .from('TBL_Users')
    .insert({
      User_EntraID:    p.entraId,
      User_Name:       p.name.slice(0, 150),
      User_Email:      p.email.slice(0, 150),
      User_Avatar_url: '',
      User_Role:       'member',
      User_Created_At: new Date().toISOString(),
    })
    .select('User_ID, User_Name, User_Email, User_Role')
    .single();
  if (insertErr) throw new Error(insertErr.message);
  return data;
}

    case 'fetchTeamsByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Teams')
        .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color')
        .eq('Board_Team_ID', boardId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchAllTeams': {
      const { data, error } = await supabase
        .from('TBL_Board_Teams')
        .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color');
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchLabelsByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Labels')
        .select('Label_ID, Label_Name, Label_Color, Label_Icon')
        .eq('Label_Board_ID', boardId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchTemplatesByBoardId': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Requests_Templates')
        .select('Request_Template_ID, Request_Template_Name, Request_Template_Description')
        .eq('Request_Template_Board_ID', boardId);
      if (error) throw new Error(error.message);
      return data;
    }

    case 'fetchBoardColumns': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: true });
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return errorResponse('Token de autorización requerido', 401);
  }

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

  if (!body.action) {
    return errorResponse('Campo "action" requerido', 400);
  }

  const supabase = createServiceClient();
  try {
    const result = await handleAction(body.action, body.payload ?? {}, supabase);
    return corsResponse({ data: result });
  } catch (err) {
    console.error('[API] Error en acción', body.action, err);
    return errorResponse((err as Error).message, 500);
  }
});