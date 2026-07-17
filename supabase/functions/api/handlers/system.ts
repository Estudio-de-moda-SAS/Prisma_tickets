import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { RATING_RATE_LIMIT_DAYS } from '../config.ts';
// @ts-ignore
import { _kickoffJobChunk } from '../jobs/renameJob.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';

export const systemHandlers: Record<string, ActionHandler> = {
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
    return data;
  },

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

  updateBugReportStatus: async (payload, { supabase }) => {
    const { reportId, status } = payload as { reportId: string; status: string };
    const { error } = await supabase
      .from('TBL_Bug_Reports')
      .update({ Status: status, Updated_At: new Date().toISOString() })
      .eq('Report_ID', reportId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

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
