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

/**
 * Pipeline de exportación de tickets (requests) por lotes.
 *
 * Procesa exportaciones grandes en background dividiéndolas en *chunks*: cada
 * invocación de {@link _processExportChunks} genera unos cuantos archivos JSON
 * parciales en Storage y, si queda trabajo, se auto-invoca vía
 * {@link _kickoffExportChunk} para continuar sin exceder los límites de tiempo
 * de una Edge Function.
 *
 * El flujo general es:
 * 1. {@link _resolveExportCandidateIds} — intersecta IDs según filtros relacionales.
 * 2. {@link _resolveOrderedExportIds} / {@link _countExportMatches} — ordena y cuenta.
 * 3. {@link _processExportChunks} — lee, enriquece y sube cada chunk a Storage.
 * 4. {@link _finalizeExportJob} / {@link _failExportJob} — cierra el job y notifica.
 *
 * @remarks
 * Los helpers "anti-escala" evitan dos problemas de Supabase: el truncado
 * silencioso a 1000 filas (se pagina con `.range()`) y las URLs demasiado
 * largas al usar `.in()` con listas grandes (se trocean en lotes).
 *
 * @module export
 */

/* ============================================================
   Helpers anti-escala (URL larga + truncado silencioso)
   ============================================================ */

/**
 * Tamaño de ventana para lecturas grandes con `.range()`.
 *
 * @remarks
 * Supabase corta en 1000 filas por defecto si NO se pagina, así que leemos en
 * ventanas de este tamaño y recolectamos todo con {@link _collectAll}.
 */
const READ_PAGE = 1000;

/** Tamaño de lote para `.in('Request_ID', ...)` en queries livianas (solo IDs). */
const ID_IN_CHUNK = 150;

/**
 * Tamaño de lote para `.in('Request_ID', ...)` cuando el select es `BASE_SELECT`.
 *
 * @remarks
 * El select gigante ya ocupa casi toda la URL, por eso este lote se mantiene
 * pequeño para no superar el límite de longitud de la petición.
 */
const SELECT_IN_CHUNK = 80;

/**
 * Parte un arreglo en sub-arreglos de tamaño fijo.
 *
 * @typeParam T - Tipo de los elementos del arreglo.
 * @param arr - Arreglo a trocear.
 * @param size - Tamaño máximo de cada lote.
 * @returns Arreglo de lotes; el último puede ser más corto.
 */
function _chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Convierte un timestamp a epoch en milisegundos, asumiendo UTC.
 *
 * @remarks
 * Si el valor no termina en `Z`, se le añade para forzar interpretación UTC.
 * Valores vacíos o inválidos devuelven `0`, lo que los ordena al final.
 *
 * @param v - Valor a parsear (normalmente un string ISO).
 * @returns Epoch en ms, o `0` si el valor es vacío o no es una fecha válida.
 */
function _parseTs(v: unknown): number {
  const s = String(v ?? '');
  if (!s) return 0;
  const t = new Date(s.endsWith('Z') ? s : `${s}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Recolecta TODAS las filas de una lectura potencialmente grande, paginando con
 * `.range()` en ventanas de {@link READ_PAGE}. Evita el truncado silencioso a
 * 1000 filas.
 *
 * @typeParam T - Tipo de fila devuelto por la consulta.
 * @param build - Fábrica que construye la consulta para el rango `[from, to]`
 *   y devuelve `{ data, error }`.
 * @returns Todas las filas concatenadas de todas las páginas.
 * @throws Si alguna página devuelve error de Supabase.
 */
async function _collectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    const { data, error } = await build(from, from + READ_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < READ_PAGE) break;
    from += READ_PAGE;
  }
  return all;
}

/**
 * Resuelve la intersección de IDs candidatos según los filtros relacionales
 * (equipo, sprint, asignado, etiqueta), paginando cada lectura.
 *
 * @remarks
 * Cada filtro relacional presente aporta un conjunto de `Request_ID` y se
 * intersecta con los anteriores. Si algún paso deja la intersección vacía se
 * corta temprano devolviendo `[]`. Un retorno `null` significa que no se aplicó
 * ningún filtro relacional (sin restricción por IDs).
 *
 * @param supabase - Cliente de Supabase.
 * @param filters - Filtros de exportación; se leen las propiedades relacionales.
 * @returns Lista de IDs candidatos, `[]` si la intersección es vacía, o `null`
 *   si no hay filtros relacionales.
 * @throws Si alguna de las lecturas paginadas falla.
 */
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
    const rows = await _collectAll<{ Request_Team_Request_ID: string }>((from, to) =>
      supabase.from('TBL_Request_Team')
        .select('Request_Team_Request_ID')
        .in('Request_Team_ID', filters.teamIds!)
        .range(from, to));
    candidateIds = intersect(candidateIds, [...new Set(rows.map((r) => r.Request_Team_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.sprintIds && filters.sprintIds.length > 0) {
    const rows = await _collectAll<{ Request_Sprint_Request_ID: string }>((from, to) =>
      supabase.from('TBL_Request_Sprint')
        .select('Request_Sprint_Request_ID')
        .in('Request_Sprint_ID', filters.sprintIds!)
        .range(from, to));
    candidateIds = intersect(candidateIds, [...new Set(rows.map((r) => r.Request_Sprint_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.assignedToIds && filters.assignedToIds.length > 0) {
    const rows = await _collectAll<{ Request_Assignment_ID: string }>((from, to) =>
      supabase.from('TBL_Requests_Assignments')
        .select('Request_Assignment_ID')
        .in('Request_Assignment_User_ID', filters.assignedToIds!)
        .range(from, to));
    candidateIds = intersect(candidateIds, [...new Set(rows.map((r) => r.Request_Assignment_ID))]);
    if (candidateIds.length === 0) return [];
  }

  if (filters.labelIds && filters.labelIds.length > 0) {
    const rows = await _collectAll<{ Request_Labels_Request_ID: string }>((from, to) =>
      supabase.from('TBL_Request_Labels')
        .select('Request_Labels_Request_ID')
        .in('Request_Labels_Label_ID', filters.labelIds!)
        .range(from, to));
    candidateIds = intersect(candidateIds, [...new Set(rows.map((r) => r.Request_Labels_Request_ID))]);
    if (candidateIds.length === 0) return [];
  }

  return candidateIds;
}

/**
 * Aplica únicamente los filtros escalares (sin `board` ni `Request_ID in`).
 *
 * @remarks
 * Cubre columna, solicitante, prioridad, plantilla, confidencialidad y rango de
 * fechas de creación. Es el bloque de filtros común a varias consultas.
 *
 * @typeParam Q - Query builder encadenable de Supabase.
 * @param query - Consulta base sobre la que encadenar los filtros.
 * @param filters - Filtros de exportación; solo se usan las propiedades escalares.
 * @returns La misma consulta con los filtros escalares aplicados.
 */
function _applyScalarFilters<Q extends { eq: (k: string, v: unknown) => Q; in: (k: string, v: unknown[]) => Q; gte: (k: string, v: unknown) => Q; lte: (k: string, v: unknown) => Q }>(
  query: Q,
  filters: ExportFilters,
): Q {
  let q = query;
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

/**
 * Aplica los filtros directos: board, `Request_ID in` (si hay candidatos) y escalares.
 *
 * @typeParam Q - Query builder encadenable de Supabase.
 * @param query - Consulta base sobre `TBL_Requests`.
 * @param filters - Filtros de exportación.
 * @param candidateIds - IDs candidatos a restringir, o `null` para no filtrar por ID.
 * @returns La consulta con board + IDs + escalares aplicados.
 */
function _applyExportDirectFilters<Q extends { eq: (k: string, v: unknown) => Q; in: (k: string, v: unknown[]) => Q; gte: (k: string, v: unknown) => Q; lte: (k: string, v: unknown) => Q }>(
  query: Q,
  filters: ExportFilters,
  candidateIds: string[] | null,
): Q {
  let q = query.eq('Request_Board_ID', filters.boardId);
  if (candidateIds !== null) q = q.in('Request_ID', candidateIds);
  return _applyScalarFilters(q, filters);
}

/**
 * Resuelve la lista FINAL de IDs, ordenada por fecha de creación descendente y
 * filtrada por escalares, a partir de los `candidateIds` relacionales.
 *
 * @remarks
 * Trocea el `.in()` en lotes de {@link ID_IN_CHUNK} para mantener la URL corta,
 * y ordena en memoria porque los lotes llegan sin orden garantizado.
 *
 * @param supabase - Cliente de Supabase.
 * @param filters - Filtros de exportación (se usa `boardId` y los escalares).
 * @param candidateIds - IDs candidatos ya intersectados.
 * @returns IDs ordenados por fecha desc. `[]` si no hay candidatos.
 * @throws Si alguna consulta por lote falla.
 */
export async function _resolveOrderedExportIds(
  supabase:     DB,
  filters:      ExportFilters,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const collected: { id: string; ts: number }[] = [];

  for (const batch of _chunk(candidateIds, ID_IN_CHUNK)) {
    let q = supabase
      .from('TBL_Requests')
      .select('Request_ID, Request_Created_At')
      .eq('Request_Board_ID', filters.boardId)
      .in('Request_ID', batch);
    q = _applyScalarFilters(q, filters);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { Request_ID: string; Request_Created_At: string | null }[]) {
      collected.push({ id: r.Request_ID, ts: _parseTs(r.Request_Created_At) });
    }
  }

  collected.sort((a, b) => b.ts - a.ts);
  return collected.map((r) => r.id);
}

/**
 * Cuenta cuántos tickets coinciden con los filtros.
 *
 * @remarks
 * Usa `count: 'exact'` con `head: true` (no trae filas). Si hay `candidateIds`,
 * los cuenta por lotes disjuntos y suma sin doble conteo.
 *
 * @param supabase - Cliente de Supabase.
 * @param filters - Filtros de exportación.
 * @param candidateIds - IDs candidatos, o `null` para contar sin restricción por ID.
 * @returns Número total de tickets que coinciden. `0` si `candidateIds` es `[]`.
 * @throws Si alguna consulta de conteo falla.
 */
export async function _countExportMatches(
  supabase:    DB,
  filters:     ExportFilters,
  candidateIds: string[] | null,
): Promise<number> {
  if (candidateIds !== null && candidateIds.length === 0) return 0;

  if (candidateIds === null) {
    const base = supabase.from('TBL_Requests').select('Request_ID', { count: 'exact', head: true });
    const { count, error } = await _applyExportDirectFilters(base, filters, null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let total = 0; // lotes disjuntos → suma sin double-count
  for (const batch of _chunk(candidateIds, ID_IN_CHUNK)) {
    const base = supabase.from('TBL_Requests').select('Request_ID', { count: 'exact', head: true });
    const { count, error } = await _applyExportDirectFilters(base, filters, batch);
    if (error) throw new Error(error.message);
    total += count ?? 0;
  }
  return total;
}

/**
 * Sube un objeto como archivo JSON al bucket de exports (con `upsert`).
 *
 * @param supabase - Cliente de Supabase.
 * @param storagePath - Prefijo/carpeta dentro del bucket.
 * @param fileName - Nombre del archivo a crear.
 * @param jsonObject - Contenido a serializar como JSON.
 * @throws Si la subida a Storage falla.
 */
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

/**
 * Descarga y parsea el artifact `candidate_ids.json` desde Storage.
 *
 * @param supabase - Cliente de Supabase.
 * @param path - Ruta completa del archivo dentro del bucket de exports.
 * @returns La lista de IDs (`ids`) del JSON, o `[]` si no está presente.
 * @throws Si el archivo no se puede leer.
 */
async function _downloadCandidateIds(supabase: DB, path: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(EXPORT_BUCKET).download(path);
  if (error || !data) throw new Error(`No se pudo leer candidate_ids.json: ${error?.message ?? 'sin datos'}`);
  const text   = await data.text();
  const parsed = JSON.parse(text) as { ids?: string[] };
  return parsed.ids ?? [];
}

/**
 * Auto-invoca el procesamiento del siguiente chunk del export.
 *
 * @remarks
 * Hace un `fetch` a la propia función ({@link SELF_URL}) con la acción
 * `_processExportJobChunk`. Los errores se ignoran a propósito: si la petición
 * queda colgada, el watchdog reintenta.
 *
 * @param jobId - ID del job de background a continuar.
 */
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

/**
 * Marca el job como `done`, envía la notificación al usuario y actualiza el historial.
 *
 * @param supabase - Cliente de Supabase.
 * @param jobId - ID del job de background.
 * @param exportId - ID de la entrada en `TBL_Export_History`.
 * @param userId - Usuario destinatario de la notificación.
 * @param totalChunks - Número final de chunks generados.
 * @param totalTickets - Total de tickets procesados.
 * @param format - Formato de exportación (p. ej. `xlsx` o `csv`).
 * @param fileName - Nombre del archivo final.
 * @param prefix - Prefijo de Storage donde quedaron los artifacts.
 */
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

/**
 * Marca el job y su entrada de historial como `failed`.
 *
 * @param supabase - Cliente de Supabase.
 * @param jobId - ID del job de background.
 * @param exportId - ID de la entrada en `TBL_Export_History`.
 * @param error - Mensaje de error a persistir.
 */
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

/**
 * Procesa hasta {@link EXPORT_MAX_CHUNKS_PER_INVOKE} chunks consecutivos del export.
 *
 * @remarks
 * Punto de entrada del procesamiento en background. Lee el job, transiciona su
 * estado (`pending` → `running`), y por cada chunk:
 * - Con filtros relacionales: usa `orderedIds` (ya ordenados y filtrados),
 *   toma una porción, lee `BASE_SELECT` troceando el `.in()`, y re-ordena por
 *   fecha desc porque el `.in()` no preserva el orden.
 * - Sin filtros relacionales: pagina directo con `.range()` sobre `TBL_Requests`.
 *
 * Cada chunk se enriquece con {@link attachCriteriaSummary}, se sube como
 * `chunk_NNNN.json` y se actualiza el progreso. Si el trabajo no terminó, se
 * auto-invoca ({@link _kickoffExportChunk}); si terminó, se finaliza. Cualquier
 * excepción marca el job como fallido. Sale temprano si el job no existe, ya
 * está `done`/`failed`, o no es de tipo `export_requests`.
 *
 * @param jobId - ID del job de background a procesar.
 * @param supabase - Cliente de Supabase.
 */
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
      userId:            number;
      exportId:          string;
      filters:           ExportFilters;
      format:            'xlsx' | 'csv';
      selectedColumns:   string[];
      sheetPerTemplate:  boolean;
      storagePrefix:     string;
      chunksTotal:       number;
      candidateIdsPath:  string | null;
      candidateCount:    number | null;
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
  const {
    filters, candidateIdsPath, candidateCount,
    storagePrefix, chunksTotal, exportId, userId, format,
  } = job.Job_Payload;

  try {
    // Si hay filtros relacionales, bajamos la lista ordenada UNA vez por invocación.
    const orderedIds: string[] | null = candidateIdsPath
      ? await _downloadCandidateIds(supabase, candidateIdsPath)
      : null;

    for (let chunkNum = 0; chunkNum < EXPORT_MAX_CHUNKS_PER_INVOKE; chunkNum++) {
      const chunkIndex = Math.floor(processed / EXPORT_JOB_CHUNK_SIZE);
      if (chunkIndex >= chunksTotal) break;

      let enriched: Record<string, unknown>[];
      let advance:  number;
      let pageWasFull: boolean;

      if (orderedIds !== null) {
        // ── Camino con filtros relacionales ──────────────────────
        // orderedIds ya está ordenado (fecha desc) y filtrado por escalares.
        const slice = orderedIds.slice(processed, processed + EXPORT_JOB_CHUNK_SIZE);
        if (slice.length === 0) break;

        const rows: Record<string, unknown>[] = [];
        for (const sub of _chunk(slice, SELECT_IN_CHUNK)) {
          const { data, error } = await supabase
            .from('TBL_Requests')
            .select(BASE_SELECT)
            .eq('Request_Board_ID', filters.boardId)
            .in('Request_ID', sub);
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as Record<string, unknown>[]));
        }
        // El .in() no garantiza orden → re-ordenamos por fecha desc.
        rows.sort((a, b) => _parseTs(b.Request_Created_At) - _parseTs(a.Request_Created_At));

        enriched    = await attachCriteriaSummary(rows, supabase);
        advance     = slice.length;                          // avanza por intentados → resume estable
        pageWasFull = slice.length === EXPORT_JOB_CHUNK_SIZE;
      } else {
        // ── Camino sin filtros relacionales (idéntico a antes) ───
        const base = supabase
          .from('TBL_Requests')
          .select(BASE_SELECT)
          .order('Request_Created_At', { ascending: false })
          .range(processed, processed + EXPORT_JOB_CHUNK_SIZE - 1);
        const { data: tickets, error: fetchErr } = await _applyExportDirectFilters(base, filters, null);
        if (fetchErr) throw new Error(fetchErr.message);

        enriched    = await attachCriteriaSummary((tickets ?? []) as Record<string, unknown>[], supabase);
        advance     = enriched.length;
        pageWasFull = enriched.length === EXPORT_JOB_CHUNK_SIZE;
      }

      const chunkFileName = `chunk_${String(chunkIndex + 1).padStart(4, '0')}.json`;
      await _uploadExportArtifact(supabase, storagePrefix, chunkFileName, { tickets: enriched });

      processed += advance;

      await supabase.from('TBL_Background_Jobs').update({
        Job_Progress_Current: processed,
        Job_Updated_At:       new Date().toISOString(),
      }).eq('Job_ID', jobId);

      if (!pageWasFull) break;
    }

    const finalChunkIndex = Math.floor(processed / EXPORT_JOB_CHUNK_SIZE);
    const isComplete =
      finalChunkIndex >= chunksTotal ||
      processed >= job.Job_Progress_Total ||
      (candidateCount !== null && processed >= candidateCount);

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

/**
 * Elimina todos los artifacts de Storage asociados a un export.
 *
 * @remarks
 * Los errores se ignoran a propósito: si algo queda sin borrar, un cron de
 * limpieza lo recogerá más adelante.
 *
 * @param supabase - Cliente de Supabase.
 * @param storagePrefix - Prefijo/carpeta cuyos archivos se van a eliminar.
 */
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