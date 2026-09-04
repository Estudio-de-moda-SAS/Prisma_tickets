/**
 * Handlers de migración de solicitudes históricas (Excel → PRISMA).
 *
 * Registrados en {@link migrationHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Las acciones son **atómicas**
 * (una solicitud por llamada); el orquestador del lote —chunking y reintentos—
 * vive en el script Node externo (*PRISMA Migrations*), no acá.
 *
 * A diferencia del flujo normal de creación, estos handlers reciben
 * `Created_At`/`Finished_At`/`Progress` explícitos, permiten `Requested_By`
 * nulo con campos legacy, insertan asignados directo (sin resolver por nombre),
 * y **no** ejecutan automatizaciones, notificaciones ni auto-asignación de
 * sprint.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { BASE_SELECT } from '../shared/selects.ts';

/* ============================================================
   Migración de solicitudes históricas (Excel → Prisma)
   ------------------------------------------------------------
   Acciones expuestas (atómicas, una solicitud por llamada).
   El orquestador del lote, chunking y reintentos vive en el
   script Node externo, NO aquí.

   A diferencia de createRequest, este handler:
     · Recibe Created_At / Finished_At / Progress explícitos.
     · Permite Requested_By = null + campos legacy.
     · Inserta asignados directo (sin resolver por nombre).
     · NO ejecuta automatizaciones.
     · NO inserta notificaciones.
     · NO auto-asigna sprint.
   ============================================================ */

/** Autor de los comentarios migrados ("Notas"). Usuario de sistema. */
const MIGRATION_COMMENT_USER_ID = 17;

/**
 * Pool de colores para labels nuevos creados durante la migración.
 *
 * Espejo de los `COLORS` del ConfigPanel del front.
 */
const LABEL_COLORS = [
  '#ff4757', '#ff6b81', '#ff7f50', '#fdcb6e', '#f9ca24', '#a3cb38',
  '#00e5a0', '#00cec9', '#00c8ff', '#0984e3', '#6c5ce7', '#a29bfe',
  '#fd79a8', '#e84393', '#b2bec3', '#000000',
];

/**
 * Pool de emojis para labels nuevos creados durante la migración.
 *
 * Espejo de los `EMOJIS` del ConfigPanel del front: son emojis (no íconos
 * Lucide), así que siempre son válidos.
 */
const LABEL_EMOJIS = [
  '🐛', '🎨', '🖼️', '📊', '⚙️', '🔧', '🚀', '💡', '📋', '🔒', '🌐', '📱',
  '💰', '🔔', '✅', '🧪', '🎯', '🏷️', '🛠️', '🏪', '📦', '🔍', '💬', '🗂️',
];

/**
 * Devuelve un elemento aleatorio de un arreglo.
 *
 * @typeParam T - Tipo de los elementos del arreglo.
 * @param arr - Arreglo de origen (se asume no vacío).
 * @returns Un elemento elegido al azar.
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Mapa de handlers de migración indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const migrationHandlers: Record<string, ActionHandler> = {
  /**
   * Resuelve un sprint por texto exacto, creándolo si no existe.
   *
   * Busca por `Sprint_Text` exacto (el de menor ID si hubiera repetidos). Si no
   * existe, lo crea con fechas de inicio/fin en null.
   *
   * @param payload - `{ text }`.
   * @returns `{ sprintId, created }` — `created` indica si se insertó uno nuevo.
   * @throws Si el texto del sprint viene vacío.
   */
  upsertSprintByName: async (payload, { supabase }) => {
    const { text } = payload as { text: string };
    const clean = text.trim();
    if (!clean) throw new Error('upsertSprintByName: texto de sprint vacío');

    const { data: existing, error: selErr } = await supabase
      .from('TBL_Sprint')
      .select('Sprint_ID')
      .eq('Sprint_Text', clean)
      .order('Sprint_ID', { ascending: true })
      .limit(1);
    if (selErr) throw new Error(selErr.message);

    if (existing && existing.length > 0) {
      return { sprintId: (existing[0] as { Sprint_ID: number }).Sprint_ID, created: false };
    }

    const { data: inserted, error: insErr } = await supabase
      .from('TBL_Sprint')
      .insert({ Sprint_Text: clean, Sprint_Start_Date: null, Sprint_End_Date: null })
      .select('Sprint_ID')
      .single();
    if (insErr) throw new Error(insErr.message);

    return { sprintId: (inserted as { Sprint_ID: number }).Sprint_ID, created: true };
  },

  /**
   * Resuelve un label por (nombre, equipo, board), creándolo si no existe.
   *
   * Dentro de un equipo el nombre es único, así que el match es determinista.
   * Si no existe en ESE equipo, crea uno nuevo con emoji y color aleatorios del
   * pool —aunque exista el mismo nombre en otro equipo.
   *
   * @param payload - `{ name, teamId, boardId }`.
   * @returns `{ labelId, created }` — `created` indica si se insertó uno nuevo.
   * @throws Si el nombre del label viene vacío.
   */
  upsertLabelByName: async (payload, { supabase }) => {
    const { name, teamId, boardId } = payload as {
      name: string; teamId: number; boardId: number;
    };
    const clean = name.trim();
    if (!clean) throw new Error('upsertLabelByName: nombre de label vacío');

    const { data: existing, error: selErr } = await supabase
      .from('TBL_Labels')
      .select('Label_ID')
      .eq('Label_Name', clean)
      .eq('Label_Team_ID', teamId)
      .eq('Label_Board_ID', boardId)
      .order('Label_ID', { ascending: true })
      .limit(1);
    if (selErr) throw new Error(selErr.message);

    if (existing && existing.length > 0) {
      return { labelId: (existing[0] as { Label_ID: number }).Label_ID, created: false };
    }

    const { data: inserted, error: insErr } = await supabase
      .from('TBL_Labels')
      .insert({
        Label_Board_ID: boardId,
        Label_Name:     clean,
        Label_Color:    pickRandom(LABEL_COLORS),
        Label_Icon:     pickRandom(LABEL_EMOJIS),
        Label_Team_ID:  teamId,
      })
      .select('Label_ID')
      .single();
    if (insErr) throw new Error(insErr.message);

    return { labelId: (inserted as { Label_ID: number }).Label_ID, created: true };
  },

  /**
   * Lista usuarios para resolver "Asignada" → `User_ID` en el script.
   *
   * Devuelve todos los usuarios, incluidos los inactivos, para que los
   * asignados históricos hagan match aunque hoy estén desactivados.
   *
   * @returns Lista de `{ User_ID, User_Name }`.
   */
  migrationFetchUsers: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Name');
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Crea UNA solicitud histórica con todas sus relaciones.
   *
   * Idempotente por la dupla `(sourceFile, sourceRow)` vía `TBL_Migration_Map`:
   * si la fila ya fue migrada, retorna temprano con `skipped: true`. Flujo:
   *
   * 1. Chequea idempotencia contra `TBL_Migration_Map`.
   * 2. Toma el snapshot del esquema de la plantilla (general = `[]`).
   * 3. Inserta la solicitud como legacy (`Request_ID` lo genera el DEFAULT;
   *    `Requested_By` nulo, requester textual en `Request_Legacy_Requester`).
   * 4. Inserta en paralelo las relaciones (equipos, labels, sprint), los
   *    asignados y la nota migrada (comentario del usuario de sistema).
   * 5. Registra el mapeo **al final**: si algún paso previo falló, la fila no
   *    queda marcada como migrada y el reintento la reprocesa.
   * 6. Devuelve la solicitud completa vía `BASE_SELECT` (mismo contrato que el
   *    flujo normal).
   *
   * @param payload - Datos completos de la fila histórica: identificación de
   *                  origen, campos del ticket, fechas/progreso explícitos y las
   *                  relaciones ya resueltas por el script.
   * @returns `{ skipped, requestId, request? }` — `skipped: true` si ya estaba
   *          migrada; con `request` incluido cuando se crea.
   */
  migrateRequest: async (payload, { supabase }) => {
    const p = payload as {
      sourceFile: string;
      sourceRow:  number;
      boardId:    number;
      columnId:   number;
      templateId: number;
      titulo:     string;
      descripcion:     string | null;
      score:           number | null;
      isConfidential:  boolean;
      createdAt:       string | null;   // ISO UTC ya normalizado por el script
      finishedAt:      string | null;   // ISO UTC
      progress:        number;          // 0 o 100
      estimatedHours:  number | null;
      loggedHours:     number | null;
      legacyRequester: string | null;   // texto crudo de "Equipo solicitante"
      teamIds:         number[];        // equipo destino → TBL_Request_Team
      labelIds:        number[];        // labels ya resueltos
      sprintId:        number | null;   // sprint ya resuelto
      assigneeIds:     number[];        // usuarios ya resueltos ("Asignada")
      note:            string | null;   // "Notas" → comentario del user 17
      formData?:       Record<string, unknown>; // datos extra (template Migraciones)
    };

    // ── 1. Idempotencia: ¿ya se migró esta fila? ─────────────
    const { data: already, error: mapErr } = await supabase
      .from('TBL_Migration_Map')
      .select('Request_ID')
      .eq('Source_File', p.sourceFile)
      .eq('Source_Row', p.sourceRow)
      .limit(1);
    if (mapErr) throw new Error(mapErr.message);

    if (already && already.length > 0) {
      return {
        skipped:   true,
        requestId: (already[0] as { Request_ID: string }).Request_ID,
      };
    }

    // ── 2. Snapshot del esquema de la plantilla (general = []) ─
    const { data: tplData } = await supabase
      .from('TBL_Requests_Templates')
      .select('Request_Template_Form_Schema')
      .eq('Request_Template_ID', p.templateId)
      .single();
    const schemaSnapshot = tplData?.Request_Template_Form_Schema ?? [];

    // ── 3. Insertar la solicitud (Request_ID lo genera el DEFAULT) ─
    const { data: inserted, error: insErr } = await supabase
      .from('TBL_Requests')
      .insert({
        Request_Board_ID:                 p.boardId,
        Request_Board_Column_ID:          p.columnId,
        Request_Requested_By:             null,            // legacy → sin usuario
        Request_Is_Legacy:                true,
        Request_Legacy_Requester:         p.legacyRequester ?? null,
        Request_Template_ID:              p.templateId,
        Request_Title:                    p.titulo,
        Request_Description:              p.descripcion ?? null,
        Request_Score:                    p.score ?? null,
        Request_Progress:                 p.progress,
        Request_Created_At:               p.createdAt ?? null,
        Request_Finished_At:              p.finishedAt ?? null,
        Request_Estimated_Hours:          p.estimatedHours ?? null,
        Request_Logged_Hours:             p.loggedHours ?? null,
        Request_Is_Confidential:          p.isConfidential ?? false,
        Request_Form_Data:                p.formData ?? {},
        Request_Template_Schema_Snapshot: schemaSnapshot,
        Request_Parent_ID:                null,
        Request_Requester_Team_ID:        null,
        Request_Requester_Department_ID:  null,
      })
      .select('Request_ID')
      .single();
    if (insErr) throw new Error(insErr.message);
    const newId = (inserted as { Request_ID: string }).Request_ID;

    // ── 4. Relaciones (junction) + asignados + nota ───────────
    const assignAt = p.createdAt ?? new Date().toISOString();
    const ops: Promise<unknown>[] = [];

    if (p.teamIds.length > 0)
      ops.push(supabase.from('TBL_Request_Team').insert(
        p.teamIds.map((tid) => ({ Request_Team_Request_ID: newId, Request_Team_ID: tid })),
      ));

    if (p.labelIds.length > 0)
      ops.push(supabase.from('TBL_Request_Labels').insert(
        p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid })),
      ));

    if (p.sprintId !== null)
      ops.push(supabase.from('TBL_Request_Sprint').insert(
        { Request_Sprint_Request_ID: newId, Request_Sprint_ID: p.sprintId },
      ));

    if (p.assigneeIds.length > 0)
      ops.push(supabase.from('TBL_Requests_Assignments').insert(
        p.assigneeIds.map((uid) => ({
          Request_Assignment_ID:      newId,
          Request_Assignment_User_ID: uid,
          Request_Assignment_At:      assignAt,
        })),
      ));

    const noteText = (p.note ?? '').trim();
    if (noteText)
      ops.push(supabase.from('TBL_Comments').insert({
        Comment_Request_ID: newId,
        Comment_User_ID:    MIGRATION_COMMENT_USER_ID,
        Comment_Text:       noteText,
        Comment_Created_At: assignAt,
      }));

    await Promise.all(ops);

    // ── 5. Registrar el mapeo (idempotencia / rollback) ───────
    // Va al final: si algo de arriba falló, esta fila NO queda
    // marcada como migrada y el reintento la reprocesa.
    const { error: mapInsErr } = await supabase
      .from('TBL_Migration_Map')
      .insert({ Source_File: p.sourceFile, Source_Row: p.sourceRow, Request_ID: newId });
    if (mapInsErr) throw new Error(mapInsErr.message);

    // ── 6. Devolver la solicitud completa (mismo contrato) ────
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', newId).single();
    if (error) throw new Error(error.message);

    return { skipped: false, requestId: newId, request: data };
  },
};