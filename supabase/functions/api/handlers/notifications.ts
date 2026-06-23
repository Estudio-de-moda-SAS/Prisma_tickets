import type { ActionHandler } from '../shared/types.ts';

export const notificationHandlers: Record<string, ActionHandler> = {
  getNotifications: async (payload, { supabase }) => {
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
  },

  markNotificationRead: async (payload, { supabase }) => {
    const { notificationId, userId } = payload as { notificationId: number; userId: number };
    const { error } = await supabase
      .from('TBL_Notifications')
      .update({ Notification_Is_Read: true })
      .eq('Notification_ID', notificationId)
      .eq('Notification_User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  markAllNotificationsRead: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { error } = await supabase
      .from('TBL_Notifications')
      .update({ Notification_Is_Read: true })
      .eq('Notification_User_ID', userId)
      .eq('Notification_Is_Read', false);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
