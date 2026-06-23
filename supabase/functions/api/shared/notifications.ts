import type { DB } from '../lib/supabase.ts';

export async function insertNotifications(
  supabase: DB,
  notifications: {
    userIds:   number[];
    type:      string;
    title:     string;
    body:      string;
    requestId: string | null;
    actorId:   number | null;
  },
): Promise<void> {
  if (notifications.userIds.length === 0) return;
  const rows = notifications.userIds.map((uid) => ({
    Notification_User_ID:    uid,
    Notification_Type:       notifications.type,
    Notification_Title:      notifications.title,
    Notification_Body:       notifications.body,
    Notification_Request_ID: notifications.requestId,
    Notification_Actor_ID:   notifications.actorId,
    Notification_Is_Read:    false,
    Notification_Created_At: new Date().toISOString(),
  }));
  await supabase.from('TBL_Notifications').insert(rows);
}