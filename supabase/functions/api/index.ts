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
const INTERNAL_JOB_SECRET = Deno.env.get('INTERNAL_JOB_SECRET') ?? '';
const SELF_URL            = `${SUPABASE_URL}/functions/v1/api`;

const JOB_CHUNK_SIZE              = 100;  // solicitudes por chunk
const JOB_MAX_CHUNKS_PER_INVOKE   = 5;    // 500 por invocación → ~30-50s

// @ts-ignore — disponible en Supabase Edge Runtime
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
/*
 * RATE_LIMIT_DAYS: días mínimos entre calificaciones por usuario.
 * 0 = sin límite (comportamiento actual).
 * Cambia a 7 para limitar a 1 por semana, etc.
 */
const RATING_RATE_LIMIT_DAYS = 0;

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

function extractStoragePath(storedValue: string): string {
  if (!storedValue.startsWith('http')) return storedValue;
  const marker = '/object/public/attachments/';
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) return storedValue.slice(idx + marker.length);
  return storedValue;
}
/* ── Helpers para rename de keys en templates ───────────── */

function _isConditional(f: unknown): boolean {
  return !!f && typeof f === 'object' && (f as { type?: string }).type === 'conditional';
}

function _collectSchemaKeys(schema: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const f of arr ?? []) {
      if (!f || typeof f !== 'object') continue;
      const node = f as { key?: string; trueBranch?: unknown[]; falseBranch?: unknown[] };
      if (node.key) out.push(node.key);
      if (_isConditional(node)) {
        walk(node.trueBranch  ?? []);
        walk(node.falseBranch ?? []);
      }
    }
  };
  walk(schema);
  return out;
}

function _renameKeysInSchema(schema: unknown[], renames: Record<string, string>): unknown[] {
  return (schema ?? []).map((f) => {
    if (!f || typeof f !== 'object') return f;
    const node: Record<string, unknown> = { ...(f as Record<string, unknown>) };
    if (typeof node['key'] === 'string' && renames[node['key'] as string]) {
      node['key'] = renames[node['key'] as string];
    }
    if (_isConditional(node)) {
      node['trueBranch']  = _renameKeysInSchema((node['trueBranch']  as unknown[]) ?? [], renames);
      node['falseBranch'] = _renameKeysInSchema((node['falseBranch'] as unknown[]) ?? [], renames);
    }
    return node;
  });
}
/* ── Self-invoke para procesar el siguiente chunk ───────── */
async function _kickoffJobChunk(jobId: string): Promise<void> {
  try {
    await fetch(SELF_URL, {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'X-Internal-Job-Secret':   INTERNAL_JOB_SECRET,
      },
      body: JSON.stringify({
        action:  '_processBackgroundJobChunk',
        payload: { jobId },
      }),
    });
  } catch (_e) { /* silent — se reintentará en próximo poll si quedó colgado */ }
}

/* ── Marca el job como done y escribe auditoría ─────────── */
async function _finalizeRenameJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  processed: number,
  payload: { templateId: number; renames: { oldKey: string; newKey: string }[]; renamedBy: number | null },
): Promise<void> {
  const auditRows = payload.renames.map((r) => ({
    Template_ID:       payload.templateId,
    Old_Key:           r.oldKey,
    New_Key:           r.newKey,
    Renamed_By:        payload.renamedBy ?? null,
    Renamed_At:        new Date().toISOString(),
    Requests_Affected: processed,
  }));
  if (auditRows.length > 0) {
    await supabase.from('TBL_Template_Field_Renames').insert(auditRows);
  }

  await supabase.from('TBL_Background_Jobs').update({
    Job_Status:           'done',
    Job_Progress_Current: processed,
    Job_Progress_Total:   processed,
    Job_Result:           { requestsUpdated: processed, renames: payload.renames },
    Job_Updated_At:       new Date().toISOString(),
    Job_Completed_At:     new Date().toISOString(),
  }).eq('Job_ID', jobId);
}

/* ── Procesa hasta MAX_CHUNKS_PER_INVOKE; si quedan más, self-invoke ── */
async function _processTemplateRenameChunk(
  jobId: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const { data: jobRow, error: jobErr } = await supabase
    .from('TBL_Background_Jobs')
    .select('Job_ID, Job_Type, Job_Status, Job_Payload, Job_Progress_Current, Job_Progress_Total')
    .eq('Job_ID', jobId)
    .single();
  if (jobErr || !jobRow) return;

  const job = jobRow as {
    Job_ID: string;
    Job_Type: string;
    Job_Status: string;
    Job_Payload: {
      templateId: number;
      renames:    { oldKey: string; newKey: string }[];
      renamedBy:  number | null;
    };
    Job_Progress_Current: number;
    Job_Progress_Total:   number;
  };

  if (job.Job_Status === 'done' || job.Job_Status === 'failed') return;
  if (job.Job_Type   !== 'template_field_rename')                return;

  // Marcar como running si era pending
  if (job.Job_Status === 'pending') {
    await supabase.from('TBL_Background_Jobs').update({
      Job_Status:     'running',
      Job_Updated_At: new Date().toISOString(),
    }).eq('Job_ID', jobId);
  }

  const renameMap: Record<string, string> = {};
  for (const r of job.Job_Payload.renames) renameMap[r.oldKey] = r.newKey;

  let processed = job.Job_Progress_Current;

  try {
    for (let chunkNum = 0; chunkNum < JOB_MAX_CHUNKS_PER_INVOKE; chunkNum++) {
      const { data: batch, error: fetchErr } = await supabase
        .from('TBL_Requests')
        .select('Request_ID, Request_Form_Data, Request_Template_Schema_Snapshot')
        .eq('Request_Template_ID', job.Job_Payload.templateId)
        .order('Request_ID', { ascending: true })
        .range(processed, processed + JOB_CHUNK_SIZE - 1);
      if (fetchErr) throw new Error(fetchErr.message);

      if (!batch || batch.length === 0) {
        await _finalizeRenameJob(supabase, jobId, processed, job.Job_Payload);
        return;
      }

      for (const row of batch as Array<{
        Request_ID: string;
        Request_Form_Data: unknown;
        Request_Template_Schema_Snapshot: unknown[] | null;
      }>) {
        const newFormData = _renameKeysInFormData(row.Request_Form_Data, renameMap);
        const newSnapshot = _renameKeysInSchema(row.Request_Template_Schema_Snapshot ?? [], renameMap);
        const { error: updErr } = await supabase
          .from('TBL_Requests')
          .update({
            Request_Form_Data:                newFormData,
            Request_Template_Schema_Snapshot: newSnapshot,
          })
          .eq('Request_ID', row.Request_ID);
        if (updErr) throw new Error(updErr.message);
        processed++;
      }

      // Persistir progreso después de cada chunk
      await supabase.from('TBL_Background_Jobs').update({
        Job_Progress_Current: processed,
        Job_Updated_At:       new Date().toISOString(),
      }).eq('Job_ID', jobId);

      // Último batch parcial → terminamos
      if (batch.length < JOB_CHUNK_SIZE) {
        await _finalizeRenameJob(supabase, jobId, processed, job.Job_Payload);
        return;
      }
    }

    // Llegamos al techo de chunks por invocación → continuar en otra invocación
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(_kickoffJobChunk(jobId));
    } else {
      _kickoffJobChunk(jobId).catch(() => {});
    }
  } catch (err) {
    await supabase.from('TBL_Background_Jobs').update({
      Job_Status:       'failed',
      Job_Error:        (err as Error).message,
      Job_Updated_At:   new Date().toISOString(),
      Job_Completed_At: new Date().toISOString(),
    }).eq('Job_ID', jobId);
  }
}
/* ============================================================
   EXPORT JOBS (Fase 2) — constantes y helpers
   ============================================================ */

const MAX_EXPORT_SIZE             = parseInt(Deno.env.get('MAX_EXPORT_SIZE')             ?? '100000', 10);
const EXPORT_JOB_CHUNK_SIZE       = parseInt(Deno.env.get('EXPORT_JOB_CHUNK_SIZE')       ?? '500',    10);
const EXPORT_MAX_CHUNKS_PER_INVOKE = parseInt(Deno.env.get('EXPORT_MAX_CHUNKS_PER_INVOKE') ?? '8',     10);
const EXPORT_BUCKET               = 'exports';

type ExportFilters = {
  boardId:          number;
  teamIds?:         number[] | null;
  sprintIds?:       number[] | null;
  columnIds?:       number[] | null;
  requestedByIds?:  number[] | null;
  assignedToIds?:   number[] | null;
  priorityScores?:  number[] | null;
  templateIds?:     number[] | null;
  labelIds?:        number[] | null;
  isConfidential?:  boolean | null;
  dateFrom?:        string | null;
  dateTo?:          string | null;
};

/** Resuelve la intersección de IDs candidatos según filtros relacionales */
async function _resolveExportCandidateIds(
  supabase: ReturnType<typeof createServiceClient>,
  filters:  ExportFilters,
): Promise<string[] | null> {
  let candidateIds: string[] | null = null;
  const intersect = (a: string[] | null, b: string[]): string[] => {
    if (a === null) return b;
    const setB = new Set(b);
    return a.filter((id) => setB.has(id));
  };

  if (filters.teamIds && filters.teamIds.length > 0) {
    const { data, error } = await supabase
      .from('TBL_Request_Team')
      .select('Request_Team_Request_ID')
      .in('Request_Team_ID', filters.teamIds);
    if (error) throw new Error(error.message);
    candidateIds = intersect(candidateIds, [...new Set(((data ?? []) as { Request_Team_Request_ID: string }[]).map((r) => r.Request_Team_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.sprintIds && filters.sprintIds.length > 0) {
    const { data, error } = await supabase
      .from('TBL_Request_Sprint')
      .select('Request_Sprint_Request_ID')
      .in('Request_Sprint_ID', filters.sprintIds);
    if (error) throw new Error(error.message);
    candidateIds = intersect(candidateIds, [...new Set(((data ?? []) as { Request_Sprint_Request_ID: string }[]).map((r) => r.Request_Sprint_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.assignedToIds && filters.assignedToIds.length > 0) {
    const { data, error } = await supabase
      .from('TBL_Requests_Assignments')
      .select('Request_Assignment_ID')
      .in('Request_Assignment_User_ID', filters.assignedToIds);
    if (error) throw new Error(error.message);
    candidateIds = intersect(candidateIds, [...new Set(((data ?? []) as { Request_Assignment_ID: string }[]).map((r) => r.Request_Assignment_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.labelIds && filters.labelIds.length > 0) {
    const { data, error } = await supabase
      .from('TBL_Request_Labels')
      .select('Request_Labels_Request_ID')
      .in('Request_Labels_Label_ID', filters.labelIds);
    if (error) throw new Error(error.message);
    candidateIds = intersect(candidateIds, [...new Set(((data ?? []) as { Request_Labels_Request_ID: string }[]).map((r) => r.Request_Labels_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  return candidateIds;
}

/** Aplica filtros directos (columna, prioridad, fechas, etc.) a un query builder */
function _applyExportDirectFilters<Q extends { eq: (k: string, v: unknown) => Q; in: (k: string, v: unknown[]) => Q; gte: (k: string, v: unknown) => Q; lte: (k: string, v: unknown) => Q }>(
  query: Q,
  filters: ExportFilters,
  candidateIds: string[] | null,
): Q {
  let q = query.eq('Request_Board_ID', filters.boardId);
  if (candidateIds !== null) q = q.in('Request_ID', candidateIds);
  if (filters.columnIds      && filters.columnIds.length > 0)      q = q.in('Request_Board_Column_ID', filters.columnIds);
  if (filters.requestedByIds && filters.requestedByIds.length > 0) q = q.in('Request_Requested_By',    filters.requestedByIds);
  if (filters.priorityScores && filters.priorityScores.length > 0) q = q.in('Request_Score',           filters.priorityScores);
  if (filters.templateIds    && filters.templateIds.length > 0)    q = q.in('Request_Template_ID',     filters.templateIds);
  if (filters.isConfidential !== null && filters.isConfidential !== undefined) {
    q = q.eq('Request_Is_Confidential', filters.isConfidential);
  }
  if (filters.dateFrom) q = q.gte('Request_Created_At', filters.dateFrom);
  if (filters.dateTo)   q = q.lte('Request_Created_At', filters.dateTo);
  return q;
}

/** Cuenta cuántos tickets coinciden con los filtros */
async function _countExportMatches(
  supabase:    ReturnType<typeof createServiceClient>,
  filters:     ExportFilters,
  candidateIds: string[] | null,
): Promise<number> {
  if (candidateIds !== null && candidateIds.length === 0) return 0;
  const base = supabase.from('TBL_Requests').select('Request_ID', { count: 'exact', head: true });
  const { count, error } = await _applyExportDirectFilters(base, filters, candidateIds);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Sube un archivo JSON al bucket de exports */
async function _uploadExportArtifact(
  supabase:    ReturnType<typeof createServiceClient>,
  storagePath: string,
  fileName:    string,
  jsonObject:  unknown,
): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(jsonObject));
  const { error } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(`${storagePath}/${fileName}`, bytes, {
      contentType: 'application/json',
      upsert:      true,
    });
  if (error) throw new Error(`Storage upload failed (${fileName}): ${error.message}`);
}

/** Self-invoca el procesamiento del siguiente chunk de export */
async function _kickoffExportChunk(jobId: string): Promise<void> {
  try {
    await fetch(SELF_URL, {
      method: 'POST',
      headers: {
        'Content-Type':          'application/json',
        'X-Internal-Job-Secret': INTERNAL_JOB_SECRET,
      },
      body: JSON.stringify({
        action:  '_processExportJobChunk',
        payload: { jobId },
      }),
    });
  } catch (_e) { /* silent — el watchdog reintenta si quedó colgado */ }
}

/** Marca el job como done, sube notificación y actualiza historial */
async function _finalizeExportJob(
  supabase:  ReturnType<typeof createServiceClient>,
  jobId:     string,
  exportId:  string,
  userId:    number,
  totalChunks: number,
  totalTickets: number,
  format:    string,
  fileName:  string,
  prefix:    string,
): Promise<void> {
  const completedAt = new Date().toISOString();

  // 1. Marcar job como done
  await supabase.from('TBL_Background_Jobs').update({
    Job_Status:           'done',
    Job_Progress_Current: totalTickets,
    Job_Result:           {
      exportId, totalChunks, totalTickets, storagePrefix: prefix, fileName, format,
    },
    Job_Updated_At:       completedAt,
    Job_Completed_At:     completedAt,
  }).eq('Job_ID', jobId);

  // 2. Actualizar TBL_Export_History
  await supabase.from('TBL_Export_History').update({
    Export_Status:         'done',
    Export_File_Name:      fileName,
    Export_Storage_Prefix: prefix,
    Export_Completed_At:   completedAt,
  }).eq('Export_ID', exportId);

  // 3. Notificación in-app
  await insertNotifications(supabase, {
    userIds:   [userId],
    type:      'export_ready',
    title:     'Tu exportación está lista',
    body:      `Exportación de ${totalTickets} tickets en formato ${format.toUpperCase()} completada. Disponible para descarga por 7 días.`,
    requestId: null,
    actorId:   null,
  });
}

/** Marca el job como fallido y la entrada de historial */
async function _failExportJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId:    string,
  exportId: string,
  error:    string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from('TBL_Background_Jobs').update({
    Job_Status:       'failed',
    Job_Error:        error,
    Job_Updated_At:   now,
    Job_Completed_At: now,
  }).eq('Job_ID', jobId);

  await supabase.from('TBL_Export_History').update({
    Export_Status:       'failed',
    Export_Error:        error,
    Export_Completed_At: now,
  }).eq('Export_ID', exportId);
}

/** Procesa N chunks consecutivos del export */
async function _processExportChunks(
  jobId:    string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const { data: jobRow, error: jobErr } = await supabase
    .from('TBL_Background_Jobs')
    .select('Job_ID, Job_Type, Job_Status, Job_Payload, Job_Progress_Current, Job_Progress_Total')
    .eq('Job_ID', jobId)
    .single();
  if (jobErr || !jobRow) return;

  const job = jobRow as {
    Job_ID:               string;
    Job_Type:             string;
    Job_Status:           string;
    Job_Payload:          {
      userId:           number;
      exportId:         string;
      filters:          ExportFilters;
      format:           'xlsx' | 'csv';
      selectedColumns:  string[];
      sheetPerTemplate: boolean;
      storagePrefix:    string;
      chunksTotal:      number;
      candidateIds:     string[] | null;  // null = no hubo filtros relacionales
    };
    Job_Progress_Current: number;
    Job_Progress_Total:   number;
  };

  if (job.Job_Status === 'done' || job.Job_Status === 'failed') return;
  if (job.Job_Type   !== 'export_requests')                     return;

  if (job.Job_Status === 'pending') {
    await supabase.from('TBL_Background_Jobs').update({
      Job_Status:     'running',
      Job_Updated_At: new Date().toISOString(),
    }).eq('Job_ID', jobId);

    await supabase.from('TBL_Export_History').update({
      Export_Status: 'running',
    }).eq('Export_ID', job.Job_Payload.exportId);
  }

  let processed = job.Job_Progress_Current;
  const { filters, candidateIds, storagePrefix, chunksTotal, exportId, userId, format } = job.Job_Payload;

  try {
    for (let chunkNum = 0; chunkNum < EXPORT_MAX_CHUNKS_PER_INVOKE; chunkNum++) {
      const chunkIndex = Math.floor(processed / EXPORT_JOB_CHUNK_SIZE);
      if (chunkIndex >= chunksTotal) break;

      // Query del chunk actual
      const base = supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .order('Request_Created_At', { ascending: false })
        .range(processed, processed + EXPORT_JOB_CHUNK_SIZE - 1);
      const { data: tickets, error: fetchErr } = await _applyExportDirectFilters(base, filters, candidateIds);
      if (fetchErr) throw new Error(fetchErr.message);

      const enriched = await attachCriteriaSummary((tickets ?? []) as Record<string, unknown>[], supabase);

      const chunkFileName = `chunk_${String(chunkIndex + 1).padStart(4, '0')}.json`;
      await _uploadExportArtifact(supabase, storagePrefix, chunkFileName, { tickets: enriched });

      processed += enriched.length;

      await supabase.from('TBL_Background_Jobs').update({
        Job_Progress_Current: processed,
        Job_Updated_At:       new Date().toISOString(),
      }).eq('Job_ID', jobId);

      // Si trajimos menos del chunk size, terminamos
      if (enriched.length < EXPORT_JOB_CHUNK_SIZE) break;
    }

    // ¿Terminamos?
    const finalChunkIndex = Math.floor(processed / EXPORT_JOB_CHUNK_SIZE);
    const isComplete = finalChunkIndex >= chunksTotal || processed >= job.Job_Progress_Total;

    if (isComplete) {
      // Nombre del archivo final que el frontend va a generar
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
      const ext   = format === 'xlsx' ? 'xlsx' : 'zip';
      const fileName = `PRISMA_export_${stamp}.${ext}`;
      await _finalizeExportJob(supabase, jobId, exportId, userId, finalChunkIndex, processed, format, fileName, storagePrefix);
    } else {
      // Self-invoke el siguiente lote
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(_kickoffExportChunk(jobId));
      } else {
        _kickoffExportChunk(jobId).catch(() => {});
      }
    }
  } catch (err) {
    await _failExportJob(supabase, jobId, exportId, (err as Error).message);
  }
}

/** Elimina todos los artifacts de Storage de un export */
async function _cleanupExportArtifacts(
  supabase: ReturnType<typeof createServiceClient>,
  storagePrefix: string,
): Promise<void> {
  try {
    const { data: files } = await supabase.storage.from(EXPORT_BUCKET).list(storagePrefix);
    if (files && files.length > 0) {
      const paths = (files as Array<{ name: string }>).map((f) => `${storagePrefix}/${f.name}`);
      await supabase.storage.from(EXPORT_BUCKET).remove(paths);
    }
  } catch (_e) { /* silent — un cron limpiará si quedó algo */ }
}

function _renameKeysInFormData(formData: unknown, renames: Record<string, string>): unknown {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return formData;
  const src = formData as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === '__labels') {
      // __labels viene como STRING JSON dentro de Form_Data
      try {
        const wasString = typeof v === 'string';
        const labels = wasString ? JSON.parse(v as string) : (v as Record<string, unknown>);
        const renamed: Record<string, unknown> = {};
        for (const [lk, lv] of Object.entries(labels ?? {})) {
          renamed[renames[lk] ?? lk] = lv;
        }
        out[k] = wasString ? JSON.stringify(renamed) : renamed;
      } catch {
        out[k] = v;
      }
      continue;
    }
    out[renames[k] ?? k] = v;
  }
  return out;
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
function mapAnnouncement(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id:         row['announcement_id'],
    title:      row['title'],
    body:       row['body'] ?? null,
    type:       row['type'],
    showIn:     row['show_in'],
    targetRole: row['target_role'] ?? null,
    isActive:   row['is_active'],
    startsAt:   row['starts_at'],
    endsAt:     row['ends_at'] ?? null,
    createdAt:  row['created_at'],
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
/** Verifica si la columna destino está marcada como cierre para los equipos del ticket */
async function isCloseColumn(
  supabase: ReturnType<typeof createServiceClient>,
  columnId: number,
  requestId: string,
): Promise<boolean> {
  const { data: reqTeams } = await supabase
    .from('TBL_Request_Team')
    .select('Request_Team_ID')
    .eq('Request_Team_Request_ID', requestId);

  const teamIds = ((reqTeams ?? []) as { Request_Team_ID: number }[])
    .map((t) => t.Request_Team_ID);
  if (teamIds.length === 0) return false;

  const { data: cfg } = await supabase
    .from('TBL_Team_Column_Config')
    .select('Config_ID')
    .eq('Column_ID', columnId)
    .in('Team_ID', teamIds)
    .eq('Is_Close_Column', true)
    .limit(1)
    .maybeSingle();

  return cfg !== null;
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

async function getPublicAnnouncements(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<unknown> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('TBL_Announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .contains('show_in', ['login'])
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapAnnouncement);
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
        titulo: string; descripcion: string; score: number; equipoIds: number[];  requesterDepartmentId: number | null;
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
          Request_Requester_Department_ID: p.requesterDepartmentId ?? null,
        })
        .select('Request_ID').single();
      if (insErr) throw new Error(insErr.message);
      const newId = (inserted as { Request_ID: string }).Request_ID;

      // ── Auto-asignación de sprint para usuarios externos ──────────────────
      let resolvedSprintId: number | null = p.sprintId;
      let autoAssignedSprint: Record<string, unknown> | null = null;

      if (p.sprintId === null && p.equipoIds.length > 0) {
        try {
          const { data: userRoleRow } = await supabase
            .from('TBL_Users').select('User_Role').eq('User_ID', p.requestedBy).single();
          const userRole   = (userRoleRow as any)?.User_Role as string | undefined;
          const isExternal = userRole !== 'admin' && userRole !== 'ti_member';

          if (isExternal) {
            const teamId = p.equipoIds[0];
            const nowIso = new Date().toISOString();

            // Solo sprints futuros (el activo no cuenta), ordenados por cercanía
            const { data: futureSprints } = await supabase
              .from('TBL_Sprint')
              .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date')
              .gt('Sprint_Start_Date', nowIso)
              .order('Sprint_Start_Date', { ascending: true });

            if (futureSprints && (futureSprints as any[]).length > 0) {
              const sprintIds = (futureSprints as any[]).map((s: any) => s.Sprint_ID);

              // Capacidades configuradas para este equipo
              const { data: capRows } = await supabase
                .from('TBL_Sprint_Team_Capacity')
                .select('Sprint_ID, External_Capacity')
                .eq('Board_Team_ID', teamId)
                .in('Sprint_ID', sprintIds);
              const capMap: Record<number, number> = {};
              for (const c of (capRows ?? []) as any[]) capMap[c.Sprint_ID] = c.External_Capacity;

              // Conteo de solicitudes externas ya asignadas por sprint+equipo
              const countMap: Record<number, number> = {};
              const { data: srLinks } = await supabase
                .from('TBL_Request_Sprint')
                .select('Request_Sprint_ID, Request_Sprint_Request_ID')
                .in('Request_Sprint_ID', sprintIds);

              if ((srLinks as any[])?.length > 0) {
                const linkedIds = [...new Set((srLinks as any[]).map((r: any) => r.Request_Sprint_Request_ID))];

                const { data: teamLinks } = await supabase
                  .from('TBL_Request_Team')
                  .select('Request_Team_Request_ID')
                  .eq('Request_Team_ID', teamId)
                  .in('Request_Team_Request_ID', linkedIds);
                const teamReqSet = new Set((teamLinks ?? []).map((r: any) => r.Request_Team_Request_ID));

                if (teamReqSet.size > 0) {
                  const { data: reqUsers } = await supabase
                    .from('TBL_Requests')
                    .select('Request_ID, Request_Requested_By')
                    .in('Request_ID', [...teamReqSet]);

                  const rIds = [...new Set((reqUsers ?? []).map((r: any) => r.Request_Requested_By))];
                  if (rIds.length > 0) {
                    const { data: roleRows } = await supabase
                      .from('TBL_Users').select('User_ID, User_Role').in('User_ID', rIds);
                    const extUserSet = new Set(
                      (roleRows ?? [])
                        .filter((u: any) => u.User_Role !== 'admin' && u.User_Role !== 'ti_member')
                        .map((u: any) => u.User_ID)
                    );
                    const extReqSet = new Set(
                      (reqUsers ?? [])
                        .filter((r: any) => extUserSet.has(r.Request_Requested_By))
                        .map((r: any) => r.Request_ID)
                    );
                    for (const sr of (srLinks as any[])) {
                      if (teamReqSet.has(sr.Request_Sprint_Request_ID) && extReqSet.has(sr.Request_Sprint_Request_ID)) {
                        countMap[sr.Request_Sprint_ID] = (countMap[sr.Request_Sprint_ID] ?? 0) + 1;
                      }
                    }
                  }
                }
              }

              // Primer sprint con cupo disponible
              for (const sp of (futureSprints as any[])) {
                const cap   = capMap[sp.Sprint_ID] ?? 20; // default cuando no hay registro
                const count = countMap[sp.Sprint_ID] ?? 0;
                if (count < cap) {
                  resolvedSprintId   = sp.Sprint_ID;
                  autoAssignedSprint = sp;
                  break;
                }
              }
            }
          }
        } catch (_assignErr) { /* no bloquear la creación del ticket */ }
      }
      // ── /Auto-asignación ──────────────────────────────────────────────────

      const ops = [];
      if (p.equipoIds.length > 0)
        ops.push(supabase.from('TBL_Request_Team').insert(
          p.equipoIds.map((tid) => ({ Request_Team_Request_ID: newId, Request_Team_ID: tid }))
        ));
      if (p.labelIds.length > 0)
        ops.push(supabase.from('TBL_Request_Labels').insert(
          p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid }))
        ));
      if (resolvedSprintId !== null)
        ops.push(supabase.from('TBL_Request_Sprint').insert(
          { Request_Sprint_Request_ID: newId, Request_Sprint_ID: resolvedSprintId }
        ));
      await Promise.all(ops);
// ── Ejecutar reglas solicitud_creada ──────────────────
      try {
        const { data: autoRules } = await supabase
          .from('TBL_Automation_Rules')
          .select('Rule_ID, Rule_Name, Rule_Team_ID, Rule_Action, Rule_Action_Value, Rule_Exec_Count')
          .eq('Rule_Is_Active', true)
          .eq('Rule_Trigger', 'solicitud_creada');

        for (const rule of (autoRules ?? []) as any[]) {
          const teamMatches = !rule.Rule_Team_ID || p.equipoIds.includes(rule.Rule_Team_ID);
          if (!teamMatches) continue;
          try {
            if (rule.Rule_Action === 'asignar_resolutor') {
              const userId = parseInt(rule.Rule_Action_Value, 10);
              if (!isNaN(userId)) {
                await supabase.from('TBL_Requests_Assignments').upsert(
                  {
                    Request_Assignment_ID:      newId,
                    Request_Assignment_User_ID: userId,
                    Request_Assignment_At:      new Date().toISOString(),
                  },
                  { onConflict: 'Request_Assignment_ID,Request_Assignment_User_ID' },
                );
                await insertNotifications(supabase, {
                  userIds:   [userId],
                  type:      'assignment',
                  title:     `Te asignaron el ticket ${newId}`,
                  body:      `Fuiste asignado automáticamente al ticket "${p.titulo}".`,
                  requestId: newId,
                  actorId:   null,
                });
              }
            } else if (rule.Rule_Action === 'notificar_usuario') {
              let userIds: number[] = [];
              const val = rule.Rule_Action_Value as string;
              if (val === 'solicitante') {
                userIds = [p.requestedBy];
              } else if (val === 'todos') {
                const { data: freshAssign } = await supabase
                  .from('TBL_Requests_Assignments')
                  .select('Request_Assignment_User_ID')
                  .eq('Request_Assignment_ID', newId);
                const aIds = ((freshAssign ?? []) as any[]).map((a: any) => a.Request_Assignment_User_ID);
                userIds = [...new Set([...aIds, p.requestedBy])];
              } else {
                const uid = parseInt(val, 10);
                if (!isNaN(uid)) userIds = [uid];
              }
              if (userIds.length > 0) {
                await insertNotifications(supabase, {
                  userIds,
                  type:      'assignment',
                  title:     `Automatización: ${rule.Rule_Name}`,
                  body:      `Se creó la solicitud "${p.titulo}" y tienes una notificación activa para este evento.`,
                  requestId: newId,
                  actorId:   null,
                });
              }
            }
            await supabase.from('TBL_Automation_Rules').update({
              Rule_Exec_Count:   rule.Rule_Exec_Count + 1,
              Rule_Last_Exec_At: new Date().toISOString(),
            }).eq('Rule_ID', rule.Rule_ID);
          } catch (_ruleErr) { /* no bloquear la creación */ }
        }
      } catch (_autoErr) { /* no bloquear la creación */ }

      const { data, error } = await supabase
        .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', newId).single();
      if (error) throw new Error(error.message);
/*
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
      });*/

      return autoAssignedSprint !== null
        ? { ...(data as object), _autoAssignedSprint: autoAssignedSprint }
        : data;
    }
    case 'moveToColumn': {
      const { id, columnId, movedBy } = payload as { id: string; columnId: number; movedBy?: number };
const [colRes, reqRes] = await Promise.all([
        supabase.from('TBL_Board_Columns').select('Board_Column_Name').eq('Board_Column_ID', columnId).single(),
        supabase.from('TBL_Requests').select('Request_Finished_At').eq('Request_ID', id).single(),
      ]);
      const colData   = colRes.data;
      const wasClosed = !!(reqRes.data as any)?.Request_Finished_At;
      const willClose = await isCloseColumn(supabase, columnId, id);

      const updateData: Record<string, unknown> = { Request_Board_Column_ID: columnId };
      if (willClose) {
        updateData['Request_Finished_At'] = new Date().toISOString();
        updateData['Request_Progress']    = 100;
      } else if (wasClosed) {
        // Reapertura: limpiar cierre (el registro TBL_Request_Closure se conserva como historial)
        updateData['Request_Finished_At'] = null;
        updateData['Request_Progress']    = 0;
      }

      const { error } = await supabase
        .from('TBL_Requests').update(updateData).eq('Request_ID', id);
      if (error) throw new Error(error.message);

// Comentario automático si el ticket se reabre
      if (!willClose && wasClosed && movedBy) {
        const colName = (colData as any)?.Board_Column_Name ?? 'otra columna';
        const { data: moverData } = await supabase
          .from('TBL_Users').select('User_Name').eq('User_ID', movedBy).single();
        const moverName = (moverData as any)?.User_Name ?? 'Un miembro del equipo';
        const fechaLocal = new Date().toLocaleDateString('es-CO', {
          timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
        });
        await supabase.from('TBL_Comments').insert({
          Comment_Request_ID: id,
          Comment_User_ID:    movedBy,
          Comment_Text:       `Este ticket fue reabierto el ${fechaLocal} por ${moverName} al ser movido a la columna «${colName}». La evidencia de cierre registrada anteriormente se conserva como historial. Si este movimiento fue un error, coordiná con el responsable del ticket para gestionarlo correctamente.`,
          Comment_Created_At: new Date().toISOString(),
        });
      }

      if (movedBy) {
        const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, id);        const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
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
        /*
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
        });*/
      }
// ── Ejecutar reglas columna_cambiada ──────────────────
      const movedColName = (colData as any)?.Board_Column_Name ?? '';
      if (movedColName) {
        try {
          const { data: colRules } = await supabase
            .from('TBL_Automation_Rules')
            .select('Rule_ID, Rule_Name, Rule_Team_ID, Rule_Action, Rule_Action_Value, Rule_Exec_Count')
            .eq('Rule_Is_Active', true)
            .eq('Rule_Trigger', 'columna_cambiada')
            .eq('Rule_Trigger_Value', movedColName);

          if (colRules && (colRules as any[]).length > 0) {
            const { data: reqTeams } = await supabase
              .from('TBL_Request_Team')
              .select('Request_Team_ID')
              .eq('Request_Team_Request_ID', id);
            const reqTeamIds = ((reqTeams ?? []) as any[]).map((t: any) => t.Request_Team_ID);

            for (const rule of colRules as any[]) {
              const teamMatches = !rule.Rule_Team_ID || reqTeamIds.includes(rule.Rule_Team_ID);
              if (!teamMatches) continue;
              try {
                if (rule.Rule_Action === 'asignar_resolutor') {
                  const userId = parseInt(rule.Rule_Action_Value, 10);
                  if (!isNaN(userId)) {
                    await supabase.from('TBL_Requests_Assignments').upsert(
                      {
                        Request_Assignment_ID:      id,
                        Request_Assignment_User_ID: userId,
                        Request_Assignment_At:      new Date().toISOString(),
                      },
                      { onConflict: 'Request_Assignment_ID,Request_Assignment_User_ID' },
                    );
                    await insertNotifications(supabase, {
                      userIds:   [userId],
                      type:      'assignment',
                      title:     `Te asignaron el ticket ${id}`,
                      body:      `Fuiste asignado al ticket ${id} al mover a "${movedColName}".`,
                      requestId: id,
                      actorId:   null,
                    });
// DESPUÉS
} else if (rule.Rule_Action === 'asignar_prioridad') {
  const scoreMap: Record<string, number> = {
    baja: 1, media: 3, alta: 5, critica: 8,
  };
  const score = scoreMap[rule.Rule_Action_Value];
  if (score !== undefined) {
    await supabase.from('TBL_Requests')
      .update({ Request_Score: score })
      .eq('Request_ID', id);
  }
}
                } else if (rule.Rule_Action === 'notificar_usuario') {
                  let userIds: number[] = [];
                  const val = rule.Rule_Action_Value as string;
                  if (val === 'asignados' || val === 'solicitante' || val === 'todos') {
                    const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, id);
                    if (val === 'asignados')      userIds = assigneeIds;
                    else if (val === 'solicitante') userIds = requestedBy ? [requestedBy] : [];
                    else userIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])];
                  } else {
                    const uid = parseInt(val, 10);
                    if (!isNaN(uid)) userIds = [uid];
                  }
                  if (userIds.length > 0) {
                    await insertNotifications(supabase, {
                      userIds,
                      type:      'column_move',
                      title:     `Automatización: ${rule.Rule_Name}`,
                      body:      `El ticket ${id} fue movido a "${movedColName}".`,
                      requestId: id,
                      actorId:   null,
                    });
                  }
                }
                await supabase.from('TBL_Automation_Rules').update({
                  Rule_Exec_Count:   rule.Rule_Exec_Count + 1,
                  Rule_Last_Exec_At: new Date().toISOString(),
                }).eq('Rule_ID', rule.Rule_ID);
              } catch (_ruleErr) { /* no bloquear el move */ }
            }
          }
        } catch (_autoErr) { /* no bloquear el move */ }
      }
        return { ok: true };
    }

case 'updateRequest': {
  const { id, ...patch } = payload as {
    id: string; titulo?: string; descripcion?: string; score?: number;
    progreso?: number; estimatedHours?: number | null; loggedHours?: number | null;
    equipoIds?: number[]; labelIds?: number[]; sprintId?: number | null;
    formData?: Record<string, unknown>; // ← nuevo
  };
  const scalarUpdate: Record<string, unknown> = {};
  if (patch.titulo         !== undefined) scalarUpdate['Request_Title']           = patch.titulo;
  if (patch.descripcion    !== undefined) scalarUpdate['Request_Description']     = patch.descripcion;
  if (patch.score          !== undefined) scalarUpdate['Request_Score']           = patch.score;
  if (patch.progreso       !== undefined) scalarUpdate['Request_Progress']        = Math.min(100, Math.max(0, patch.progreso));
  if (patch.estimatedHours !== undefined) scalarUpdate['Request_Estimated_Hours'] = patch.estimatedHours;
  if (patch.loggedHours    !== undefined) scalarUpdate['Request_Logged_Hours']    = patch.loggedHours;
  if (patch.formData       !== undefined) scalarUpdate['Request_Form_Data']       = patch.formData;  
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
    targetColumnId: number;
    evidenceMode?:       'new' | 'reuse' | 'skip';
    reuseFromClosureId?: number | null;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
  };

  const mode = p.evidenceMode ?? 'new';

  // 1) Crear el registro de closure
  const { data: closure, error: closureErr } = await supabase
    .from('TBL_Request_Closure')
    .insert({
      Request_ID:       p.requestId,
      Closed_By:        p.closedBy,
      Closure_Note:     p.closureNote,
      Target_Column_ID: p.targetColumnId,
      Closure_Type:     mode,
      Attachment_URL:   p.attachmentUrl  ?? null,
      Attachment_Name:  p.attachmentName ?? null,
      Attachment_Mime:  p.attachmentMime ?? null,
      Closed_At:        new Date().toISOString(),
    })
    .select(`
      Closure_ID, Closure_Note, Closure_Type,
      Attachment_URL, Attachment_Name, Attachment_Mime, Closed_At,
      closer:TBL_Users!Closed_By ( User_ID, User_Name )
    `)
    .single();
  if (closureErr) throw new Error(closureErr.message);

  // 2) Si es 'reuse', clonar referencias del closure anterior
  if (mode === 'reuse' && p.reuseFromClosureId) {
    const { data: srcAttachments, error: srcErr } = await supabase
      .from('TBL_Closure_Attachments')
      .select('Storage_Path, File_Name, Mime_Type, File_Size')
      .eq('Closure_ID', p.reuseFromClosureId);
    if (srcErr) throw new Error(srcErr.message);

    if (srcAttachments && srcAttachments.length > 0) {
      const rows = (srcAttachments as Array<{
        Storage_Path: string;
        File_Name:    string;
        Mime_Type:    string;
        File_Size:    number;
      }>).map((a) => ({
        Closure_ID:   (closure as any).Closure_ID,
        Storage_Path: a.Storage_Path,
        File_Name:    a.File_Name,
        Mime_Type:    a.Mime_Type,
        File_Size:    a.File_Size,
        Created_At:   new Date().toISOString(),
      }));
      const { error: cloneErr } = await supabase
        .from('TBL_Closure_Attachments')
        .insert(rows);
      if (cloneErr) throw new Error(cloneErr.message);
    }
  }

  // 3) Mover la columna — sellar si es columna de cierre
  const willClose = await isCloseColumn(supabase, p.targetColumnId, p.requestId);
  const updateData: Record<string, unknown> = {
    Request_Board_Column_ID: p.targetColumnId,
  };
  if (willClose) {
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
/*
  const { data: requestData } = await supabase
    .from('TBL_Requests')
    .select('Request_Title, Request_Requested_By')
    .eq('Request_ID', p.requestId)
    .single();
  const ticketTitle = (requestData as any)?.Request_Title ?? '';
  const ticketUrl   = `${Deno.env.get('APP_URL') ?? 'https://tusistema.com'}/ticket/${p.requestId}`;
  const emailRecipients = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])];
  await sendEventEmail(supabase, {
    eventKey:  'closeRequest',
    requestId: p.requestId,
    userIds:   emailRecipients,
    vars: {
      ticket_id:     p.requestId,
      ticket_title:  ticketTitle,
      ticket_url:    ticketUrl,
      actor_name:    '',
      closure_notes: p.closureNote,
    },
  });*/

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
.order('Submitted_At', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
    }

    case 'submitClientFeedback': {
      const p = payload as {
        requestId:      string;
        submittedBy:    number;
        decision:       'approved' | 'rejected';
        feedbackNote:   string | null;
        targetColumnId: number;
      };
// Validar límite: 1 feedback por ciclo de cierre
      const [closureRes, feedbackRes] = await Promise.all([
        supabase
          .from('TBL_Request_Closure')
          .select('Closure_ID', { count: 'exact', head: true })
          .eq('Request_ID', p.requestId),
        supabase
          .from('TBL_Client_Feedback')
          .select('Feedback_ID', { count: 'exact', head: true })
          .eq('Request_ID', p.requestId),
      ]);
      if ((feedbackRes.count ?? 0) >= (closureRes.count ?? 1)) {
        throw new Error('Ya se registró feedback para este ciclo de cierre. El ticket debe reabrirse y cerrarse nuevamente para enviar uno nuevo.');
      }

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
/*
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
      });*/
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
        /*
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
        });*/
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
    .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )'
)
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
      .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )')
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
    .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )')
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
      const p = payload as { userId: number; departmentId: number; teamId: number | null };
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

  // Leer departamento actual para detectar si realmente cambió
  const { data: current } = await supabase
    .from('TBL_Users')
    .select('Department_ID')
    .eq('User_ID', p.userId)
    .single();

  const departmentChanged = current?.Department_ID !== p.departmentId;
  // Invariante: si cambia de departamento a uno no-nulo → forzar member
  const effectiveRole = (departmentChanged && p.departmentId !== null) ? 'member' : p.role;

  const { data, error } = await supabase
    .from('TBL_Users')
    .update({
      User_Role:     effectiveRole,
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
        .from('TBL_Departments')
        .select('Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding')
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
    .from('TBL_Board_Teams')
    .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Icon, Board_Team_Is_Admin_Only, Board_Team_Sort_Order')
    .order('Board_Team_Sort_Order', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

case 'fetchTeamsByBoardId': {
  const { boardId } = payload as { boardId: number };
  const { data, error } = await supabase
    .from('TBL_Board_Teams')
    .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description')
    .eq('Board_Team_ID', boardId);
  if (error) throw new Error(error.message);
  return data;
}

    // ── Columnas ────────────────────────────────────────────────

    case 'fetchBoardColumns': {
      const { boardId } = payload as { boardId: number };
      const { data, error } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: true });
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
        .from('TBL_Sprint')
        .select(`
          Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date,
          capacities:TBL_Sprint_Team_Capacity (
            Capacity_ID, Board_Team_ID, External_Capacity
          )
        `)
        .order('Sprint_Start_Date', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }

case 'createSprint': {
      const { text, startDate, endDate, teamCapacities } = payload as {
        text: string; startDate: string; endDate: string;
        teamCapacities?: { teamId: number; capacity: number }[];
      };
      const { data, error } = await supabase
        .from('TBL_Sprint')
        .insert({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate })
        .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date').single();
      if (error) throw new Error(error.message);
      const sprint = data as { Sprint_ID: number; Sprint_Text: string; Sprint_Start_Date: string; Sprint_End_Date: string };
      if (teamCapacities && teamCapacities.length > 0) {
        await supabase.from('TBL_Sprint_Team_Capacity').insert(
          teamCapacities.map((tc) => ({
            Sprint_ID:         sprint.Sprint_ID,
            Board_Team_ID:     tc.teamId,
            External_Capacity: tc.capacity,
          }))
        );
      }
      return {
        ...sprint,
        capacities: (teamCapacities ?? []).map((tc) => ({
          Capacity_ID: null, Board_Team_ID: tc.teamId, External_Capacity: tc.capacity,
        })),
      };
    }
    case 'updateSprint': {
      const { id, text, startDate, endDate, teamCapacities } = payload as {
        id: number; text: string; startDate: string; endDate: string;
        teamCapacities?: { teamId: number; capacity: number }[];
      };
      const { error } = await supabase
        .from('TBL_Sprint').update({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate }).eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      if (teamCapacities && teamCapacities.length > 0) {
        await Promise.all(
          teamCapacities.map((tc) =>
            supabase.from('TBL_Sprint_Team_Capacity').upsert(
              { Sprint_ID: id, Board_Team_ID: tc.teamId, External_Capacity: tc.capacity },
              { onConflict: 'Sprint_ID,Board_Team_ID' }
            )
          )
        );
      }
      return { ok: true };
    }

    case 'deleteSprint': {
      const { id } = payload as { id: number };
      const { error } = await supabase.from('TBL_Sprint').delete().eq('Sprint_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'triggerSprintStartMoves': {
      // Disparador manual del auto-move (equivalente al job pg_cron, para el botón admin)
      const { boardId: trigBoardId } = payload as { boardId?: number };
      const bId = trigBoardId ?? 1;

      const { data: sinCatCol } = await supabase
        .from('TBL_Board_Columns').select('Board_Column_ID')
        .eq('Board_Column_Board_ID', bId).eq('Board_Column_Slug', 'sin_categorizar').maybeSingle();

      // Columna destino: primera columna de workflow (posición 1+, distinta de sin_categorizar)
      const { data: todoCol } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name')
        .eq('Board_Column_Board_ID', bId)
        .neq('Board_Column_Slug', 'sin_categorizar')
        .order('Board_Column_Position', { ascending: true })
        .limit(1).maybeSingle();

      if (!sinCatCol || !todoCol) throw new Error('triggerSprintStartMoves: columnas origen/destino no encontradas.');

      const today = new Date().toISOString().split('T')[0];

      const { data: startingSprints } = await supabase
        .from('TBL_Sprint').select('Sprint_ID')
        .gte('Sprint_Start_Date', `${today}T00:00:00.000Z`)
        .lte('Sprint_Start_Date', `${today}T23:59:59.999Z`);

      if (!startingSprints || (startingSprints as any[]).length === 0)
        return { ok: true, moved: 0, message: 'No hay sprints que inicien hoy.' };

      const sprintIds = (startingSprints as any[]).map((s: any) => s.Sprint_ID);

      const { data: sprintLinks } = await supabase
        .from('TBL_Request_Sprint').select('Request_Sprint_Request_ID')
        .in('Request_Sprint_ID', sprintIds);

      const reqIds = [...new Set((sprintLinks ?? []).map((l: any) => l.Request_Sprint_Request_ID))];
      if (reqIds.length === 0) return { ok: true, moved: 0 };

      const { data: toMove } = await supabase
        .from('TBL_Requests').select('Request_ID')
        .in('Request_ID', reqIds)
        .eq('Request_Board_Column_ID', (sinCatCol as any).Board_Column_ID)
        .is('Request_Finished_At', null);

      if (!toMove || (toMove as any[]).length === 0) return { ok: true, moved: 0 };

      const moveIds = (toMove as any[]).map((r: any) => r.Request_ID);
      const { error: moveErr } = await supabase
        .from('TBL_Requests').update({ Request_Board_Column_ID: (todoCol as any).Board_Column_ID })
        .in('Request_ID', moveIds);

      if (moveErr) throw new Error(moveErr.message);
      return { ok: true, moved: moveIds.length, destColumn: (todoCol as any).Board_Column_Name };
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
  /*
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
  });*/
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
      /*
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
      });*/
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
// ── Bug Reports ──────────────────────────────────────────────────

case 'createBugReport': {
  const p = payload as {
    userId:     number;
    title:      string;
    description: string;
    severity:   'bajo' | 'medio' | 'alto' | 'critico';
    screenPath: string | null;
  };
  const { data, error } = await supabase
    .from('TBL_Bug_Reports')
    .insert({
      User_ID:     p.userId,
      Title:       p.title.trim(),
      Description: p.description.trim(),
      Severity:    p.severity,
      Screen_Path: p.screenPath ?? null,
      Status:      'pendiente',
      Created_At:  new Date().toISOString(),
      Updated_At:  new Date().toISOString(),
    })
    .select('"Report_ID", "Title", "Severity", "Status", "Created_At"')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Satisfaction Ratings ─────────────────────────────────────────


case 'createSatisfactionRating': {
  const p = payload as {
    userId:  number;
    score:   number;
    comment: string | null;
  };

  if (RATING_RATE_LIMIT_DAYS > 0) {
    const since = new Date();
    since.setDate(since.getDate() - RATING_RATE_LIMIT_DAYS);
    const { data: recent } = await supabase
      .from('TBL_Satisfaction_Ratings')
      .select('"Rating_ID"')
      .eq('User_ID', p.userId)
      .gte('Created_At', since.toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) throw new Error(`Solo puedes calificar cada ${RATING_RATE_LIMIT_DAYS} días.`);
  }

  const { data, error } = await supabase
    .from('TBL_Satisfaction_Ratings')
    .insert({
      User_ID:    p.userId,
      Score:      p.score,
      Comment:    p.comment?.trim() ?? null,
      Created_At: new Date().toISOString(),
    })
    .select('"Rating_ID", "Score", "Created_At"')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
case 'fetchBugReports': {
  const { data, error } = await supabase
    .from('TBL_Bug_Reports')
    .select(`
      "Report_ID", "Title", "Description", "Severity", "Status", "Screen_Path",
      "Created_At", "Updated_At",
      reporter:TBL_Users!User_ID ( User_ID, User_Name, User_Email )
    `)
    .order('Created_At', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
 
case 'fetchSatisfactionRatings': {
  const { data, error } = await supabase
    .from('TBL_Satisfaction_Ratings')
    .select(`
      "Rating_ID", "Score", "Comment", "Created_At",
      rater:TBL_Users!User_ID ( User_ID, User_Name, User_Email )
    `)
    .order('Created_At', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
 
case 'updateBugReportStatus': {
  const { reportId, status } = payload as { reportId: number; status: string };
  const { error } = await supabase
    .from('TBL_Bug_Reports')
    .update({ Status: status, Updated_At: new Date().toISOString() })
    .eq('Report_ID', reportId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

   case 'getDepartmentsWithTeams': {
      const { data, error } = await supabase
        .from('TBL_Departments')
        .select(`
          Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding,
          teams:TBL_Teams!Department_ID (
            Team_ID, Team_Name, Team_Code, Department_ID
          )
        `)
        .order('Department_Name', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }
 
    case 'createDepartment': {
      const { name, code, isHidden } = payload as {
        name: string; code: string; isHidden: boolean;
      };
      const { data, error } = await supabase
        .from('TBL_Departments')
        .insert({
          Department_Name:             name.trim(),
          Department_Code:             code.trim().toLowerCase(),
          Is_Hidden_From_Onboarding:   isHidden,
          Created_At:                  new Date().toISOString(),
        })
        .select(`
          Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding,
          teams:TBL_Teams!Department_ID ( Team_ID, Team_Name, Team_Code, Department_ID )
        `)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
 
    case 'updateDepartment': {
      const { id, name, code, isHidden } = payload as {
        id: number; name: string; code: string; isHidden: boolean;
      };
      const { error } = await supabase
        .from('TBL_Departments')
        .update({
          Department_Name:           name.trim(),
          Department_Code:           code.trim().toLowerCase(),
          Is_Hidden_From_Onboarding: isHidden,
        })
        .eq('Department_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
 
    case 'deleteDepartment': {
      const { id } = payload as { id: number };
      // Usuarios vinculados a este dept vuelven a pedir onboarding
      await supabase
        .from('TBL_Users')
        .update({ Department_ID: null, Team_ID: null, Is_New: true })
        .eq('Department_ID', id);
      // Eliminar los equipos del departamento
      await supabase.from('TBL_Teams').delete().eq('Department_ID', id);
      // Eliminar el departamento
      const { error } = await supabase
        .from('TBL_Departments').delete().eq('Department_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
 
    case 'createTeam': {
      const { departmentId, name, code } = payload as {
        departmentId: number; name: string; code: string;
      };
      const { data, error } = await supabase
        .from('TBL_Teams')
        .insert({
          Department_ID: departmentId,
          Team_Name:     name.trim(),
          Team_Code:     code.trim().toLowerCase(),
          Created_At:    new Date().toISOString(),
        })
        .select('Team_ID, Team_Name, Team_Code, Department_ID')
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
 
    case 'updateTeam': {
      const { id, name, code } = payload as { id: number; name: string; code: string };
      const { error } = await supabase
        .from('TBL_Teams')
        .update({ Team_Name: name.trim(), Team_Code: code.trim().toLowerCase() })
        .eq('Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
 
    case 'deleteTeam': {
      const { id } = payload as { id: number };
      // Usuarios vinculados a este equipo vuelven a pedir onboarding
      await supabase
        .from('TBL_Users')
        .update({ Team_ID: null, Is_New: true })
        .eq('Team_ID', id);
      // Eliminar el equipo
      const { error } = await supabase.from('TBL_Teams').delete().eq('Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
/* ── Reglas de automatización ───────────────────────────── */

    case 'fetchAutomationRules': {
      const { data, error } = await supabase
        .from('TBL_Automation_Rules')
        .select(`
          Rule_ID, Rule_Name, Rule_Description, Rule_Team_ID,
          Rule_Trigger, Rule_Trigger_Value, Rule_Action, Rule_Action_Value,
          Rule_Is_Active, Rule_Exec_Count, Rule_Last_Exec_At, Rule_Created_At,
          team:TBL_Board_Teams!Rule_Team_ID ( Board_Team_ID, Board_Team_Name, Board_Team_Code )
        `)
        .order('Rule_Created_At', { ascending: false });
      if (error) throw new Error(error.message);

      const rows = data as any[];

      // Resolver nombre de usuario para reglas asignar_resolutor
// Resolver nombres para asignar_resolutor y notificar_usuario (user ID específico)
      const resolverIds = [...new Set(
        rows
          .filter((r) =>
            (r.Rule_Action === 'asignar_resolutor' || r.Rule_Action === 'notificar_usuario') &&
            r.Rule_Action_Value &&
            !isNaN(parseInt(r.Rule_Action_Value, 10)),
          )
          .map((r) => parseInt(r.Rule_Action_Value, 10)),
      )];

      const userMap: Record<number, string> = {};
      if (resolverIds.length > 0) {
        const { data: users } = await supabase
          .from('TBL_Users')
          .select('User_ID, User_Name')
          .in('User_ID', resolverIds);
        for (const u of (users ?? []) as any[])
          userMap[u.User_ID as number] = u.User_Name as string;
      }

const PRIO: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};
      const NOTIFY_LABELS: Record<string, string> = {
        'asignados':   'Resolutores asignados',
        'solicitante': 'Solicitante',
        'todos':       'Todos los participantes',
      };

      return rows.map((r) => ({
        ...r,
        Rule_Action_Resolved_Label:
          r.Rule_Action === 'asignar_resolutor'
            ? (userMap[parseInt(r.Rule_Action_Value, 10)] ?? null)
            : r.Rule_Action === 'asignar_prioridad'
            ? (PRIO[r.Rule_Action_Value] ?? null)
            : r.Rule_Action === 'notificar_usuario'
            ? (NOTIFY_LABELS[r.Rule_Action_Value] ?? userMap[parseInt(r.Rule_Action_Value, 10)] ?? null)
            : null,
      }));
    }

    case 'createAutomationRule': {
      const p = payload as {
        name: string; description: string | null; teamId: number | null;
        trigger: string; triggerValue: string | null;
        action: string; actionValue: string;
      };
      const { data, error } = await supabase
        .from('TBL_Automation_Rules')
        .insert({
          Rule_Name:          p.name.trim(),
          Rule_Description:   p.description?.trim() ?? null,
          Rule_Team_ID:       p.teamId ?? null,
          Rule_Trigger:       p.trigger,
          Rule_Trigger_Value: p.triggerValue ?? null,
          Rule_Action:        p.action,
          Rule_Action_Value:  p.actionValue,
          Rule_Is_Active:     true,
          Rule_Exec_Count:    0,
          Rule_Created_At:    new Date().toISOString(),
        })
        .select(`
          Rule_ID, Rule_Name, Rule_Description, Rule_Team_ID,
          Rule_Trigger, Rule_Trigger_Value, Rule_Action, Rule_Action_Value,
          Rule_Is_Active, Rule_Exec_Count, Rule_Last_Exec_At, Rule_Created_At,
          team:TBL_Board_Teams!Rule_Team_ID ( Board_Team_ID, Board_Team_Name, Board_Team_Code )
        `)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'toggleAutomationRule': {
      const { ruleId, isActive } = payload as { ruleId: number; isActive: boolean };
      const { error } = await supabase
        .from('TBL_Automation_Rules')
        .update({ Rule_Is_Active: isActive })
        .eq('Rule_ID', ruleId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'deleteAutomationRule': {
      const { ruleId } = payload as { ruleId: number };
      const { error } = await supabase
        .from('TBL_Automation_Rules')
        .delete()
        .eq('Rule_ID', ruleId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ── Kanbans admin ────────────────────────────────────────────

    case 'createKanbanTeam': {
const { name, code, color, description, icon, isAdminOnly } = payload as {
        name: string; code: string; color: string; description: string; icon?: string; isAdminOnly?: boolean;
      };
      const { data, error } = await supabase
        .from('TBL_Board_Teams')
        .insert({
          Board_Team_Name:           name.trim(),
          Board_Team_Code:           code.trim().toLowerCase(),
          Board_Team_Color:          color,
          Board_Team_Description:    description?.trim() || null,
          Board_Team_Icon:           icon ?? '🗂️',
          Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
        })
        .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Is_Admin_Only')        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'updateKanbanTeam': {
      const { id, name, code, description, color, icon, isAdminOnly } = payload as {
        id: number; name: string; code: string; color: string; description: string; icon?: string; isAdminOnly?: boolean;
      };
      const { error } = await supabase
        .from('TBL_Board_Teams')
        .update({
          Board_Team_Name:           name.trim(),
          Board_Team_Code:           code.trim().toLowerCase(),
          Board_Team_Color:          color,
          Board_Team_Description:    description?.trim() || null,
          Board_Team_Icon:           icon ?? '🗂️',
          Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
        })
        .eq('Board_Team_ID', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'fetchTeamColumnConfig': {
      const { boardId, teamId } = payload as { boardId: number; teamId: number };
      const { data: cols, error: colsErr } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: true });
      if (colsErr) throw new Error(colsErr.message);
 
      const columnIds = (cols as any[]).map((c) => c.Board_Column_ID);
      const { data: configs, error: configsErr } = await supabase
        .from('TBL_Team_Column_Config')
.select('Config_ID, Column_ID, Is_Visible, Evidence_Required, Evidence_Label, Is_Close_Column, Is_Stats_Start, Team_Column_Color, Team_Column_Title_Color')        .eq('Team_ID', teamId)
        .in('Column_ID', columnIds.length > 0 ? columnIds : [-1]);
      if (configsErr) throw new Error(configsErr.message);
 
      const configMap = new Map<number, any>();
      for (const c of (configs ?? []) as any[]) configMap.set(c.Column_ID, c);
 
      return (cols as any[]).map((col) => {
        const cfg = configMap.get(col.Board_Column_ID);
        return {
          Board_Column_ID:       col.Board_Column_ID,
          Board_Column_Name:     col.Board_Column_Name,
          Board_Column_Slug:     col.Board_Column_Slug ?? '',
          Board_Column_Position: col.Board_Column_Position,
          Board_Column_Color:    col.Board_Column_Color,
          Board_Column_Limit:    col.Board_Column_Limit,
          Config_ID:             cfg?.Config_ID         ?? null,
          Is_Visible:            cfg?.Is_Visible         ?? true,
          Evidence_Required:     cfg?.Evidence_Required  ?? false,
          Evidence_Label:        cfg?.Evidence_Label      ?? null,
          Is_Close_Column:         cfg?.Is_Close_Column         ?? false,
          Is_Stats_Start:          cfg?.Is_Stats_Start           ?? false,
          Team_Column_Color:       cfg?.Team_Column_Color        ?? null,
          Team_Column_Title_Color: cfg?.Team_Column_Title_Color  ?? null,
        };
      });
    }

case 'upsertTeamColumnConfig': {
const { teamId, columnId, isVisible, evidenceRequired, evidenceLabel, isCloseColumn, teamColor, teamTitleColor } = payload as {
        teamId: number; columnId: number;
        isVisible: boolean; evidenceRequired: boolean;
        evidenceLabel: string | null; isCloseColumn?: boolean;
        teamColor?: string | null; teamTitleColor?: string | null;
      };
      const row: Record<string, unknown> = {
        Team_ID:           teamId,
        Column_ID:         columnId,
        Is_Visible:        isVisible,
        Evidence_Required: evidenceRequired,
        Evidence_Label:    evidenceLabel ?? null,
        Is_Close_Column:   isCloseColumn ?? false,
      };
      if (teamColor      !== undefined) row['Team_Column_Color']       = teamColor;
      if (teamTitleColor !== undefined) row['Team_Column_Title_Color'] = teamTitleColor;
      const { error } = await supabase
        .from('TBL_Team_Column_Config')
        .upsert(row, { onConflict: 'Team_ID,Column_ID' });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'updateBoardColumn': {
      const { columnId, name, color, limit } = payload as {
        columnId: number; name: string; color: string; limit: number;
      };
      const { error } = await supabase
        .from('TBL_Board_Columns')
        .update({
          Board_Column_Name:  name.trim(),
          Board_Column_Color: color,
          Board_Column_Limit: limit,
        })
        .eq('Board_Column_ID', columnId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'createBoardColumn': {
      const { boardId, name, color, limit } = payload as {
        boardId: number; name: string; color: string; limit: number;
      };
      // Auto-generar slug desde el nombre
      const slug = name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
 
      const { data: maxData } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_Position')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: false })
        .limit(1).maybeSingle();
      const nextPos = maxData ? ((maxData as any).Board_Column_Position + 1) : 0;
 
      const { data, error } = await supabase
        .from('TBL_Board_Columns')
        .insert({
          Board_Column_Board_ID: boardId,
          Board_Column_Name:     name.trim(),
          Board_Column_Slug:     slug,
          Board_Column_Color:    color,
          Board_Column_Limit:    limit ?? 0,
          Board_Column_Position: nextPos,
        })
        .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    case 'reorderBoardColumn': {
      const { columnId, direction, boardId } = payload as {
        columnId: number; direction: 'up' | 'down'; boardId: number;
      };
      const { data: cols, error: colsErr } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Position')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: true });
      if (colsErr) throw new Error(colsErr.message);
      const sorted = cols as { Board_Column_ID: number; Board_Column_Position: number }[];
      const idx = sorted.findIndex((c) => c.Board_Column_ID === columnId);
      if (idx === -1) return { ok: true };
      const si = direction === 'up' ? idx - 1 : idx + 1;
      if (si < 0 || si >= sorted.length) return { ok: true };
      const posA = sorted[idx].Board_Column_Position;
      const posB = sorted[si].Board_Column_Position;
      const idB  = sorted[si].Board_Column_ID;
      await Promise.all([
        supabase.from('TBL_Board_Columns').update({ Board_Column_Position: posB }).eq('Board_Column_ID', columnId),
        supabase.from('TBL_Board_Columns').update({ Board_Column_Position: posA }).eq('Board_Column_ID', idB),
      ]);
      return { ok: true };
    }
    case 'reorderBoardTeam': {
  const { teamId, direction } = payload as { teamId: number; direction: 'up' | 'down' };

  const { data: teams, error: teamsErr } = await supabase
    .from('TBL_Board_Teams')
    .select('Board_Team_ID, Board_Team_Sort_Order')
    .order('Board_Team_Sort_Order', { ascending: true });
  if (teamsErr) throw new Error(teamsErr.message);

  const sorted = teams as { Board_Team_ID: number; Board_Team_Sort_Order: number }[];
  const idx = sorted.findIndex((t) => t.Board_Team_ID === teamId);
  if (idx === -1) return { ok: true };

  const si = direction === 'up' ? idx - 1 : idx + 1;
  if (si < 0 || si >= sorted.length) return { ok: true };

  const posA = sorted[idx].Board_Team_Sort_Order;
  const posB = sorted[si].Board_Team_Sort_Order;
  const idB  = sorted[si].Board_Team_ID;

  await Promise.all([
    supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: posB }).eq('Board_Team_ID', teamId),
    supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: posA }).eq('Board_Team_ID', idB),
  ]);
  return { ok: true };
}
case 'get_announcements': {
  const { surface, userRole, userDeptId, userTeamId } = payload as {
    surface?: string; userRole?: string;
    userDeptId?: number | null; userTeamId?: number | null;
  };
  const now = new Date().toISOString();
  let query = supabase
    .from('TBL_Announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('created_at', { ascending: false });
  if (surface) query = query.contains('show_in', [surface]);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filtered = ((data ?? []) as Record<string, unknown>[]).filter((a) => {
    const target = a['target_role'] as string | null;
    if (!target) return true;
    if (target === 'admin') return userRole === 'admin';
    const parts    = target.split(',');
    const teamPart = parts.find((p: string) => p.startsWith('team:'));
    const deptPart = parts.find((p: string) => p.startsWith('dept:'));
    if (teamPart) return parseInt(teamPart.slice(5)) === userTeamId;
    if (deptPart) return parseInt(deptPart.slice(5)) === userDeptId;
    return target === userRole;
  });

  return filtered.map(mapAnnouncement);
}

case 'get_all_announcements': {
  const { data, error } = await supabase
    .from('TBL_Announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapAnnouncement);
}

case 'create_announcement': {
  const p = payload as {
    title: string; body?: string | null; type: string;
    showIn: string[]; targetRole?: string | null;
    startsAt?: string; endsAt?: string | null; createdBy: number;
  };
  const { data, error } = await supabase
    .from('TBL_Announcements')
    .insert({
      title:       p.title,
      body:        p.body ?? null,
      type:        p.type,
      show_in:     p.showIn,
      target_role: p.targetRole ?? null,
      is_active:   true,
      starts_at:   p.startsAt ?? new Date().toISOString(),
      ends_at:     p.endsAt ?? null,
      created_by:  p.createdBy,
      created_at:  new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapAnnouncement(data as Record<string, unknown>);
}

case 'update_announcement': {
  const { id, ...u } = payload as {
    id: string; title?: string; body?: string | null; type?: string;
    showIn?: string[]; targetRole?: string | null;
    isActive?: boolean; startsAt?: string; endsAt?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (u.title      !== undefined) patch['title']       = u.title;
  if (u.body       !== undefined) patch['body']        = u.body;
  if (u.type       !== undefined) patch['type']        = u.type;
  if (u.showIn     !== undefined) patch['show_in']     = u.showIn;
  if (u.targetRole !== undefined) patch['target_role'] = u.targetRole;
  if (u.isActive   !== undefined) patch['is_active']   = u.isActive;
  if (u.startsAt   !== undefined) patch['starts_at']   = u.startsAt;
  if (u.endsAt     !== undefined) patch['ends_at']     = u.endsAt;
  const { data, error } = await supabase
    .from('TBL_Announcements')
    .update(patch)
    .eq('announcement_id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapAnnouncement(data as Record<string, unknown>);
}

case 'delete_announcement': {
  const { id } = payload as { id: string };
  const { error } = await supabase
    .from('TBL_Announcements')
    .delete()
    .eq('announcement_id', id);
  if (error) throw new Error(error.message);
  return { success: true };
}
case 'setStatsStartColumn': {
      const { teamId, columnId } = payload as { teamId: number; columnId: number | null };

      // Buscar la fila que actualmente tiene Is_Stats_Start = true
      const { data: current } = await supabase
        .from('TBL_Team_Column_Config')
        .select('Config_ID, Column_ID')
        .eq('Team_ID', teamId)
        .eq('Is_Stats_Start', true)
        .maybeSingle();

      // Si ya estaba marcada esa misma columna → toggle off, salir
      if (current && columnId !== null && (current as any).Column_ID === columnId) {
        await supabase
          .from('TBL_Team_Column_Config')
          .update({ Is_Stats_Start: false })
          .eq('Config_ID', (current as any).Config_ID);
        return { ok: true };
      }

      // Limpiar la anterior si existe y es distinta
      if (current) {
        await supabase
          .from('TBL_Team_Column_Config')
          .update({ Is_Stats_Start: false })
          .eq('Config_ID', (current as any).Config_ID);
      }

      // Setear la nueva si no es null
      if (columnId !== null) {
        const { data: targetRow } = await supabase
          .from('TBL_Team_Column_Config')
          .select('Config_ID')
          .eq('Team_ID', teamId)
          .eq('Column_ID', columnId)
          .maybeSingle();

        if (targetRow) {
          await supabase
            .from('TBL_Team_Column_Config')
            .update({ Is_Stats_Start: true })
            .eq('Config_ID', (targetRow as any).Config_ID);
        } else {
          await supabase
            .from('TBL_Team_Column_Config')
            .insert({
              Team_ID:           teamId,
              Column_ID:         columnId,
              Is_Visible:        true,
              Evidence_Required: false,
              Evidence_Label:    null,
              Is_Close_Column:   false,
              Is_Stats_Start:    true,
            });
        }
      }
      return { ok: true };
    }

    case 'fetchStatsStartConfig': {
      const { boardId } = payload as { boardId: number };

      const { data: cols, error: colsErr } = await supabase
        .from('TBL_Board_Columns')
        .select('Board_Column_ID, Board_Column_Slug, Board_Column_Position')
        .eq('Board_Column_Board_ID', boardId)
        .order('Board_Column_Position', { ascending: true });
      if (colsErr) throw new Error(colsErr.message);

      const { data: allTeams, error: teamsErr } = await supabase
        .from('TBL_Board_Teams')
        .select('Board_Team_ID, Board_Team_Code');
      if (teamsErr) throw new Error(teamsErr.message);

      const teamIds = (allTeams as any[]).map((t) => t.Board_Team_ID);

      const { data: statsConfigs } = await supabase
        .from('TBL_Team_Column_Config')
        .select('Team_ID, Column_ID, Is_Stats_Start')
        .in('Team_ID', teamIds.length > 0 ? teamIds : [-1])
        .eq('Is_Stats_Start', true);

      const columnPositions:  Record<string, number> = {};
      const colIdToPos:       Record<number, number> = {};
      for (const col of (cols as any[])) {
        columnPositions[col.Board_Column_Slug] = col.Board_Column_Position;
        colIdToPos[col.Board_Column_ID]        = col.Board_Column_Position;
      }

      const statsStartByTeam: Record<string, number> = {};
      for (const cfg of ((statsConfigs ?? []) as any[])) {
        const team = (allTeams as any[]).find((t) => t.Board_Team_ID === cfg.Team_ID);
        if (team) {
          const pos = colIdToPos[cfg.Column_ID];
          if (pos !== undefined) statsStartByTeam[team.Board_Team_Code] = pos;
        }
      }

      return { columnPositions, statsStartByTeam };
    }

     case 'updateCriteriaTitle': {
      const { criteriaId, title } = payload as { criteriaId: number; title: string };
      const { data, error } = await supabase
        .from('TBL_Acceptance_Criteria')
        .update({ Title: title.trim(), Updated_At: new Date().toISOString() })
        .eq('Criteria_ID', criteriaId)
        .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
        .single();
      if (error) throw new Error(error.message);
      return mapCriteria(data as Record<string, unknown>);
    }   
    /* ── Template field rename: impacto previo ────────────── */
    case 'getTemplateRenameImpact': {
      const { templateId } = payload as { templateId: number };
      const { count, error } = await supabase
        .from('TBL_Requests')
        .select('Request_ID', { count: 'exact', head: true })
        .eq('Request_Template_ID', templateId);
      if (error) throw new Error(error.message);
      return { requestsCount: count ?? 0 };
    }

    /* ── Template field rename: aplicar con sincronización ── */
    case 'updateTemplateWithRenames': {
      const p = payload as {
        id: number; name: string; description: string; icon: string; color: string;
        badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
        renames: { oldKey: string; newKey: string }[];
        renamedBy: number | null;
      };

      // Validar formato de renames
      const renameMap: Record<string, string> = {};
      for (const r of p.renames ?? []) {
        if (!r.oldKey || !r.newKey) {
          throw new Error('Rename inválido: oldKey y newKey son requeridos.');
        }
        if (!/^[a-z0-9_]+$/.test(r.newKey)) {
          throw new Error(`Key inválido: "${r.newKey}". Solo se permiten minúsculas, dígitos y guión bajo.`);
        }
        if (renameMap[r.oldKey]) {
          throw new Error(`Rename duplicado para la key origen "${r.oldKey}".`);
        }
        renameMap[r.oldKey] = r.newKey;
      }

      // Validar unicidad de keys en el schema nuevo
      const allKeys = _collectSchemaKeys(p.formSchema);
      const seen = new Set<string>();
      for (const k of allKeys) {
        if (seen.has(k)) throw new Error(`Key duplicada en el template: "${k}". Cada campo debe tener una key única.`);
        seen.add(k);
      }

      // 1) Actualizar el template (idéntico a updateTemplate)
      const { error: tplErr } = await supabase.from('TBL_Requests_Templates').update({
        Request_Template_Name:        p.name,
        Request_Template_Description: p.description,
        Request_Template_Icon:        p.icon,
        Request_Template_Color:       p.color,
        Request_Template_Badge:       p.badge,
        Request_Template_Form_Schema: p.formSchema,
        Request_Template_Teams:       p.teamIds,
        Request_Template_Is_Active:   p.isActive,
      }).eq('Request_Template_ID', p.id);
      if (tplErr) throw new Error(tplErr.message);

      // 2) Si no hay renames, terminamos
      if (Object.keys(renameMap).length === 0) {
        return { ok: true, requestsUpdated: 0, renames: [] };
      }

      // 3) Procesar solicitudes en lotes de 100
      const BATCH_SIZE = 100;
      let updated = 0;
      let from    = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: batch, error: fetchErr } = await supabase
          .from('TBL_Requests')
          .select('Request_ID, Request_Form_Data, Request_Template_Schema_Snapshot')
          .eq('Request_Template_ID', p.id)
          .order('Request_Created_At', { ascending: true })
          .range(from, from + BATCH_SIZE - 1);
        if (fetchErr) throw new Error(fetchErr.message);
        if (!batch || batch.length === 0) break;

        for (const row of batch as Array<{
          Request_ID: string;
          Request_Form_Data: unknown;
          Request_Template_Schema_Snapshot: unknown[] | null;
        }>) {
          const newFormData = _renameKeysInFormData(row.Request_Form_Data, renameMap);
          const newSnapshot = _renameKeysInSchema(row.Request_Template_Schema_Snapshot ?? [], renameMap);

          const { error: updErr } = await supabase
            .from('TBL_Requests')
            .update({
              Request_Form_Data:                newFormData,
              Request_Template_Schema_Snapshot: newSnapshot,
            })
            .eq('Request_ID', row.Request_ID);
          if (updErr) throw new Error(updErr.message);
          updated++;
        }

        if (batch.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }

      // 4) Auditoría
      const auditRows = p.renames.map((r) => ({
        Template_ID:       p.id,
        Old_Key:           r.oldKey,
        New_Key:           r.newKey,
        Renamed_By:        p.renamedBy ?? null,
        Renamed_At:        new Date().toISOString(),
        Requests_Affected: updated,
      }));
      await supabase.from('TBL_Template_Field_Renames').insert(auditRows);

      return { ok: true, requestsUpdated: updated, renames: p.renames };
    }

    /* ── Crear job de rename (reemplaza al sincrónico) ───── */
    case 'createTemplateRenameJob': {
      const p = payload as {
        id: number; name: string; description: string; icon: string; color: string;
        badge: string; formSchema: unknown[]; teamIds: number[]; isActive: boolean;
        renames: { oldKey: string; newKey: string }[];
        renamedBy: number | null;
      };

      // Validar renames
      const renameMap: Record<string, string> = {};
      for (const r of p.renames ?? []) {
        if (!r.oldKey || !r.newKey) throw new Error('Rename inválido: oldKey y newKey son requeridos.');
        if (!/^[a-z0-9_]+$/.test(r.newKey)) throw new Error(`Key inválido: "${r.newKey}". Solo se permiten minúsculas, dígitos y guión bajo.`);
        if (renameMap[r.oldKey]) throw new Error(`Rename duplicado para "${r.oldKey}".`);
        renameMap[r.oldKey] = r.newKey;
      }
      const allKeys = _collectSchemaKeys(p.formSchema);
      const seen = new Set<string>();
      for (const k of allKeys) {
        if (seen.has(k)) throw new Error(`Key duplicada en el template: "${k}".`);
        seen.add(k);
      }

      // 1) Actualizar el template
      const { error: tplErr } = await supabase.from('TBL_Requests_Templates').update({
        Request_Template_Name:        p.name,
        Request_Template_Description: p.description,
        Request_Template_Icon:        p.icon,
        Request_Template_Color:       p.color,
        Request_Template_Badge:       p.badge,
        Request_Template_Form_Schema: p.formSchema,
        Request_Template_Teams:       p.teamIds,
        Request_Template_Is_Active:   p.isActive,
      }).eq('Request_Template_ID', p.id);
      if (tplErr) throw new Error(tplErr.message);

      // 2) Si no hay renames, no hace falta job
      if (Object.keys(renameMap).length === 0) {
        return { jobId: null, requestsTotal: 0, ok: true };
      }

      // 3) Contar solicitudes a procesar
      const { count } = await supabase
        .from('TBL_Requests')
        .select('Request_ID', { count: 'exact', head: true })
        .eq('Request_Template_ID', p.id);
      const total = count ?? 0;

      // 4) Crear el job
      const { data: jobData, error: jobInsErr } = await supabase
        .from('TBL_Background_Jobs')
        .insert({
          Job_Type:    'template_field_rename',
          Job_Status:  'pending',
          Job_Payload: {
            templateId: p.id,
            renames:    p.renames,
            renamedBy:  p.renamedBy,
          },
          Job_Progress_Total: total,
          Job_Created_By:     p.renamedBy,
        })
        .select('Job_ID')
        .single();
      if (jobInsErr) throw new Error(jobInsErr.message);
      const jobId = (jobData as { Job_ID: string }).Job_ID;

      // 5) Disparar el primer chunk en background (no esperar)
      if (total > 0) {
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(_kickoffJobChunk(jobId));
        } else {
          _kickoffJobChunk(jobId).catch(() => {});
        }
      } else {
        // No hay solicitudes → marcar como done directo
        await _finalizeRenameJob(supabase, jobId, 0, {
          templateId: p.id,
          renames:    p.renames,
          renamedBy:  p.renamedBy,
        });
      }

      return { jobId, requestsTotal: total, ok: true };
    }

    /* ── Polling del job ──────────────────────────────────── */
    case 'getBackgroundJob': {
      const { jobId } = payload as { jobId: string };
      const { data, error } = await supabase
        .from('TBL_Background_Jobs')
        .select('Job_ID, Job_Type, Job_Status, Job_Progress_Current, Job_Progress_Total, Job_Result, Job_Error, Job_Created_At, Job_Updated_At, Job_Completed_At')
        .eq('Job_ID', jobId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
/* ════════════════════════════════════════════════════════════
       EXPORT JOBS (Fase 2)
       ════════════════════════════════════════════════════════════ */

    case 'createExportJob': {
      const p = payload as {
        userId:           number;
        boardId:          number;
        filters:          Omit<ExportFilters, 'boardId'>;
        format:           'xlsx' | 'csv';
        selectedColumns:  string[];
        sheetPerTemplate: boolean;
      };

      const fullFilters: ExportFilters = { ...p.filters, boardId: p.boardId };

      // 1. Resolver intersección de IDs según filtros relacionales
      const candidateIds = await _resolveExportCandidateIds(supabase, fullFilters);

      // 2. Contar tickets que coinciden
      const total = await _countExportMatches(supabase, fullFilters, candidateIds);

      if (total === 0) throw new Error('Ningún ticket coincide con los filtros seleccionados.');
      if (total > MAX_EXPORT_SIZE) {
        throw new Error(`El export tiene ${total.toLocaleString('es-CO')} tickets, supera el límite máximo de ${MAX_EXPORT_SIZE.toLocaleString('es-CO')}. Ajustá los filtros para reducir el alcance.`);
      }

      const chunksTotal = Math.ceil(total / EXPORT_JOB_CHUNK_SIZE);

      // 3. Crear job
      const { data: jobInsert, error: jobErr } = await supabase
        .from('TBL_Background_Jobs')
        .insert({
          Job_Type:           'export_requests',
          Job_Status:         'pending',
          Job_Payload:        {}, // se completa después con exportId y storagePrefix
          Job_Progress_Total: total,
          Job_Created_By:     p.userId,
        })
        .select('Job_ID')
        .single();
      if (jobErr) throw new Error(jobErr.message);
      const jobId = (jobInsert as { Job_ID: string }).Job_ID;

      // 4. Crear entrada en TBL_Export_History
      const { data: histInsert, error: histErr } = await supabase
        .from('TBL_Export_History')
        .insert({
          Export_Job_ID:        jobId,
          Export_User_ID:       p.userId,
          Export_Format:        p.format,
          Export_Filters:       fullFilters,
          Export_Columns:       p.selectedColumns,
          Export_Sheet_Per_Tpl: p.sheetPerTemplate,
          Export_Total:         total,
        })
        .select('Export_ID')
        .single();
      if (histErr) throw new Error(histErr.message);
      const exportId = (histInsert as { Export_ID: string }).Export_ID;

      // 5. Path del storage para este export
      const storagePrefix = `${p.userId}/${jobId}`;

      // 6. Completar Job_Payload con todo lo necesario para los chunks
      await supabase.from('TBL_Background_Jobs').update({
        Job_Payload: {
          userId:           p.userId,
          exportId,
          filters:          fullFilters,
          format:           p.format,
          selectedColumns:  p.selectedColumns,
          sheetPerTemplate: p.sheetPerTemplate,
          storagePrefix,
          chunksTotal,
          candidateIds,
        },
      }).eq('Job_ID', jobId);

      // 7. Subir metadata (catálogos) a Storage — se descarga 1 sola vez por el frontend
      const [teamsRes, columnsRes, templatesRes] = await Promise.all([
        supabase.from('TBL_Board_Teams')
          .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
          .order('Board_Team_Sort_Order', { ascending: true }),
        supabase.from('TBL_Board_Columns')
          .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
          .eq('Board_Column_Board_ID', p.boardId)
          .order('Board_Column_Position', { ascending: true }),
        supabase.from('TBL_Requests_Templates')
          .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
          .eq('Request_Template_Board_ID', p.boardId)
          .order('Request_Template_ID', { ascending: true }),
      ]);

      const meta = {
        templates:    templatesRes.data ?? [],
        boardTeams:   teamsRes.data    ?? [],
        boardColumns: columnsRes.data  ?? [],
        meta: {
          totalMatched: total,
          returned:     total,
          truncated:    false,
          maxLimit:     MAX_EXPORT_SIZE,
          generatedAt:  new Date().toISOString(),
          chunksTotal,
        },
      };
      await _uploadExportArtifact(supabase, storagePrefix, 'metadata.json', meta);

      // 8. Disparar primer chunk en background
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(_kickoffExportChunk(jobId));
      } else {
        _kickoffExportChunk(jobId).catch(() => {});
      }

      return { jobId, exportId, total, chunksTotal };
    }

    case 'getExportArtifactUrls': {
      const { jobId, userId } = payload as { jobId: string; userId: number };

      const { data: jobRow, error: jobErr } = await supabase
        .from('TBL_Background_Jobs')
        .select('Job_Status, Job_Payload, Job_Result, Job_Created_By')
        .eq('Job_ID', jobId)
        .single();
      if (jobErr || !jobRow) throw new Error('Export no encontrado.');

      const job = jobRow as {
        Job_Status:    string;
        Job_Payload:   { userId: number; storagePrefix: string; chunksTotal: number; format: string };
        Job_Result:    { fileName?: string } | null;
        Job_Created_By: number;
      };

      // Autorización: solo el creador puede descargar
      if (job.Job_Created_By !== userId && job.Job_Payload.userId !== userId) {
        throw new Error('No autorizado para acceder a este export.');
      }
      if (job.Job_Status !== 'done') {
        throw new Error(`El export aún no está listo (estado: ${job.Job_Status}).`);
      }

      const { storagePrefix, chunksTotal, format } = job.Job_Payload;
      const fileName = job.Job_Result?.fileName ?? 'export';

      // Signed URLs para metadata + todos los chunks
      const filesToSign: string[] = [`${storagePrefix}/metadata.json`];
      for (let i = 1; i <= chunksTotal; i++) {
        filesToSign.push(`${storagePrefix}/chunk_${String(i).padStart(4, '0')}.json`);
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from(EXPORT_BUCKET)
        .createSignedUrls(filesToSign, 600); // 10 min — tiempo suficiente para que el browser descargue todos
      if (signErr) throw new Error(signErr.message);

      return {
        fileName,
        format,
        metadataUrl: (signed?.[0] as { signedUrl: string } | undefined)?.signedUrl ?? null,
        chunkUrls:   (signed ?? []).slice(1).map((s: { signedUrl: string }) => s.signedUrl),
        chunksTotal,
      };
    }

    case 'confirmExportDownloaded': {
      const { exportId, userId } = payload as { jobId: string; exportId: string; userId: number };

      const { data: histRow } = await supabase
        .from('TBL_Export_History')
        .select('Export_User_ID, Export_Download_Count')
        .eq('Export_ID', exportId)
        .single();
      if (!histRow) throw new Error('Entrada de historial no encontrada.');
      const hist = histRow as { Export_User_ID: number; Export_Download_Count: number };
      if (hist.Export_User_ID !== userId) throw new Error('No autorizado.');

      // Solo registramos la descarga — los archivos siguen disponibles
      // hasta que el cron de cleanup (7 días) los elimine, o el usuario
      // elimine manualmente la entrada del historial.
      await supabase.from('TBL_Export_History').update({
        Export_Downloaded_At:  new Date().toISOString(),
        Export_Download_Count: hist.Export_Download_Count + 1,
      }).eq('Export_ID', exportId);

      return { ok: true };
    }

    case 'fetchExportHistory': {
      const { userId, limit = 20 } = payload as { userId: number; limit?: number };
      const { data, error } = await supabase
        .from('TBL_Export_History')
        .select(`
          Export_ID, Export_Job_ID, Export_Format, Export_Filters, Export_Columns,
          Export_Sheet_Per_Tpl, Export_Total, Export_File_Name, Export_Storage_Prefix,
          Export_Status, Export_Error,
          Export_Created_At, Export_Completed_At, Export_Downloaded_At,
          Export_Download_Count, Export_Auto_Delete_At
        `)
        .eq('Export_User_ID', userId)
        .order('Export_Created_At', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'deleteExportHistoryEntry': {
      const { exportId, userId } = payload as { exportId: string; userId: number };
      const { data: hist } = await supabase
        .from('TBL_Export_History')
        .select('Export_User_ID, Export_Storage_Prefix, Export_Job_ID')
        .eq('Export_ID', exportId)
        .single();
      if (!hist) throw new Error('No encontrado.');
      const h = hist as { Export_User_ID: number; Export_Storage_Prefix: string | null; Export_Job_ID: string };
      if (h.Export_User_ID !== userId) throw new Error('No autorizado.');

      if (h.Export_Storage_Prefix) {
        await _cleanupExportArtifacts(supabase, h.Export_Storage_Prefix);
      }
      await supabase.from('TBL_Export_History').delete().eq('Export_ID', exportId);
      // Job es ON DELETE CASCADE → se borra solo? NO: el FK es de Export_Job_ID → Job_ID con ON DELETE CASCADE,
      // así que borrar Export NO borra el Job. Borramos el Job manualmente.
      await supabase.from('TBL_Background_Jobs').delete().eq('Job_ID', h.Export_Job_ID);
      return { ok: true };
    }

    case 'repeatExport': {
      const { exportId, userId } = payload as { exportId: string; userId: number };
      const { data: hist, error: histErr } = await supabase
        .from('TBL_Export_History')
        .select('Export_User_ID, Export_Filters, Export_Format, Export_Columns, Export_Sheet_Per_Tpl')
        .eq('Export_ID', exportId)
        .single();
      if (histErr || !hist) throw new Error('Export original no encontrado.');
      const h = hist as {
        Export_User_ID:        number;
        Export_Filters:        ExportFilters;
        Export_Format:         'xlsx' | 'csv';
        Export_Columns:        string[];
        Export_Sheet_Per_Tpl:  boolean;
      };
      if (h.Export_User_ID !== userId) throw new Error('No autorizado.');

      // Re-llama createExportJob recursivamente con los mismos parámetros
      const { boardId, ...filtersWithoutBoard } = h.Export_Filters;
      return handleAction('createExportJob', {
        userId,
        boardId,
        filters:          filtersWithoutBoard,
        format:           h.Export_Format,
        selectedColumns:  h.Export_Columns,
        sheetPerTemplate: h.Export_Sheet_Per_Tpl,
      }, supabase);
    }

    /* ── Watchdog opcional: relanzar jobs colgados ────────── */
    case 'resumeStalledJob': {
      const { jobId } = payload as { jobId: string };
      const { data: job } = await supabase
        .from('TBL_Background_Jobs')
        .select('Job_Status, Job_Updated_At')
        .eq('Job_ID', jobId)
        .single();
      if (!job) throw new Error('Job no encontrado.');
      if ((job as any).Job_Status === 'done' || (job as any).Job_Status === 'failed') {
        return { resumed: false, status: (job as any).Job_Status };
      }
      // Si lleva más de 60s sin actualizar, relanzamos
      const lastUpdate = new Date((job as any).Job_Updated_At).getTime();
      if (Date.now() - lastUpdate > 60_000) {
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(_kickoffJobChunk(jobId));
        } else {
          _kickoffJobChunk(jobId).catch(() => {});
        }
        return { resumed: true };
      }
      return { resumed: false };
    }

/* ── Export de tickets para Excel/CSV ─────────────────── */
    case 'exportRequests': {
      const p = payload as {
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

      const MAX_LIMIT = 500;
      const limit     = Math.min(p.limit ?? MAX_LIMIT, MAX_LIMIT);

      const emptyResponse = async () => {
        const [teamsRes, columnsRes, templatesRes] = await Promise.all([
          supabase.from('TBL_Board_Teams')
            .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
            .order('Board_Team_Sort_Order', { ascending: true }),
          supabase.from('TBL_Board_Columns')
            .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
            .eq('Board_Column_Board_ID', p.boardId)
            .order('Board_Column_Position', { ascending: true }),
          supabase.from('TBL_Requests_Templates')
            .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
            .eq('Request_Template_Board_ID', p.boardId)
            .order('Request_Template_ID', { ascending: true }),
        ]);
        return {
          tickets:      [],
          templates:    templatesRes.data ?? [],
          boardTeams:   teamsRes.data    ?? [],
          boardColumns: columnsRes.data  ?? [],
          meta: {
            totalMatched: 0,
            returned:     0,
            truncated:    false,
            maxLimit:     MAX_LIMIT,
            generatedAt:  new Date().toISOString(),
          },
        };
      };

      // ── Intersección de IDs por filtros relacionales ──
      let candidateIds: string[] | null = null;
      const intersect = (a: string[] | null, b: string[]): string[] => {
        if (a === null) return b;
        const setB = new Set(b);
        return a.filter((id) => setB.has(id));
      };

      if (p.teamIds && p.teamIds.length > 0) {
        const { data, error } = await supabase
          .from('TBL_Request_Team')
          .select('Request_Team_Request_ID')
          .in('Request_Team_ID', p.teamIds);
        if (error) throw new Error(error.message);
        const ids = [...new Set(((data ?? []) as { Request_Team_Request_ID: string }[]).map((r) => r.Request_Team_Request_ID))];
        candidateIds = intersect(candidateIds, ids);
        if (candidateIds.length === 0) return emptyResponse();
      }

      if (p.sprintIds && p.sprintIds.length > 0) {
        const { data, error } = await supabase
          .from('TBL_Request_Sprint')
          .select('Request_Sprint_Request_ID')
          .in('Request_Sprint_ID', p.sprintIds);
        if (error) throw new Error(error.message);
        const ids = [...new Set(((data ?? []) as { Request_Sprint_Request_ID: string }[]).map((r) => r.Request_Sprint_Request_ID))];
        candidateIds = intersect(candidateIds, ids);
        if (candidateIds.length === 0) return emptyResponse();
      }

      if (p.assignedToIds && p.assignedToIds.length > 0) {
        const { data, error } = await supabase
          .from('TBL_Requests_Assignments')
          .select('Request_Assignment_ID')
          .in('Request_Assignment_User_ID', p.assignedToIds);
        if (error) throw new Error(error.message);
        const ids = [...new Set(((data ?? []) as { Request_Assignment_ID: string }[]).map((r) => r.Request_Assignment_ID))];
        candidateIds = intersect(candidateIds, ids);
        if (candidateIds.length === 0) return emptyResponse();
      }

      if (p.labelIds && p.labelIds.length > 0) {
        const { data, error } = await supabase
          .from('TBL_Request_Labels')
          .select('Request_Labels_Request_ID')
          .in('Request_Labels_Label_ID', p.labelIds);
        if (error) throw new Error(error.message);
        const ids = [...new Set(((data ?? []) as { Request_Labels_Request_ID: string }[]).map((r) => r.Request_Labels_Request_ID))];
        candidateIds = intersect(candidateIds, ids);
        if (candidateIds.length === 0) return emptyResponse();
      }

      // ── Query principal con filtros directos ──
      let countQuery = supabase
        .from('TBL_Requests')
        .select('Request_ID', { count: 'exact', head: true })
        .eq('Request_Board_ID', p.boardId);

      let dataQuery = supabase
        .from('TBL_Requests')
        .select(BASE_SELECT)
        .eq('Request_Board_ID', p.boardId);

      if (candidateIds !== null) {
        countQuery = countQuery.in('Request_ID', candidateIds);
        dataQuery  = dataQuery.in('Request_ID',  candidateIds);
      }
      if (p.columnIds && p.columnIds.length > 0) {
        countQuery = countQuery.in('Request_Board_Column_ID', p.columnIds);
        dataQuery  = dataQuery.in('Request_Board_Column_ID',  p.columnIds);
      }
      if (p.requestedByIds && p.requestedByIds.length > 0) {
        countQuery = countQuery.in('Request_Requested_By', p.requestedByIds);
        dataQuery  = dataQuery.in('Request_Requested_By',  p.requestedByIds);
      }
      if (p.priorityScores && p.priorityScores.length > 0) {
        countQuery = countQuery.in('Request_Score', p.priorityScores);
        dataQuery  = dataQuery.in('Request_Score',  p.priorityScores);
      }
      if (p.templateIds && p.templateIds.length > 0) {
        countQuery = countQuery.in('Request_Template_ID', p.templateIds);
        dataQuery  = dataQuery.in('Request_Template_ID',  p.templateIds);
      }
      if (p.isConfidential !== null && p.isConfidential !== undefined) {
        countQuery = countQuery.eq('Request_Is_Confidential', p.isConfidential);
        dataQuery  = dataQuery.eq('Request_Is_Confidential',  p.isConfidential);
      }
      if (p.dateFrom) {
        countQuery = countQuery.gte('Request_Created_At', p.dateFrom);
        dataQuery  = dataQuery.gte('Request_Created_At',  p.dateFrom);
      }
      if (p.dateTo) {
        countQuery = countQuery.lte('Request_Created_At', p.dateTo);
        dataQuery  = dataQuery.lte('Request_Created_At',  p.dateTo);
      }

      dataQuery = dataQuery
        .order('Request_Created_At', { ascending: false })
        .limit(limit);

      const [countRes, dataRes] = await Promise.all([countQuery, dataQuery]);
      if (countRes.error) throw new Error(countRes.error.message);
      if (dataRes.error)  throw new Error(dataRes.error.message);

      const tickets      = (dataRes.data ?? []) as Record<string, unknown>[];
      const totalMatched = countRes.count ?? tickets.length;
      const truncated    = totalMatched > tickets.length;

      // ── Catálogos para el cliente (resumen + dinamicos) ──
      const [teamsRes, columnsRes, templatesRes] = await Promise.all([
        supabase.from('TBL_Board_Teams')
          .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Sort_Order')
          .order('Board_Team_Sort_Order', { ascending: true }),
        supabase.from('TBL_Board_Columns')
          .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color')
          .eq('Board_Column_Board_ID', p.boardId)
          .order('Board_Column_Position', { ascending: true }),
        supabase.from('TBL_Requests_Templates')
          .select('Request_Template_ID, Request_Template_Name, Request_Template_Icon, Request_Template_Color, Request_Template_Form_Schema')
          .eq('Request_Template_Board_ID', p.boardId)
          .order('Request_Template_ID', { ascending: true }),
      ]);

      return {
        tickets,
        templates:    templatesRes.data ?? [],
        boardTeams:   teamsRes.data    ?? [],
        boardColumns: columnsRes.data  ?? [],
        meta: {
          totalMatched,
          returned:     tickets.length,
          truncated,
          maxLimit:     MAX_LIMIT,
          generatedAt:  new Date().toISOString(),
        },
      };
    }

    default:
      throw new Error(`[API] Acción desconocida: ${action}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return errorResponse('Método no permitido', 405);

  let body: { action: string; payload: Record<string, unknown> };
  try { body = await req.json(); } catch { return errorResponse('Body inválido', 400); }
  if (!body.action) return errorResponse('Campo "action" requerido', 400);

  // ── Bypass público (announcements de login) ───────────────
  if (body.action === 'get_public_announcements') {
    const supabase = createServiceClient();
    const result   = await getPublicAnnouncements(supabase);
    return corsResponse({ data: result });
  }

  // ── Bypass interno: procesamiento de chunks de jobs ───────
  if (body.action === '_processBackgroundJobChunk') {
    const internalSecret = req.headers.get('X-Internal-Job-Secret') ?? '';
    if (!INTERNAL_JOB_SECRET || internalSecret !== INTERNAL_JOB_SECRET) {
      return errorResponse('No autorizado (internal)', 401);
    }
    const supabase = createServiceClient();
    const { jobId } = (body.payload ?? {}) as { jobId: string };
    if (!jobId) return errorResponse('jobId requerido', 400);

    // Procesar en background, devolver la respuesta inmediatamente
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(_processTemplateRenameChunk(jobId, supabase));
    } else {
      _processTemplateRenameChunk(jobId, supabase).catch(() => {});
    }
    return corsResponse({ data: { accepted: true } });
  }
  // ── Bypass interno: procesamiento de chunks de export ─────
  if (body.action === '_processExportJobChunk') {
    const internalSecret = req.headers.get('X-Internal-Job-Secret') ?? '';
    if (!INTERNAL_JOB_SECRET || internalSecret !== INTERNAL_JOB_SECRET) {
      return errorResponse('No autorizado (internal)', 401);
    }
    const supabase = createServiceClient();
    const { jobId } = (body.payload ?? {}) as { jobId: string };
    if (!jobId) return errorResponse('jobId requerido', 400);

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(_processExportChunks(jobId, supabase));
    } else {
      _processExportChunks(jobId, supabase).catch(() => {});
    }
    return corsResponse({ data: { accepted: true } });
  }

  // ── Auth normal Azure ─────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return errorResponse('Token de autorización requerido', 401);

  try { await verifyAzureToken(token); } catch (err) {
    console.error('[API] auth error:', (err as Error).message);
    return errorResponse(`No autorizado: ${(err as Error).message}`, 401);
  }

  const supabase = createServiceClient();
  try {
    const result = await handleAction(body.action, body.payload ?? {}, supabase);
    return corsResponse({ data: result });
  } catch (err) {
    console.error('[API] Error en acción:', body.action, err);
    return errorResponse((err as Error).message, 500);
  }
});