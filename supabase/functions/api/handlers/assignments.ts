import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { sendEventEmail } from '../email/send.ts';

export const assignmentHandlers: Record<string, ActionHandler> = {
  assignRequest: async (payload, { supabase }) => {
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
      const { data: existing } = await supabase
        .from('TBL_Notifications')
        .select('Notification_ID')
        .eq('Notification_User_ID', userId)
        .eq('Notification_Type', 'assignment')
        .eq('Notification_Request_ID', requestId)
        .eq('Notification_Is_Read', false)
        .limit(1);

      if (!existing || existing.length === 0) {
        // Nombres para notificación in-app Y correo (formato PRISMA)
        const shortName = (full: string) => {
          const parts = (full ?? '').trim().split(/\s+/);
          return parts.length >= 4 ? `${parts[0]} ${parts[2]}` : (full ?? '').trim();
        };

        const { data: people } = await supabase
          .from('TBL_Users')
          .select('User_ID, User_Name')
          .in('User_ID', [userId, assignedBy]);
        const nameOf = (id: number) => {
          const full = (people ?? []).find((u: any) => u.User_ID === id)?.User_Name ?? '';
          return shortName(full);
        };
        const assigneeName = nameOf(userId);
        const actorName    = nameOf(assignedBy) || 'Alguien';

        // 1. Notificación in-app (comportamiento existente, intacto)
        await insertNotifications(supabase, {
          userIds:   [userId],
          type:      'assignment',
          title:     'Te asignaron una solicitud',
          body:      `${actorName} te asignó ${requestId}`,
          requestId: requestId,
          actorId:   assignedBy,
        });

        // 2. Correo al resolutor asignado (solo si hay template activo)
        try {
          const { data: reqRow } = await supabase
            .from('TBL_Requests')
            .select('Request_Title')
            .eq('Request_ID', requestId)
            .single();

          await sendEventEmail(supabase, {
            eventKey:  'assignRequest',
            requestId: requestId,
            userIds:   [userId],
            vars: {
              assignee_name: assigneeName,
              actor_name:    actorName,
              ticket_id:     requestId,
              ticket_title:  (reqRow as any)?.Request_Title ?? '',
              ticket_url:    `${Deno.env.get('MAIL_APP_URL')}/ticket/${requestId}`,
            },
          });
        } catch (_emailErr) { /* el correo nunca debe tumbar la asignación */ }
      }
    }
    return { ok: true };
  },

  unassignRequest: async (payload, { supabase }) => {
    const { requestId, userId } = payload as { requestId: string; userId: number };
    const { error } = await supabase.from('TBL_Requests_Assignments')
      .delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};