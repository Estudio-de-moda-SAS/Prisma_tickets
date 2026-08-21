import type { DB } from '../lib/supabase.ts';

/**
 * Inserción de notificaciones in-app.
 *
 * Expone {@link insertNotifications}, que crea una notificación por usuario a
 * partir de un contenido común (fan-out).
 *
 * @module notifications
 */

/**
 * Inserta una notificación para cada usuario indicado.
 *
 * @remarks
 * Reparte el mismo contenido (`type`, `title`, `body`, etc.) entre todos los
 * `userIds`, generando una fila por usuario en `TBL_Notifications` marcada como
 * no leída. No hace nada si `userIds` viene vacío.
 *
 * @param supabase - Cliente de Supabase.
 * @param notifications - Contenido de la notificación y destinatarios.
 * @param notifications.userIds - IDs de los usuarios destinatarios.
 * @param notifications.type - Tipo/categoría de la notificación.
 * @param notifications.title - Título mostrado.
 * @param notifications.body - Cuerpo del mensaje.
 * @param notifications.requestId - Request asociado, o `null`.
 * @param notifications.actorId - Usuario que originó la acción, o `null` (sistema).
 */
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