import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { SELF_URL, INTERNAL_JOB_SECRET, JOB_CHUNK_SIZE, JOB_MAX_CHUNKS_PER_INVOKE } from '../config.ts';
// @ts-ignore
import { _renameKeysInFormData, _renameKeysInSchema } from '../shared/templateKeys.ts';

/**
 * Job en background para renombrar claves de campos de una plantilla.
 *
 * Cuando se renombra un campo de una plantilla, hay que propagar el cambio a
 * todos los requests que usan esa plantilla: tanto en su `Request_Form_Data`
 * como en el snapshot de esquema `Request_Template_Schema_Snapshot`. Como pueden
 * ser muchos, el trabajo se procesa por *chunks*: cada invocación de
 * {@link _processTemplateRenameChunk} actualiza unos cuantos requests y, si
 * quedan más, se auto-invoca vía {@link _kickoffJobChunk} para no exceder el
 * tiempo de una Edge Function. Al terminar, {@link _finalizeRenameJob} cierra el
 * job y deja auditoría.
 *
 * @module templateRename
 */

/* ── Self-invoke para procesar el siguiente chunk ───────── */

/**
 * Auto-invoca el procesamiento del siguiente chunk del job.
 *
 * @remarks
 * Hace un `fetch` a la propia función ({@link SELF_URL}) con la acción
 * `_processBackgroundJobChunk`. Los errores se ignoran a propósito: si queda
 * colgado, se reintenta en el próximo poll.
 *
 * @param jobId - ID del job de background a continuar.
 */
export async function _kickoffJobChunk(jobId: string): Promise<void> {
  try {
    await fetch(SELF_URL, {
      method: 'POST',
      headers: {
        'Content-Type':          'application/json',
        'X-Internal-Job-Secret': INTERNAL_JOB_SECRET,
      },
      body: JSON.stringify({
        action:  '_processBackgroundJobChunk',
        payload: { jobId },
      }),
    });
  } catch (_e) { /* silent — se reintentará en próximo poll si quedó colgado */ }
}

/* ── Marca el job como done y escribe auditoría ─────────── */

/**
 * Marca el job como `done`, persiste el resultado y escribe la auditoría de renombres.
 *
 * @remarks
 * Inserta una fila en `TBL_Template_Field_Renames` por cada renombre, registrando
 * quién lo hizo, cuándo y cuántos requests se vieron afectados.
 *
 * @param supabase - Cliente de Supabase.
 * @param jobId - ID del job de background.
 * @param processed - Total de requests procesados (afectados).
 * @param payload - Datos del job: `templateId`, lista de `renames`
 *   (`oldKey` → `newKey`) y `renamedBy` (usuario que originó el cambio).
 */
export async function _finalizeRenameJob(
  supabase: DB,
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

/**
 * Procesa hasta {@link JOB_MAX_CHUNKS_PER_INVOKE} chunks del renombrado; si
 * quedan más requests, se auto-invoca.
 *
 * @remarks
 * Punto de entrada del procesamiento en background. Lee el job, transiciona su
 * estado (`pending` → `running`) y arma un mapa `oldKey → newKey`. Por cada
 * chunk lee un lote de {@link JOB_CHUNK_SIZE} requests de la plantilla
 * (ordenados por `Request_ID` y paginados con `.range()`), reescribe sus claves
 * en `Request_Form_Data` ({@link _renameKeysInFormData}) y en el snapshot de
 * esquema ({@link _renameKeysInSchema}), y persiste el progreso.
 *
 * Termina y finaliza ({@link _finalizeRenameJob}) cuando un lote llega vacío o
 * es más corto que el tamaño de chunk. Si se alcanza el techo de chunks por
 * invocación sin terminar, continúa vía {@link _kickoffJobChunk}. Cualquier
 * excepción marca el job como `failed`. Sale temprano si el job no existe, ya
 * está `done`/`failed`, o no es de tipo `template_field_rename`.
 *
 * @param jobId - ID del job de background a procesar.
 * @param supabase - Cliente de Supabase.
 */
export async function _processTemplateRenameChunk(
  jobId: string,
  supabase: DB,
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