import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { BASE_SELECT, BASE_SELECT_LIGHT } from '../shared/selects.ts';
// @ts-ignore
import { attachCriteriaSummary } from '../shared/criteria.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants, isCloseColumn } from '../shared/requests.ts';
// @ts-ignore
import { sendEventEmail } from '../email/send.ts';
const HISTORIAL_COLUMN_ID     = 9;
const HISTORIAL_INITIAL_LIMIT = 50; // ajustable

export const requestHandlers: Record<string, ActionHandler> = {
  fetchAllByBoard: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT)
      .eq('Request_Board_ID', boardId)
      .order('Request_Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
  },

fetchByTeamCode: async (payload, { supabase }) => {
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

    // Columnas activas — completas (su tamaño está acotado por flujo)
    const activePromise = supabase
      .from('TBL_Requests').select(BASE_SELECT_LIGHT)
      .in('Request_ID', ids)
      .eq('Request_Board_ID', boardId)
      .neq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID)
      .order('Request_Created_At', { ascending: false });

    // Historial — solo los más recientes (el resto se busca on-demand)
    const historialPromise = supabase
      .from('TBL_Requests').select(BASE_SELECT_LIGHT)
      .in('Request_ID', ids)
      .eq('Request_Board_ID', boardId)
.eq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID)
      .order('Request_Created_At', { ascending: false })
      .order('Request_ID',         { ascending: false })
      .limit(HISTORIAL_INITIAL_LIMIT);

    const [activeRes, historialRes] = await Promise.all([activePromise, historialPromise]);
    if (activeRes.error)    throw new Error(activeRes.error.message);
    if (historialRes.error) throw new Error(historialRes.error.message);

    const combined = [...(activeRes.data ?? []), ...(historialRes.data ?? [])];
    return attachCriteriaSummary(combined as Record<string, unknown>[], supabase);
  },

  fetchByRequestedBy: async (payload, { supabase }) => {
    const { userId, boardId } = payload as { userId: number; boardId: number };
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT)
      .eq('Request_Requested_By', userId).eq('Request_Board_ID', boardId)
      .order('Request_Created_At', { ascending: false });
    if (error) throw new Error(error.message);
    return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
  },

  fetchUncategorized: async (payload, { supabase }) => {
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
  },

  fetchById: async (payload, { supabase }) => {
    const { id } = payload as { id: string };
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT).eq('Request_ID', id).single();
    if (error) throw new Error(error.message);
    return data;
  },

  createRequest: async (payload, { supabase }) => {
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

    // ── Detección de rol: se usa para sprint Y para el correo ─────────────
    let isExternalRequester = false;
    {
      const { data: userRoleRow } = await supabase
        .from('TBL_Users').select('User_Role').eq('User_ID', p.requestedBy).single();
      const userRole = (userRoleRow as any)?.User_Role as string | undefined;
      isExternalRequester = userRole !== 'admin' && userRole !== 'ti_member';
    }

    // ── Auto-asignación de sprint para usuarios externos ──────────────────
    let resolvedSprintId: number | null = p.sprintId;
    let autoAssignedSprint: Record<string, unknown> | null = null;

    if (p.sprintId === null && p.equipoIds.length > 0) {
      try {
        if (isExternalRequester) {
          const teamId = p.equipoIds[0];
          const nowIso = new Date().toISOString();

          const { data: futureSprints } = await supabase
            .from('TBL_Sprint')
            .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date')
            .gt('Sprint_Start_Date', nowIso)
            .order('Sprint_Start_Date', { ascending: true });

          if (futureSprints && (futureSprints as any[]).length > 0) {
            const sprintIds = (futureSprints as any[]).map((s: any) => s.Sprint_ID);

            const { data: capRows } = await supabase
              .from('TBL_Sprint_Team_Capacity')
              .select('Sprint_ID, External_Capacity')
              .eq('Board_Team_ID', teamId)
              .in('Sprint_ID', sprintIds);
            const capMap: Record<number, number> = {};
            for (const c of (capRows ?? []) as any[]) capMap[c.Sprint_ID] = c.External_Capacity;

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

            for (const sp of (futureSprints as any[])) {
              const cap   = capMap[sp.Sprint_ID] ?? 20;
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

    // ── Correo "solicitud recibida" — SOLO a solicitantes externos ────────
    // Entre TI (admin / ti_member) no se manda: llenaría el correo sin sentido.
    // Solo correo, sin notificación in-app (el solicitante ya sabe que la creó).
    try {
      if (!isExternalRequester) {
        // interno → no se manda correo, se omite todo el bloque
} else {
        // Nombre del solicitante para el saludo (formato PRISMA: 1er nombre + 1er apellido)
        const { data: reqUser } = await supabase
          .from('TBL_Users').select('User_Name').eq('User_ID', p.requestedBy).single();
        const fullName = (reqUser as any)?.User_Name ?? '';
        const parts    = fullName.trim().split(/\s+/);
        const requesterName = parts.length >= 4 ? `${parts[0]} ${parts[2]}` : fullName.trim();

        const fmtFecha = (iso: string) => {
        if (!iso) return '';
        const clean = iso.includes('T') ? iso : `${iso}T00:00:00`;
        return new Date(clean).toLocaleDateString('es-CO', {
          timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
        });
      };

      let sprintInfo: string;
      if (autoAssignedSprint) {
        const sp    = autoAssignedSprint as any;
        const desde = fmtFecha(sp.Sprint_Start_Date ?? '');
        const hasta = fmtFecha(sp.Sprint_End_Date ?? '');
        const rango = (desde && hasta) ? ` (del ${desde} al ${hasta})` : '';
        sprintInfo  = `Tu solicitud quedó programada para ${sp.Sprint_Text}${rango}.`;
      } else {
        sprintInfo = 'El equipo te notificará cuando tu solicitud quede programada en un sprint.';
      }

      await sendEventEmail(supabase, {
        eventKey:  'ticket_recibido',
        requestId: newId,
        userIds:   [p.requestedBy],
        vars: {
          requester_name:     requesterName,
          ticket_id:          newId,
          ticket_title:       p.titulo ?? '',
          ticket_description: p.descripcion ?? '',
          ticket_url:         `${Deno.env.get('MAIL_APP_URL')}/ticket/${newId}`,
          sprint_info:        sprintInfo,
          sprint_name:        autoAssignedSprint ? String((autoAssignedSprint as any).Sprint_Text) : '',
        },
      });
    }
    } catch (_emailErr) { /* el correo nunca debe tumbar la creación */ }
    // ── /Correo ───────────────────────────────────────────────────────────

    return autoAssignedSprint !== null
      ? { ...(data as object), _autoAssignedSprint: autoAssignedSprint }
      : data;
  },

  moveToColumn: async (payload, { supabase }) => {
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
      updateData['Request_Finished_At'] = null;
      updateData['Request_Progress']    = 0;
    }

    const { error } = await supabase
      .from('TBL_Requests').update(updateData).eq('Request_ID', id);
    if (error) throw new Error(error.message);

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
      const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, id);
      const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
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

      // ── Correo "listo para revisión del cliente" ──────────────────────
      // Solo al mover a Client Review (columna 10). Solo al solicitante.
      // Condiciones: (a) solicitante externo, (b) solicitante NO es resolutor.
      // La notificación in-app de arriba queda intacta; esto es SOLO correo adicional.
console.log(`[cr-debug] movedBy=${movedBy} columnId=${columnId} (${typeof columnId}) requestedBy=${requestedBy}`);
      if (Number(columnId) === 10 && requestedBy) {
        console.log('[cr-debug] entró al if de columna 10');
        try {
          const { data: reqUser } = await supabase
            .from('TBL_Users')
            .select('User_Name, User_Role')
            .eq('User_ID', requestedBy)
            .single();

          const isAlsoResolver = assigneeIds.includes(requestedBy);
          console.log(`[cr-debug] isAlsoResolver=${isAlsoResolver} assignees=${JSON.stringify(assigneeIds)}`);

          if (!isAlsoResolver) {
            console.log('[cr-debug] pasó validación, va a mandar correo');
            const fullName = (reqUser as any)?.User_Name ?? '';
            const parts    = fullName.trim().split(/\s+/);
            const requesterName = parts.length >= 4 ? `${parts[0]} ${parts[2]}` : fullName.trim();

            const { data: reqRow } = await supabase
              .from('TBL_Requests')
              .select('Request_Title')
              .eq('Request_ID', id)
              .single();

            await sendEventEmail(supabase, {
              eventKey:  'moveToClientReview',
              requestId: id,
              userIds:   [requestedBy],
              vars: {
                requester_name: requesterName,
                ticket_id:      id,
                ticket_title:   (reqRow as any)?.Request_Title ?? '',
                ticket_url:     `${Deno.env.get('MAIL_APP_URL')}/ticket/${id}`,
              },
            });
            console.log('[cr-debug] sendEventEmail terminó');
          } else {
            console.log('[cr-debug] CORTÓ: solicitante es también resolutor');
          }
        } catch (emailErr) {
          console.log('[cr-debug] ERROR en el bloque:', emailErr);
        }
      } else {
        console.log('[cr-debug] CORTÓ: no entró al if (columnId !== 10 o requestedBy vacío)');
      }      // ── /Correo ───────────────────────────────────────────────────────
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
                }
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
  },

  updateRequest: async (payload, { supabase }) => {
    const { id, ...patch } = payload as {
      id: string; titulo?: string; descripcion?: string; score?: number;
      progreso?: number; estimatedHours?: number | null; loggedHours?: number | null;
      equipoIds?: number[]; labelIds?: number[]; sprintId?: number | null;
      formData?: Record<string, unknown>;
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
  },

  updateRequestSubTeams: async (payload, { supabase }) => {
    const { id, subTeamIds } = payload as { id: string; subTeamIds: number[] };
    await supabase.from('TBL_Request_Sub_Team').delete().eq('Request_Sub_Team_Request_ID', id);
    if (subTeamIds.length > 0) {
      const { error } = await supabase.from('TBL_Request_Sub_Team').insert(
        subTeamIds.map((sid) => ({ Request_Sub_Team_Request_ID: id, Request_Sub_Team_ID: sid }))
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  },

  deleteRequest: async (payload, { supabase }) => {
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
  },

  fetchChildRequests: async (payload, { supabase }) => {
    const { parentId } = payload as { parentId: string };
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT)
      .eq('Request_Parent_ID', parentId).order('Request_Created_At', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  fetchByAssignedTo: async (payload, { supabase }) => {
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
  },

  fetchTeamHistorialCount: async (payload, { supabase }) => {
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
    if (ids.length === 0) return { total: 0 };
    const { count, error } = await supabase
      .from('TBL_Requests')
      .select('Request_ID', { count: 'exact', head: true })
      .in('Request_ID', ids)
      .eq('Request_Board_ID', boardId)
      .eq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID);
    if (error) throw new Error(error.message);
    return { total: count ?? 0 };
  },

  fetchTeamHistorialPage: async (payload, { supabase }) => {
    const { boardId, teamCode, cursorCreatedAt, cursorId } = payload as {
      boardId: number; teamCode: string; cursorCreatedAt: string; cursorId: string;
    };
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
      .from('TBL_Requests').select(BASE_SELECT_LIGHT)
      .in('Request_ID', ids)
      .eq('Request_Board_ID', boardId)
      .eq('Request_Board_Column_ID', HISTORIAL_COLUMN_ID)
      .or(`Request_Created_At.lt.${cursorCreatedAt},and(Request_Created_At.eq.${cursorCreatedAt},Request_ID.lt.${cursorId})`)
      .order('Request_Created_At', { ascending: false })
      .order('Request_ID',         { ascending: false })
      .limit(HISTORIAL_INITIAL_LIMIT);
    if (error) throw new Error(error.message);
    return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
  },

  searchRequests: async (payload, { supabase }) => {
    const { boardId, teamCode, query } = payload as {
      boardId: number; teamCode: string; query: string;
    };
    const q = (query ?? '').trim();
    if (q.length < 2) return [];

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

    const escaped = q.replace(/[%_,()]/g, (m) => `\\${m}`);
    const { data, error } = await supabase
      .from('TBL_Requests').select(BASE_SELECT_LIGHT)
      .in('Request_ID', ids)
      .eq('Request_Board_ID', boardId)
      .or(`Request_Title.ilike.%${escaped}%,Request_ID.ilike.%${escaped}%`)
      .order('Request_Created_At', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return attachCriteriaSummary(data as Record<string, unknown>[], supabase);
  },
};

