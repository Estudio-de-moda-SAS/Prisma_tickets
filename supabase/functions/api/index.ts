// @ts-ignore
import { verifyAzureToken }   from './lib/auth.ts';
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return errorResponse('Método no permitido', 405);

  let body: { action: string; payload: Record<string, unknown> };
  try { body = await req.json(); } catch { return errorResponse('Body inválido', 400); }
  if (!body.action) return errorResponse('Campo "action" requerido', 400);

  if (body.action === 'get_public_announcements') {
    const supabase = createServiceClient();
    return corsResponse({ data: await getPublicAnnouncements(supabase) });
  }

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

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return errorResponse('Token de autorización requerido', 401);

  try { await verifyAzureToken(token); } catch (err) {
    console.error('[API] auth error:', (err as Error).message);
    return errorResponse(`No autorizado: ${(err as Error).message}`, 401);
  }

  const supabase = createServiceClient();
  const dispatch = createDispatch(supabase);
  try {
    return corsResponse({ data: await dispatch(body.action, body.payload ?? {}) });
  } catch (err) {
    console.error('[API] Error en acción:', body.action, err);
    return errorResponse((err as Error).message, 500);
  }
});