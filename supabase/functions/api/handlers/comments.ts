import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { insertNotifications } from '../shared/notifications.ts';
// @ts-ignore
import { getRequestParticipants } from '../shared/requests.ts';

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

  createComment: async (payload, { supabase }) => {
    const { requestId, userId, text } = payload as { requestId: string; userId: number; text: string };
    const { data, error } = await supabase
      .from('TBL_Comments')
      .insert({
        Comment_Request_ID: requestId,
        Comment_User_ID:    userId,
        Comment_Text:       text.trim(),
        Comment_Created_At: new Date().toISOString(),
      })
      .select(`Comment_ID, Comment_Text, Comment_Created_At,
               author:TBL_Users!Comment_User_ID ( User_ID, User_Name, User_Avatar_url )`)
      .single();
    if (error) throw new Error(error.message);

    const { assigneeIds, requestedBy } = await getRequestParticipants(supabase, requestId);
    const recipientIds = [...new Set([...assigneeIds, ...(requestedBy ? [requestedBy] : [])])]
      .filter((uid) => uid !== userId);
    if (recipientIds.length > 0) {
      const preview = text.trim().slice(0, 80) + (text.trim().length > 80 ? '…' : '');
      await insertNotifications(supabase, {
        userIds:   recipientIds,
        type:      'comment',
        title:     `Nuevo comentario en ${requestId}`,
        body:      preview,
        requestId: requestId,
        actorId:   userId,
      });
    }
    return data;
  },

  deleteComment: async (payload, { supabase }) => {
    const { commentId } = payload as { commentId: number };
    const { error } = await supabase.from('TBL_Comments').delete().eq('Comment_ID', commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
