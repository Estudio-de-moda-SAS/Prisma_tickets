/**
 * Handlers de sistema: reportes de bugs, calificaciones de satisfacción y jobs.
 *
 * Registrados en {@link systemHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Agrupa funciones transversales:
 * el ciclo de vida de los reportes de fallos (incluida su conversión en ticket),
 * las calificaciones de satisfacción con rate limit, y el sondeo/reanudación de
 * jobs en background.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { RATING_RATE_LIMIT_DAYS } from '../config.ts';
// @ts-ignore
import { _kickoffJobChunk } from '../jobs/renameJob.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';

/**
 * Mapa de handlers de sistema indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const systemHandlers: Record<string, ActionHandler> = {
  /**
   * Crea un reporte de bug y notifica al equipo de Desarrollo TI.
   *
   * Inserta el reporte en estado `pendiente` y, best-effort, notifica a los
   * integrantes de los sub-equipos del board team de Desarrollo TI (ID 11),
   * excluyendo al reportante. Un fallo en la notificación no tumba la creación
   * del reporte.
   *
   * @param payload - `{ userId, title, description, severity?, screenPath }`.
   * @returns El reporte creado (campos reducidos).
   */
  createBugReport: async (payload, { supabase }) => {
    const p = payload as {
      userId:     number;
      title:      string;
      description: string;
      severity?:  'bajo' | 'medio' | 'alto' | 'critico' | null;
      screenPath: string | null;
    };
    const { data, error } = await supabase
      .from('TBL_Bug_Reports')
      .insert({
        User_ID:     p.userId,
        Title:       p.title.trim(),
        Description: p.description.trim(),
        Severity:    p.severity ?? null,
        Screen_Path: p.screenPath ?? null,
        Status:      'pendiente',
        Created_At:  new Date().toISOString(),
        Updated_At:  new Date().toISOString(),
      })
      .select('"Report_ID", "Title", "Severity", "Status", "Created_At"')
      .single();
    if (error) throw new Error(error.message);

    // Notificar a los miembros de Desarrollo TI (board team 11) vía sub-teams.
    // No bloquea la creación del reporte: si algo falla, se traga el error.
    try {
      const DESARROLLO_TI_BOARD_TEAM_ID = 11;

      const { data: subTeams } = await supabase
        .from('TBL_Sub_Teams')
        .select('Sub_Team_ID')
        .eq('Sub_Team_Team_ID', DESARROLLO_TI_BOARD_TEAM_ID);

      const subTeamIds = ((subTeams ?? []) as any[]).map((s) => s.Sub_Team_ID) as number[];

      if (subTeamIds.length > 0) {
        const { data: members } = await supabase
          .from('TBL_Sub_Team_Members')
          .select('Sub_Team_Member_User_ID')
          .in('Sub_Team_Member_Sub_Team_ID', subTeamIds);

        const memberIds: number[] = [...new Set(
          ((members ?? []) as any[]).map((m) => m.Sub_Team_Member_User_ID as number)
        )].filter((uid) => uid !== p.userId);

        if (memberIds.length > 0) {
          await insertNotifications(supabase, {
            userIds:   memberIds,
            type:      'bug_report',
            title:     'Nuevo fallo reportado',
            body:      p.title.trim(),
            requestId: null,
            actorId:   p.userId,
          });
        }
      }
    } catch (_notifyErr) {
      // no romper el flujo del reporte por un fallo notificando
    }

    return data;
  },

  /**
   * Lista todos los reportes de bugs con reportante, resolutor y ticket vinculado.
   *
   * @returns Los reportes ordenados por fecha de creación descendente, con las
   *          relaciones (`reporter`, `resolver`, `request`) embebidas.
   */
  fetchBugReports: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Bug_Reports')
.select(`
        "Report_ID", "Title", "Description", "Severity", "Status", "Screen_Path",
        "Created_At", "Updated_At", "Linked_Request_ID", "Resolver_ID", "Assigned_At",
        reporter:TBL_Users!TBL_Bug_Reports_User_ID_fkey ( User_ID, User_Name, User_Email ),
        resolver:TBL_Users!TBL_Bug_Reports_Resolver_ID_fkey ( User_ID, User_Name, User_Email ),
        request:TBL_Requests!TBL_Bug_Reports_Linked_Request_ID_fkey ( Request_Score )
      `)
      .order('Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Cambia el estado de un reporte de bug.
   *
   * @param payload - `{ reportId, status }`.
   * @returns `{ ok: true }` tras actualizar el estado.
   */
  updateBugReportStatus: async (payload, { supabase }) => {
    const { reportId, status } = payload as { reportId: string; status: string };
    const { error } = await supabase
      .from('TBL_Bug_Reports')
      .update({ Status: status, Updated_At: new Date().toISOString() })
      .eq('Report_ID', reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Convierte un reporte de bug en un ticket y asigna resolutor.
   *
   * Flujo:
   * 1. Lee el bug y evita la doble conversión (guard sobre `Linked_Request_ID`).
   * 2. Resuelve la columna "Sin categorizar" del board destino.
   * 3. Toma el snapshot del esquema de la plantilla "Fallo PRISMA" (ID 13).
   * 4. Calcula el score: el elegido por el admin, o el mapeo por severidad como
   *    fallback.
   * 5. Crea el ticket (solicitante = quien reportó el bug), guardando en
   *    `Request_Form_Data` la trazabilidad al reporte de origen.
   * 6. Vincula equipo y, si se eligieron, sprint y labels.
   * 7. Asigna al resolutor (mismo patrón que `assignRequest`) y lo notifica si
   *    no es quien asigna.
   * 8. Marca el bug como `asignado` y lo enlaza al ticket creado.
   *
   * @param payload - `{ reportId, boardId, teamId, resolverId, assignedBy, sprintId, estimatedHours, score, labelIds }`.
   * @returns `{ ok: true, requestId }` con el ID del ticket creado.
   * @throws Si el reporte ya fue convertido o el board no tiene columna "Sin categorizar".
   */
  assignBugToRequest: async (payload, { supabase }) => {
    const p = payload as {
      reportId:       string;
      boardId:        number;
      teamId:         number;
      resolverId:     number;
      assignedBy:     number;
      sprintId:       number | null;
      estimatedHours: number | null;
      score:          number | null;
      labelIds:       number[];
    };

    const BUG_TEMPLATE_ID = 13; // "Fallo PRISMA"
    const SEVERITY_SCORE: Record<string, number> = { bajo: 1, medio: 2, alto: 4, critico: 6 };

    // 1. Leer el bug + guard anti doble-asignación
    const { data: bug, error: bugErr } = await supabase
      .from('TBL_Bug_Reports')
      .select('"Report_ID", "User_ID", "Title", "Description", "Severity", "Screen_Path", "Linked_Request_ID"')
      .eq('Report_ID', p.reportId)
      .single();
    if (bugErr) throw new Error(bugErr.message);
    if ((bug as any).Linked_Request_ID) throw new Error('Este reporte ya fue convertido en ticket.');

    // 2. Columna "Sin categorizar" del board elegido
    const { data: col, error: colErr } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID')
      .eq('Board_Column_Board_ID', p.boardId)
      .eq('Board_Column_Name', 'Sin categorizar')
      .maybeSingle();
    if (colErr) throw new Error(colErr.message);
    if (!col) throw new Error('El board elegido no tiene columna "Sin categorizar".');
    const columnId = (col as { Board_Column_ID: number }).Board_Column_ID;

    // 3. Snapshot del schema del template
    const { data: tplData } = await supabase
      .from('TBL_Requests_Templates')
      .select('Request_Template_Form_Schema')
      .eq('Request_Template_ID', BUG_TEMPLATE_ID)
      .single();
    const schemaSnapshot = (tplData as any)?.Request_Template_Form_Schema ?? [];

    // 4. Score: el que eligió el admin, o fallback al mapeo por severidad
    const score = p.score ?? SEVERITY_SCORE[(bug as any).Severity] ?? 2;

    // 5. Insertar el request (solicitante = quien reportó el bug)
    const { data: inserted, error: insErr } = await supabase
      .from('TBL_Requests')
      .insert({
        Request_Board_ID:                 p.boardId,
        Request_Board_Column_ID:          columnId,
        Request_Requested_By:             (bug as any).User_ID,
        Request_Template_ID:              BUG_TEMPLATE_ID,
        Request_Title:                    (bug as any).Title,
        Request_Description:              (bug as any).Description,
        Request_Score:                    score,
        Request_Progress:                 0,
        Request_Created_At:               new Date().toISOString(),
        Request_Estimated_Hours:          p.estimatedHours ?? null,
        Request_Form_Data: {
          __source:    'bug_report',
          bugReportId: (bug as any).Report_ID,
          severity:    (bug as any).Severity,
          screenPath:  (bug as any).Screen_Path ?? null,
        },
        Request_Template_Schema_Snapshot: schemaSnapshot,
      })
      .select('Request_ID')
      .single();
    if (insErr) throw new Error(insErr.message);
    const newId = (inserted as { Request_ID: string }).Request_ID;

    // 6. Vincular equipo (+ sprint si se eligió)
    const links: any[] = [
      supabase.from('TBL_Request_Team').insert({ Request_Team_Request_ID: newId, Request_Team_ID: p.teamId }),
    ];
    if (p.sprintId !== null && p.sprintId !== undefined) {
      links.push(supabase.from('TBL_Request_Sprint').insert({ Request_Sprint_Request_ID: newId, Request_Sprint_ID: p.sprintId }));
    }
    if (p.labelIds && p.labelIds.length > 0) {
      links.push(supabase.from('TBL_Request_Labels').insert(
        p.labelIds.map((lid) => ({ Request_Labels_Request_ID: newId, Request_Labels_Label_ID: lid }))
      ));
    }
    await Promise.all(links);

    // 7. Asignar resolutor (mismo patrón que assignRequest)
    await supabase.from('TBL_Requests_Assignments')
      .delete()
      .eq('Request_Assignment_ID', newId)
      .eq('Request_Assignment_User_ID', p.resolverId);
    const { error: asgErr } = await supabase.from('TBL_Requests_Assignments').insert({
      Request_Assignment_ID:      newId,
      Request_Assignment_User_ID: p.resolverId,
      Request_Assignment_At:      new Date().toISOString(),
    });
    if (asgErr) throw new Error(asgErr.message);

    if (p.resolverId !== p.assignedBy) {
      await insertNotifications(supabase, {
        userIds:   [p.resolverId],
        type:      'assignment',
        title:     `Te asignaron el ticket ${newId}`,
        body:      `Se te asignó un fallo reportado: "${(bug as any).Title}".`,
        requestId: newId,
        actorId:   p.assignedBy,
      });
    }

    // 8. Marcar el bug como asignado + link al ticket
    const { error: updErr } = await supabase
      .from('TBL_Bug_Reports')
      .update({
        Status:            'asignado',
        Linked_Request_ID: newId,
        Resolver_ID:       p.resolverId,
        Assigned_By:       p.assignedBy,
        Assigned_At:       new Date().toISOString(),
        Updated_At:        new Date().toISOString(),
      })
      .eq('Report_ID', p.reportId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, requestId: newId };
  },

  /**
   * Registra una calificación de satisfacción, con rate limit por usuario.
   *
   * Si `RATING_RATE_LIMIT_DAYS` es positivo, verifica que el usuario no haya
   * calificado dentro de esa ventana; si lo hizo, lanza error. Luego inserta la
   * calificación.
   *
   * @param payload - `{ userId, score, comment }`.
   * @returns La calificación creada (campos reducidos).
   * @throws Si el usuario calificó dentro de la ventana de rate limit.
   */
  createSatisfactionRating: async (payload, { supabase }) => {
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
  },

  /**
   * Lista todas las calificaciones de satisfacción con su autor.
   *
   * @returns Las calificaciones ordenadas por fecha descendente, con `rater` embebido.
   */
  fetchSatisfactionRatings: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Satisfaction_Ratings')
      .select(`
        "Rating_ID", "Score", "Comment", "Created_At",
        rater:TBL_Users!User_ID ( User_ID, User_Name, User_Email )
      `)
      .order('Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Devuelve el estado y progreso de un job en background (para polling).
   *
   * @param payload - `{ jobId }`.
   * @returns La fila del job con su estado, progreso, resultado y error.
   */
  getBackgroundJob: async (payload, { supabase }) => {
    const { jobId } = payload as { jobId: string };
    const { data, error } = await supabase
      .from('TBL_Background_Jobs')
      .select('Job_ID, Job_Type, Job_Status, Job_Progress_Current, Job_Progress_Total, Job_Result, Job_Error, Job_Created_At, Job_Updated_At, Job_Completed_At')
      .eq('Job_ID', jobId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Reanuda un job que quedó estancado (stalled).
   *
   * No hace nada si el job ya terminó (`done`/`failed`). Si sigue en proceso y su
   * última actualización fue hace más de 60 segundos, lo considera estancado y
   * dispara un nuevo chunk vía `EdgeRuntime.waitUntil` (o `.catch` silencioso
   * como fallback local).
   *
   * @param payload - `{ jobId }`.
   * @returns `{ resumed }` — `true` si se relanzó; incluye `status` si ya estaba terminado.
   * @throws Si el job no existe.
   */
  resumeStalledJob: async (payload, { supabase }) => {
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
  },
};