// supabase/functions/api/handlers/history.ts
import type { ActionHandler } from '../shared/types.ts';

export const historyHandlers: Record<string, ActionHandler> = {
  fetchRequestHistory: async (payload, { supabase }) => {
    const { requestId, requesterId } = payload as { requestId: string; requesterId: number };
    if (!requestId)   throw new Error('requestId requerido');
    if (!requesterId) throw new Error('requesterId requerido');

    // ── Gating: admin siempre; si no, debe supervisar algún sub-equipo del ticket ──
    const { data: u, error: uErr } = await supabase
      .from('TBL_Users').select('User_Role').eq('User_ID', requesterId).single();
    if (uErr) throw new Error(uErr.message);

    if ((u as any)?.User_Role !== 'admin') {
      const { data: rst } = await supabase
        .from('TBL_Request_Sub_Team')
        .select('Request_Sub_Team_ID')
        .eq('Request_Sub_Team_Request_ID', requestId);
      const subIds = ((rst ?? []) as any[]).map((r) => r.Request_Sub_Team_ID);
      if (subIds.length === 0) throw new Error('FORBIDDEN: sin permiso para ver el historial');

      const { data: sup } = await supabase
        .from('TBL_Sub_Team_Supervisors')
        .select('Sub_Team_Supervisor_Sub_Team_ID')
        .in('Sub_Team_Supervisor_Sub_Team_ID', subIds)
        .eq('Sub_Team_Supervisor_User_ID', requesterId)
        .limit(1);
      if (!sup || sup.length === 0) throw new Error('FORBIDDEN: sin permiso para ver el historial');
    }

    const { data, error } = await supabase
      .from('TBL_Requests_History')
      .select(`
        Request_History_ID, Request_History_Request_ID, Request_History_Action,
        Request_History_Field, Request_History_Old_Value, Request_History_New_Value,
        Request_History_Metadata, Request_History_Changed_At,
        actor:TBL_Users!Request_History_Changed_By ( User_ID, User_Name, User_Avatar_url )
      `)
      .eq('Request_History_Request_ID', requestId)
      .order('Request_History_Changed_At', { ascending: false });
    if (error) throw new Error(`fetchRequestHistory: ${error.message}`);
    return data ?? [];
  },
};