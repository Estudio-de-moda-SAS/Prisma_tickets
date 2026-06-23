import type { DB } from '../lib/supabase.ts';
import type { ExportFilters } from '../shared/types.ts';
import {
  EXPORT_BUCKET, EXPORT_JOB_CHUNK_SIZE, EXPORT_MAX_CHUNKS_PER_INVOKE,
  SELF_URL, INTERNAL_JOB_SECRET,
// @ts-ignore
} from '../config.ts';
// @ts-ignore
import { BASE_SELECT } from '../shared/selects.ts';
// @ts-ignore
import { attachCriteriaSummary } from '../shared/criteria.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';

/** Resuelve la intersección de IDs candidatos según filtros relacionales */
export async function _resolveExportCandidateIds(
  supabase: DB,
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
export async function _countExportMatches(
  supabase:    DB,
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
export async function _uploadExportArtifact(
  supabase:    DB,
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
export async function _kickoffExportChunk(jobId: string): Promise<void> {
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
  supabase:  DB,
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

  await supabase.from('TBL_Background_Jobs').update({
    Job_Status:           'done',
    Job_Progress_Current: totalTickets,
    Job_Result:           {
      exportId, totalChunks, totalTickets, storagePrefix: prefix, fileName, format,
    },
    Job_Updated_At:       completedAt,
    Job_Completed_At:     completedAt,
  }).eq('Job_ID', jobId);

  await supabase.from('TBL_Export_History').update({
    Export_Status:         'done',
    Export_File_Name:      fileName,
    Export_Storage_Prefix: prefix,
    Export_Completed_At:   completedAt,
  }).eq('Export_ID', exportId);

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
  supabase: DB,
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
export async function _processExportChunks(
  jobId:    string,
  supabase: DB,
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
      candidateIds:     string[] | null;
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

      if (enriched.length < EXPORT_JOB_CHUNK_SIZE) break;
    }

    const finalChunkIndex = Math.floor(processed / EXPORT_JOB_CHUNK_SIZE);
    const isComplete = finalChunkIndex >= chunksTotal || processed >= job.Job_Progress_Total;

    if (isComplete) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
      const ext   = format === 'xlsx' ? 'xlsx' : 'zip';
      const fileName = `PRISMA_export_${stamp}.${ext}`;
      await _finalizeExportJob(supabase, jobId, exportId, userId, finalChunkIndex, processed, format, fileName, storagePrefix);
    } else {
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
export async function _cleanupExportArtifacts(
  supabase: DB,
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