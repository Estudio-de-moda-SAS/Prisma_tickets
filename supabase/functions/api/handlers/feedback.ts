/**
 * Handlers de feedback del cliente sobre solicitudes en revisión.
 *
 * Registrados en {@link feedbackHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Al registrar un veredicto
 * (aprobado/rechazado), el ticket se mueve a la columna destino, se notifica a
 * los resolutores y se dispara —de forma best-effort— el correo de respuesta
 * del cliente.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants, maybeSendClientFeedbackEmail } from '../shared/requests.ts';

/**
 * Mapa de handlers de feedback del cliente indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const feedbackHandlers: Record<string, ActionHandler> = {
  /**
   * Lista el feedback del cliente de una solicitud, del más reciente al más antiguo.
   *
   * @param payload - `{ requestId }`.
   * @returns Las entradas de feedback con el nombre de quien las envió embebido.
   */
  fetchClientFeedback: async (payload, { supabase }) => {
    const { requestId } = payload as { requestId: string };
    const { data, error } = await supabase
      .from('TBL_Client_Feedback')
      .select(`
        Feedback_ID, Request_ID, Submitted_By, Decision, Feedback_Note, Submitted_At,
        submitter:TBL_Users!Submitted_By ( User_Name )
      `)
      .eq('Request_ID', requestId)
      .order('Submitted_At', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /**
   * Registra el veredicto del cliente y mueve el ticket a la columna destino.
   *
   * Aplica un control de ciclo: solo admite un feedback por cada cierre
   * registrado. Si la cantidad de feedbacks ya iguala o supera la de cierres,
   * lanza error exigiendo reabrir y volver a cerrar el ticket antes de enviar
   * uno nuevo.
   *
   * Registrado el feedback y movido el ticket, notifica a los participantes
   * (resolutores + solicitante, excluyendo a quien envía) con un título y
   * cuerpo distintos según sea aprobación o rechazo, y dispara el correo de
   * respuesta del cliente (best-effort; omite la nota si el ticket es
   * confidencial).
   *
   * @param payload - `{ requestId, submittedBy, decision, feedbackNote, targetColumnId }`.
   * @returns La entrada de feedback creada, con el submitter embebido.
   * @throws Si ya se registró feedback para el ciclo de cierre actual.
   */
  submitClientFeedback: async (payload, { supabase }) => {
    const p = payload as {
      requestId:      string;
      submittedBy:    number;
      decision:       'approved' | 'rejected';
      feedbackNote:   string | null;
      targetColumnId: number;
    };
    const [closureRes, feedbackRes] = await Promise.all([
      supabase
        .from('TBL_Request_Closure')
        .select('Closure_ID', { count: 'exact', head: true })
        .eq('Request_ID', p.requestId),
      supabase
        .from('TBL_Client_Feedback')
        .select('Feedback_ID', { count: 'exact', head: true })
        .eq('Request_ID', p.requestId),
    ]);
    if ((feedbackRes.count ?? 0) >= (closureRes.count ?? 1)) {
      throw new Error('Ya se registró feedback para este ciclo de cierre. El ticket debe reabrirse y cerrarse nuevamente para enviar uno nuevo.');
    }

    const { data: feedback, error: fbErr } = await supabase
      .from('TBL_Client_Feedback')
      .insert({
        Request_ID:   p.requestId,
        Submitted_By: p.submittedBy,
        Decision:     p.decision,
        Feedback_Note: p.feedbackNote ?? null,
        Submitted_At:  new Date().toISOString(),
      })
      .select(`
        Feedback_ID, Request_ID, Submitted_By, Decision, Feedback_Note, Submitted_At,
        submitter:TBL_Users!Submitted_By ( User_Name )
      `)
      .single();
    if (fbErr) throw new Error(fbErr.message);

    const { error: moveErr } = await supabase
      .from('TBL_Requests')
      .update({ Request_Board_Column_ID: p.targetColumnId })
      .eq('Request_ID', p.requestId);
    if (moveErr) throw new Error(moveErr.message);

    const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, p.requestId);
    const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
      .filter((uid) => uid !== p.submittedBy);

    const isApproved  = p.decision === 'approved';
    const notifTitle  = isApproved
      ? `Ticket ${p.requestId} aprobado por el cliente ✓`
      : `Ticket ${p.requestId} rechazado por el cliente ✗`;
    const notifBody   = isApproved
      ? `El cliente aprobó la solicitud. Pasa a Ready to Deploy.${p.feedbackNote ? ` Nota: ${p.feedbackNote.slice(0, 60)}` : ''}`
      : `El cliente rechazó la solicitud y solicita correcciones.${p.feedbackNote ? ` Nota: ${p.feedbackNote.slice(0, 60)}` : ''}`;

    await insertNotifications(supabase, {
      userIds:   recipientIds,
      type:      isApproved ? 'client_approved' : 'client_rejected',
      title:     notifTitle,
      body:      notifBody,
      requestId: p.requestId,
      actorId:   p.submittedBy,
    });

    // ── Correo "el cliente respondió" ─────────────────────────────────────
    // A los resolutores (recipientIds ya excluye al cliente que envía).
    // Sin el texto de la nota si el ticket es confidencial. Nunca lanza.
    await maybeSendClientFeedbackEmail(supabase, {
      requestId:    p.requestId,
      recipientIds,
      clientId:     p.submittedBy,
      decision:     p.decision,
      feedbackNote: p.feedbackNote,
    });
    // ── /Correo ───────────────────────────────────────────────────────────

    return feedback;
  },
};