/**
 * Punto único de notificación: in-app + correo por evento del ticket.
 *
 * Todos los eventos del dominio (creación, asignación, comentario, cierre,
 * revisión del cliente, paso a en progreso, feedback, automatizaciones) pasan
 * por {@link notifyEvent}. Los handlers no llaman directamente a
 * `insertNotifications` ni a `sendEventEmail`: arman los destinatarios y el
 * contenido (ver los `notify*` de `shared/requests.ts`) y delegan aquí.
 *
 * Para no hacer esperar la respuesta al usuario, los handlers despachan la
 * notificación con {@link dispatchEvent}, que la deja corriendo en segundo plano
 * con `EdgeRuntime.waitUntil`.
 *
 * @module
 */
import type { DB } from '../lib/supabase.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { sendEventEmail }      from '../email/send.ts';

/** Destinatario de correo con su nombre, para personalizar las variables. */
export type EmailRecipient = { User_ID: number; User_Name: string };

/** Parámetros de un evento de notificación. */
export type NotifyEventParams = {
  /** Clave del evento; selecciona el template de correo (`Email_Template_Event_Key`). */
  eventKey:  string;
  /** Solicitud asociada (o `null`); requerida para que haya correo. */
  requestId: string | null;
  /** Usuario que originó el evento (o `null` si lo originó el sistema). */
  actorId:   number | null;
  /** Notificación in-app. Si falta, el evento no genera notificación in-app. */
  inApp?: {
    userIds: number[];
    type:    string;
    title:   string;
    body:    string;
  };
  /** Correo. Si falta, el evento no genera correo. */
  email?: {
    userIds: number[];
    /**
     * Variables del template. Si es una función, se hace un envío por
     * destinatario con sus propias variables (p. ej. el saludo con su nombre).
     */
    vars: Record<string, string> | ((recipient: EmailRecipient) => Record<string, string>);
    cc?:  string[];
  };
};

/**
 * Emite la notificación in-app y el correo de un evento.
 *
 * Las dos partes son independientes y best-effort: un fallo en la in-app no
 * impide el correo, y `sendEventEmail` ya captura sus propios errores. Nunca
 * lanza, para que el evento no pueda tumbar la operación que lo originó.
 *
 * @param supabase - Cliente de Supabase (service role).
 * @param params - Evento a notificar.
 */
export async function notifyEvent(supabase: DB, params: NotifyEventParams): Promise<void> {
  if (params.inApp && params.inApp.userIds.length > 0) {
    try {
      await insertNotifications(supabase, {
        userIds:   params.inApp.userIds,
        type:      params.inApp.type,
        title:     params.inApp.title,
        body:      params.inApp.body,
        requestId: params.requestId,
        actorId:   params.actorId,
      });
    } catch (e) {
      console.error(`[notify] in-app "${params.eventKey}" falló:`, e);
    }
  }

  const email = params.email;
  if (!email || !params.requestId || email.userIds.length === 0) return;

  try {
    const { vars } = email;
    if (typeof vars !== 'function') {
      await sendEventEmail(supabase, {
        eventKey:  params.eventKey,
        requestId: params.requestId,
        userIds:   email.userIds,
        vars,
        cc:        email.cc,
      });
      return;
    }

    // Variables por destinatario: un envío por usuario.
    const { data: users } = await supabase
      .from('TBL_Users').select('User_ID, User_Name').in('User_ID', email.userIds);
    for (const u of (users ?? []) as EmailRecipient[]) {
      await sendEventEmail(supabase, {
        eventKey:  params.eventKey,
        requestId: params.requestId,
        userIds:   [u.User_ID],
        vars:      vars(u),
        cc:        email.cc,
      });
    }
  } catch (e) {
    console.error(`[notify] correo "${params.eventKey}" falló:`, e);
  }
}

/**
 * Deja una tarea de notificación corriendo en segundo plano.
 *
 * Con `EdgeRuntime.waitUntil` el runtime mantiene viva la invocación hasta que
 * la tarea termina, aunque la respuesta ya se haya enviado. Sin él (entorno
 * local), la tarea sigue sin esperar y sus errores solo se loguean.
 *
 * @param label - Etiqueta para los logs.
 * @param task - Promesa de la notificación (p. ej. `notifyEvent(...)` o un `notify*`).
 */
export function dispatchEvent(label: string, task: Promise<unknown>): void {
  const guarded = task.catch((e) => console.error(`[notify] ${label} falló:`, e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(guarded);
  }
}
