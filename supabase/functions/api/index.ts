// @ts-ignore
import { verifyAzureToken, verifySupabaseToken } from './lib/auth.ts';
// @ts-ignore
import { createServiceClient } from './lib/supabase.ts';
// @ts-ignore
import { CORS_HEADERS, corsResponse, errorResponse } from './lib/https.ts';
// @ts-ignore
import { INTERNAL_JOB_SECRET } from './config.ts';
// @ts-ignore
import { createDispatch }      from './router.ts';
// @ts-ignore
import { getPublicAnnouncements }      from './handlers/announcements.ts';
// @ts-ignore
import { _processTemplateRenameChunk } from './jobs/renameJob.ts';
// @ts-ignore
import { _processExportChunks }        from './jobs/exportJob.ts';

/**
 * Punto de entrada HTTP de la Edge Function `api`.
 *
 * Registra el manejador de `Deno.serve` que enruta todas las peticiones según el
 * campo `action` del body. El orden de resolución es:
 *
 * 1. `OPTIONS` → responde el preflight CORS. Solo se aceptan `POST`.
 * 2. `get_public_announcements` → endpoint público (sin autenticación).
 * 3. `_processBackgroundJobChunk` / `_processExportJobChunk` → procesamiento
 *    interno de jobs; requieren la cabecera `X-Internal-Job-Secret` y se lanzan
 *    en segundo plano (`EdgeRuntime.waitUntil` cuando está disponible).
 * 4. Acciones de migración (`migrateRequest`, `upsertLabelByName`,
 *    `upsertSprintByName`, `migrationFetchUsers`) → también protegidas por el
 *    secreto interno, despachadas por el router.
 * 5. Resto de acciones → requieren token `Bearer` y se despachan por el router.
 *
 * @remarks
 * Durante la migración de MSAL a Supabase, la autenticación por defecto acepta
 * dos tipos de token: primero intenta validar como token de Azure AD (legacy) y,
 * si falla, como token de Supabase Auth. Solo si ambos fallan se responde 401.
 *
 * Todas las respuestas llevan cabeceras CORS ({@link corsResponse} /
 * {@link errorResponse}). Los errores de las acciones despachadas se registran y
 * se devuelven como 500.
 *
 * @module server
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return errorResponse('Método no permitido', 405);

  let body: { action: string; payload: Record<string, unknown> };
  try { body = await req.json(); } catch { return errorResponse('Body inválido', 400); }
  if (!body.action) return errorResponse('Campo "action" requerido', 400);

  // ── Endpoint público: no requiere autenticación ──
  if (body.action === 'get_public_announcements') {
    const supabase = createServiceClient();
    return corsResponse({ data: await getPublicAnnouncements(supabase) });
  }

  // ── Job interno: renombrado de campos de plantilla (self-invoke) ──
  if (body.action === '_processBackgroundJobChunk') {
    const internalSecret = req.headers.get('X-Internal-Job-Secret') ?? '';
    if (!INTERNAL_JOB_SECRET || internalSecret !== INTERNAL_JOB_SECRET)
      return errorResponse('No autorizado (internal)', 401);
    const supabase = createServiceClient();
    const { jobId } = (body.payload ?? {}) as { jobId: string };
    if (!jobId) return errorResponse('jobId requerido', 400);
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil)
      EdgeRuntime.waitUntil(_processTemplateRenameChunk(jobId, supabase));
    else
      _processTemplateRenameChunk(jobId, supabase).catch(() => {});
    return corsResponse({ data: { accepted: true } });
  }

  // ── Job interno: exportación por chunks (self-invoke) ──
  if (body.action === '_processExportJobChunk') {
    const internalSecret = req.headers.get('X-Internal-Job-Secret') ?? '';
    if (!INTERNAL_JOB_SECRET || internalSecret !== INTERNAL_JOB_SECRET)
      return errorResponse('No autorizado (internal)', 401);
    const supabase = createServiceClient();
    const { jobId } = (body.payload ?? {}) as { jobId: string };
    if (!jobId) return errorResponse('jobId requerido', 400);
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil)
      EdgeRuntime.waitUntil(_processExportChunks(jobId, supabase));
    else
      _processExportChunks(jobId, supabase).catch(() => {});
    return corsResponse({ data: { accepted: true } });
  }

  // ── Acciones de migración: protegidas por el secreto interno ──
if (body.action === 'migrateRequest'
   || body.action === 'upsertLabelByName'
   || body.action === 'upsertSprintByName'
   || body.action === 'migrationFetchUsers') {
    const internalSecret = req.headers.get('X-Internal-Job-Secret') ?? '';
    if (!INTERNAL_JOB_SECRET || internalSecret !== INTERNAL_JOB_SECRET)
      return errorResponse('No autorizado (internal)', 401);
    const supabase = createServiceClient();
    const dispatch = createDispatch(supabase);
    try {
      return corsResponse({ data: await dispatch(body.action, body.payload ?? {}) });
    } catch (err) {
      console.error('[API] Error en migración:', body.action, err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // ── Autenticación por token (camino por defecto) ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return errorResponse('Token de autorización requerido', 401);

  // Acepta ambos tokens durante la migración:
  //  1. [MSAL-LEGACY] token de Azure AD (usuarios actuales)
  //  2. token de Supabase Auth (camino nuevo)
  let authOk = false;
  let authError = '';

  try {
    await verifyAzureToken(token);   // [MSAL-LEGACY]
    authOk = true;
  } catch (azureErr) {
    authError = (azureErr as Error).message;
  }

  if (!authOk) {
    try {
      await verifySupabaseToken(token);
      authOk = true;
    } catch (sbErr) {
      authError = `${authError} | supabase: ${(sbErr as Error).message}`;
    }
  }

  if (!authOk) {
    console.error('[API] auth error:', authError);
    return errorResponse(`No autorizado: ${authError}`, 401);
  }

  // ── Despacho de la acción autenticada ──
  const supabase = createServiceClient();
  const dispatch = createDispatch(supabase);
  try {
    return corsResponse({ data: await dispatch(body.action, body.payload ?? {}) });
  } catch (err) {
    console.error('[API] Error en acción:', body.action, err);
    return errorResponse((err as Error).message, 500);
  }
});