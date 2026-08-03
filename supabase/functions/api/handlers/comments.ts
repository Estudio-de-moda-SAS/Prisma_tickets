import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants, maybeSendCommentEmail } from '../shared/requests.ts';

export const commentHandlers: Record<string, ActionHandler> = {
  fetchComments: async (payload, { supabase }) => {
    const { requestId } = payload as { requestId: string };
    const { data, error } = await supabase
      .from('TBL_Comments')
      .select(`Comment_ID, Comment_Text, Comment_Created_At,
               author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
      .eq('Comment_Request_ID', requestId).order('Comment_Created_At', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },
fetchRequestParticipants: async (payload, { supabase }) => {
    const { requestId } = payload as { requestId: string };
    const { data, error } = await supabase
      .from('TBL_Request_Participants')
      .select('User_ID, Added_Via, Added_By, Created_At')
      .eq('Request_ID', requestId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { User_ID: number; Added_Via: string; Added_By: number | null }) => ({
      User_ID:         r.User_ID,
      User_Name:       '',              // lo resuelve el front con allUsers
      User_Avatar_url: '',
      Added_Via:       r.Added_Via,
      Added_By:        r.Added_By,
    }));
  },
  createComment: async (payload, { supabase }) => {
    const { requestId, userId, text, mentionedUserIds = [] } =
      payload as { requestId: string; userId: number; text: string; mentionedUserIds?: number[] };

    const trimmed = text.trim();
    const preview = trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '');

    // 1. Insertar comentario (igual que antes)
    const { data, error } = await supabase
      .from('TBL_Comments')
      .insert({
        Comment_Request_ID: requestId,
        Comment_User_ID:    userId,
        Comment_Text:       trimmed,
        Comment_Created_At: new Date().toISOString(),
      })
      .select(`Comment_ID, Comment_Text, Comment_Created_At,
               author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
      .single();
    if (error) throw new Error(error.message);

    // 2. Re-validar reglas de mención SERVER-SIDE (el front no es autoridad)
    let allowedMentionIds: number[] = [];
    if (mentionedUserIds.length > 0) {
      const [{ data: mentioner }, { data: reqRow }] = await Promise.all([
        supabase.from('TBL_Users')
          .select('User_Role, Department_ID').eq('User_ID', userId).single(),
        supabase.from('TBL_Requests')
          .select('Request_Is_Confidential')   // ⚠️ confirmá el nombre real de esta columna
          .eq('Request_ID', requestId).single(),
      ]);
      const isConfidential = reqRow?.Request_Is_Confidential ?? false;
      const isAdmin        = mentioner?.User_Role === 'admin';

      if (isConfidential && !isAdmin) {
        allowedMentionIds = [];                         // regla 3
      } else if (isAdmin) {
        allowedMentionIds = [...new Set(mentionedUserIds)]; // regla 2: admin → todos
      } else {
        // regla 2: no-admin → TI (7) ∪ depto del mencionador
        const { data: targets } = await supabase
          .from('TBL_Users').select('User_ID, Department_ID')
          .in('User_ID', [...new Set(mentionedUserIds)]);
        allowedMentionIds = (targets ?? [])
          .filter((t: { User_ID: number; Department_ID: number | null }) => t.Department_ID === 7 || t.Department_ID === mentioner?.Department_ID)
          .map((t: { User_ID: number; Department_ID: number | null }) => t.User_ID);
      }
      allowedMentionIds = allowedMentionIds.filter((id) => id !== userId); // no auto-mención
    }

    // 3. Persistir menciones + acceso durable + notificar
    if (allowedMentionIds.length > 0) {
      const commentId = (data as { Comment_ID: number }).Comment_ID;

      await supabase.from('TBL_Comment_Mentions').insert(
        allowedMentionIds.map((mid) => ({ Comment_ID: commentId, Mentioned_User_ID: mid })),
      );
      await supabase.from('TBL_Request_Participants').upsert(
        allowedMentionIds.map((mid) => ({
          Request_ID: requestId, User_ID: mid, Added_Via: 'mention', Added_By: userId,
        })),
        { onConflict: 'Request_ID,User_ID', ignoreDuplicates: true },
      );
      await insertNotifications(supabase, {
        userIds:   allowedMentionIds,
        type:      'mention',
        title:     `Te mencionaron en ${requestId}`,
        body:      preview,
        requestId,
        actorId:   userId,
      });
    }

    // 4. Notificación 'comment' a involucrados — excluyendo autor y a los ya notificados por mención
    const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, requestId);
    const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
      .filter((uid) => uid !== userId && !allowedMentionIds.includes(uid));
    if (recipientIds.length > 0) {
      await insertNotifications(supabase, {
        userIds: recipientIds, type: 'comment',
        title: `Nuevo comentario en ${requestId}`, body: preview,
        requestId, actorId: userId,
      });
    }

    await maybeSendCommentEmail(supabase, {
      requestId, actorId: userId, commentText: text, assigneeIds, requestedBy,
    });

    return data;
  },
removeParticipant: async (payload, { supabase }) => {
    const { requestId, userId, actorId } =
      payload as { requestId: string; userId: number; actorId: number };

    // Autoridad: admin o resolutor del ticket
    const { data: actor } = await supabase
      .from('TBL_Users').select('User_Role').eq('User_ID', actorId).single();
    const isAdmin = actor?.User_Role === 'admin';

    let isResolver = false;
    if (!isAdmin) {
      const { data: assign } = await supabase
        .from('TBL_Requests_Assignments')
        .select('Request_Assignment_ID')
        .eq('Request_Assignment_ID', requestId)
        .eq('Request_Assignment_User_ID', actorId)
        .maybeSingle();
      isResolver = !!assign;
    }
    if (!isAdmin && !isResolver) throw new Error('No autorizado para revocar participantes');

    const { error } = await supabase
      .from('TBL_Request_Participants')
      .delete().eq('Request_ID', requestId).eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
  deleteComment: async (payload, { supabase }) => {
    const { commentId } = payload as { commentId: number };
    const { error } = await supabase.from('TBL_Comments').delete().eq('Comment_ID', commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
