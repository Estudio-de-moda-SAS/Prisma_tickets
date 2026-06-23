import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { mapCriteria } from '../shared/mappers.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants } from '../shared/requests.ts';

export const criteriaHandlers: Record<string, ActionHandler> = {
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

  createAcceptanceCriteria: async (payload, { supabase }) => {
    const { requestId, title } = payload as { requestId: string; title: string };
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
    return mapCriteria(data as Record<string, unknown>);
  },

  updateAcceptanceCriteriaStatus: async (payload, { supabase }) => {
    const { criteriaId, status, reviewedBy, reviewerNotes, requestId } = payload as {
      criteriaId:    number;
      status:        'accepted' | 'rejected' | 'pending';
      reviewedBy:    number;
      reviewerNotes: string | null;
      requestId:     string;
    };
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

  deleteAcceptanceCriteria: async (payload, { supabase }) => {
    const { criteriaId } = payload as { criteriaId: number };
    const { error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .delete()
      .eq('Criteria_ID', criteriaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  updateCriteriaTitle: async (payload, { supabase }) => {
    const { criteriaId, title } = payload as { criteriaId: number; title: string };
    const { data, error } = await supabase
      .from('TBL_Acceptance_Criteria')
      .update({ Title: title.trim(), Updated_At: new Date().toISOString() })
      .eq('Criteria_ID', criteriaId)
      .select('Criteria_ID, Request_ID, Title, Status, Reviewer_Notes, Reviewed_By, Reviewed_At, Created_At, Updated_At')
      .single();
    if (error) throw new Error(error.message);
    return mapCriteria(data as Record<string, unknown>);
  },
};
