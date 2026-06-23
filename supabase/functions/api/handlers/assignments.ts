import type { ActionHandler } from '../shared/types.ts';
import { insertNotifications } from '../shared/notifications.ts';

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
