/**
 * Handlers CRUD de criterios de aceptación (`TBL_Acceptance_Criteria`).
 *
 * Registrados en {@link criteriaHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Cada operación que modifica un
 * criterio deja rastro en el audit log, y la revisión de un criterio
 * (aceptado/rechazado) notifica a los resolutores asignados. Las filas se
 * devuelven mapeadas al shape del front vía `mapCriteria`.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { mapCriteria } from '../shared/mappers.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants } from '../shared/requests.ts';
// @ts-ignore
import { logHistory } from '../lib/history.ts';

/**
 * Mapa de handlers de criterios de aceptación indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const criteriaHandlers: Record<string, ActionHandler> = {
  /**
   * Lista los criterios de aceptación de una solicitud.
   *
   * @param payload - `{ requestId }`.
   * @returns Los criterios ordenados por fecha de creación ascendente, mapeados.
   */
  fetchAcceptanceCriteria: async (payload, { supabase }) => {
    const { requestId } = payload as { requestId: string };
    const { data, error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
      .eq('Request_ID', requestId)
      .order('Created_At', { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(mapCriteria);
  },

  /**
   * Crea un criterio de aceptación nuevo en estado `pending`.
   *
   * Registra la creación en el historial con el ID del criterio en la metadata.
   *
   * @param payload - `{ requestId, title, actorId? }`.
   * @returns El criterio creado, mapeado.
   */
  createAcceptanceCriteria: async (payload, { supabase }) => {
    const { requestId, title, actorId } = payload as {
      requestId: string; title: string; actorId?: number;
    };
    const { data, error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .insert({
        Request_ID: requestId,
        Title:      title.trim(),
        Status:     'pending',
        Created_At: new Date().toISOString(),
        Updated_At: new Date().toISOString(),
      })
      .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
      .single();
    if (error) throw new Error(error.message);

    await logHistory(supabase, {
      requestId,
      changedBy: actorId ?? null,
      action:    'criterion_added',
      newValue:  title.trim(),
      metadata:  { criteriaId: (data as Record<string, unknown>).Criteria_ID },
    });

    return mapCriteria(data as Record<string, unknown>);
  },

  /**
   * Cambia el estado de revisión de un criterio (accepted/rejected/pending).
   *
   * Captura el estado previo para registrar el cambio en el historial (solo si
   * hubo cambio real). Fija `Reviewed_At` cuando el nuevo estado no es
   * `pending` y lo limpia si vuelve a `pending`. Si el criterio queda revisado
   * (no `pending`), notifica a los resolutores asignados —excluyendo a quien
   * revisó.
   *
   * @param payload - `{ criteriaId, status, reviewedBy, reviewerNotes, requestId }`.
   * @returns El criterio actualizado, mapeado.
   */
  updateAcceptanceCriteriaStatus: async (payload, { supabase }) => {
    const { criteriaId, status, reviewedBy, reviewerNotes, requestId } = payload as {
      criteriaId:    number;
      status:        'accepted' | 'rejected' | 'pending';
      reviewedBy:    number;
      reviewerNotes: string | null;
      requestId:     string;
    };

    // Prefetch: estado viejo para el old value de la historia
    const { data: prev } = await supabase
      .from('TBL_Acceptance_Criteria')
      .select('Status, Title')
      .eq('Criteria_ID', criteriaId)
      .single();
    const oldStatus = (prev as Record<string, unknown>)?.Status as string | undefined;

    const { data, error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .update({
        Status:         status,
        Reviewed_By:    reviewedBy,
        Reviewer_Notes: reviewerNotes ?? null,
        Reviewed_At:    status !== 'pending' ? new Date().toISOString() : null,
        Updated_At:     new Date().toISOString(),
      })
      .eq('Criteria_ID', criteriaId)
      .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
      .single();
    if (error) throw new Error(error.message);

    if (requestId && oldStatus !== status) {
      await logHistory(supabase, {
        requestId,
        changedBy: reviewedBy,
        action:    'criterion_status',
        oldValue:  oldStatus ?? null,
        newValue:  status,
        metadata:  { criteriaId, title: (data as Record<string, unknown>).Title },
      });
    }

    if (requestId && status !== 'pending') {
      const { assigneeIds } = await getRequestParticipants(supabase, requestId);
      const recipientIds = assigneeIds.filter((uid) => uid !== reviewedBy);
      const statusLabel = status === 'accepted' ? 'aceptado ✓' : 'rechazado ✗';
      await insertNotifications(supabase, {
        userIds:   recipientIds,
        type:      'criteria_reviewed',
        title:     `Criterio ${statusLabel}`,
        body:      `Un criterio de aceptación fue ${statusLabel} en el ticket ${requestId}.`,
        requestId: requestId,
        actorId:   reviewedBy,
      });
    }

    return mapCriteria(data as Record<string, unknown>);
  },

  /**
   * Elimina un criterio de aceptación y registra la baja en el historial.
   *
   * Hace un prefetch de `Request_ID` (obligatorio para el historial) y `Title`
   * (old value) antes de borrar, ya que después de la eliminación esos datos ya
   * no están disponibles.
   *
   * @param payload - `{ criteriaId, actorId? }`.
   * @returns `{ ok: true }` tras eliminar el criterio.
   */
  deleteAcceptanceCriteria: async (payload, { supabase }) => {
    const { criteriaId, actorId } = payload as { criteriaId: number; actorId?: number };

    // Prefetch: Request_ID (la historia lo exige) + Title (old value)
    const { data: prev } = await supabase
      .from('TBL_Acceptance_Criteria')
      .select('Request_ID, Title')
      .eq('Criteria_ID', criteriaId)
      .single();

    const { error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .delete()
      .eq('Criteria_ID', criteriaId);
    if (error) throw new Error(error.message);

    const requestId = (prev as Record<string, unknown>)?.Request_ID as string | undefined;
    if (requestId) {
      await logHistory(supabase, {
        requestId,
        changedBy: actorId ?? null,
        action:    'criterion_removed',
        oldValue:  (prev as Record<string, unknown>)?.Title ?? null,
        metadata:  { criteriaId },
      });
    }

    return { ok: true };
  },

  /**
   * Edita el título de un criterio y registra el cambio en el historial.
   *
   * Prefetch de `Title` (old value) y `Request_ID` (obligatorio para el
   * historial). Solo registra la edición si el título cambió realmente.
   *
   * @param payload - `{ criteriaId, title, actorId? }`.
   * @returns El criterio actualizado, mapeado.
   */
  updateCriteriaTitle: async (payload, { supabase }) => {
    const { criteriaId, title, actorId } = payload as {
      criteriaId: number; title: string; actorId?: number;
    };

    // Prefetch: título viejo (old value) + Request_ID (obligatorio para la historia)
    const { data: prev } = await supabase
      .from('TBL_Acceptance_Criteria')
      .select('Request_ID, Title')
      .eq('Criteria_ID', criteriaId)
      .single();

    const { data, error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .update({ Title: title.trim(), Updated_At: new Date().toISOString() })
      .eq('Criteria_ID', criteriaId)
      .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
      .single();
    if (error) throw new Error(error.message);

    const requestId = (prev as Record<string, unknown>)?.Request_ID as string | undefined;
    const oldTitle  = (prev as Record<string, unknown>)?.Title as string | undefined;
    if (requestId && oldTitle !== title.trim()) {
      await logHistory(supabase, {
        requestId,
        changedBy: actorId ?? null,
        action:    'criterion_edited',
        oldValue:  oldTitle ?? null,
        newValue:  title.trim(),
        metadata:  { criteriaId },
      });
    }

    return mapCriteria(data as Record<string, unknown>);
  },
};