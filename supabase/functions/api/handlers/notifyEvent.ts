// handlers/shared/notifyEvent.ts  (ajustá la ruta a donde viven tus helpers)
/**
 * Helper de notificación combinada: in-app + correo en una sola llamada.
 *
 * Centraliza el patrón "notificá y, si corresponde, mandá correo" que usan los
 * handlers de dominio. La parte in-app siempre se ejecuta; la de correo es
 * condicional y best-effort.
 *
 * @module
 */
import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { sendEventEmail }      from '../email/send.ts';

/**
 * Emite una notificación in-app y, opcionalmente, un correo por el mismo evento.
 *
 * Primero inserta la notificación in-app para todos los `userIds`. Luego, solo
 * si se proveen `emailVars` **y** hay `requestId`, dispara el correo del evento
 * (que además exige que exista un template activo para ese `eventKey`). El envío
 * de correo va envuelto en try/catch dentro de `sendEventEmail`, por lo que un
 * fallo de la API de correo nunca tumba la notificación ni la operación que la
 * originó.
 *
 * @param supabase - Cliente de Supabase (service role).
 * @param params - Parámetros del evento:
 *   - `eventKey`: clave que selecciona el template de correo (`Event_Key`).
 *   - `userIds`: destinatarios, compartidos por la notificación in-app y el correo.
 *   - `requestId`: solicitud asociada (o `null`); requerido para que haya correo.
 *   - `actorId`: usuario que originó el evento (o `null`).
 *   - `notification`: contenido in-app (`type`, `title`, `body`).
 *   - `emailVars`: variables para interpolar el template; si faltan, no se envía correo.
 *   - `cc`: destinatarios en copia del correo (opcional).
 * @returns Una promesa que resuelve cuando la notificación (y el correo, si aplica) se procesaron.
 */
export async function notifyEvent(
  supabase: DB,
  params: {
    eventKey:  string;               // dispara el template de correo (Event_Key)
    userIds:   number[];             // mismos destinatarios para in-app y correo
    requestId: string | null;
    actorId:   number | null;
    notification: { type: string; title: string; body: string };  // contenido in-app
    emailVars?: Record<string, string>;  // si falta → NO se manda correo (solo in-app)
    cc?:       string[];
  },
): Promise<void> {
  // 1. In-app (comportamiento idéntico al de hoy)
  await insertNotifications(supabase, {
    userIds:   params.userIds,
    type:      params.notification.type,
    title:     params.notification.title,
    body:      params.notification.body,
    requestId: params.requestId,
    actorId:   params.actorId,
  });

  // 2. Correo (solo si hay vars Y requestId; y solo si existe template activo).
  //    sendEventEmail ya va envuelto en try/catch: si la API falla, NO tumba nada.
  if (params.emailVars && params.requestId) {
    await sendEventEmail(supabase, {
      eventKey:  params.eventKey,
      requestId: params.requestId,
      userIds:   params.userIds,
      vars:      params.emailVars,
      cc:        params.cc,
    });
  }
}