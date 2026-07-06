// handlers/shared/notifyEvent.ts  (ajustá la ruta a donde viven tus helpers)
import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { sendEventEmail }      from '../email/send.ts';

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