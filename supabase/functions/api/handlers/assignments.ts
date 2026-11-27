/**
 * Handlers de asignación de resolutores a solicitudes.
 *
 * Registrados en {@link assignmentHandlers} y despachados desde el Edge
 * Function único vía el envelope `{ action, payload }`. La asignación dispara,
 * de forma best-effort, una notificación in-app y un correo al resolutor;
 * ninguno de los dos debe tumbar la operación principal.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { dispatchEvent } from './notifyEvent.ts';
// @ts-ignore
import { notifyAssignment } from '../shared/requests.ts';

/**
 * Mapa de handlers de asignación indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const assignmentHandlers: Record<string, ActionHandler> = {
  /**
   * Asigna un resolutor a una solicitud y notifica de forma best-effort.
   *
   * Primero elimina cualquier asignación previa del mismo par
   * solicitud/usuario (idempotencia) y luego inserta la nueva. Si hay un
   * `assignedBy`, despacha en segundo plano el evento de asignación
   * (`notifyAssignment`: in-app + correo, omitido si se auto-asignó o si ya
   * tiene una notificación de asignación sin leer para el ticket).
   *
   * @param payload - `{ requestId, userId, assignedBy? }`.
   * @returns `{ ok: true }` una vez registrada la asignación.
   */
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

    if (assignedBy) {
      dispatchEvent('assignRequest', notifyAssignment(supabase, { requestId, userId, actorId: assignedBy }));
    }
    return { ok: true };
  },

  /**
   * Quita la asignación de un resolutor sobre una solicitud.
   *
   * @param payload - `{ requestId, userId }`.
   * @returns `{ ok: true }` tras eliminar la asignación.
   */
  unassignRequest: async (payload, { supabase }) => {
    const { requestId, userId } = payload as { requestId: string; userId: number };
    const { error } = await supabase.from('TBL_Requests_Assignments')
      .delete().eq('Request_Assignment_ID', requestId).eq('Request_Assignment_User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};