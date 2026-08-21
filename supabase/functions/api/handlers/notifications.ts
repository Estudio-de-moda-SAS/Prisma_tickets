/**
 * Handlers de notificaciones in-app (`TBL_Notifications`).
 *
 * Registrados en {@link notificationHandlers} y despachados desde el Edge
 * Function único vía el envelope `{ action, payload }`. Cubren la lectura del
 * feed de notificaciones de un usuario y el marcado como leídas. La *creación*
 * de notificaciones no vive acá: la hacen los distintos handlers de dominio vía
 * el helper `insertNotifications`.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de notificaciones indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const notificationHandlers: Record<string, ActionHandler> = {
  /**
   * Lista las notificaciones de un usuario y cuenta las no leídas.
   *
   * @param payload - `{ userId, limit? }` (por defecto 40).
   * @returns `{ notifications, unreadCount }` — notificaciones ordenadas de la
   *          más reciente a la más antigua, con el actor embebido, y el total
   *          de no leídas dentro del lote traído.
   */
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

  /**
   * Marca una notificación puntual como leída.
   *
   * Filtra también por `userId` para que nadie pueda marcar notificaciones
   * ajenas.
   *
   * @param payload - `{ notificationId, userId }`.
   * @returns `{ ok: true }` tras actualizar.
   */
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

  /**
   * Marca como leídas todas las notificaciones no leídas de un usuario.
   *
   * @param payload - `{ userId }`.
   * @returns `{ ok: true }` tras actualizar.
   */
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