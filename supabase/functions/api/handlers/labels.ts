import type { ActionHandler } from '../shared/types.ts';

export const labelHandlers: Record<string, ActionHandler> = {
  fetchLabelsByBoardId: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon, Label_Team_ID')
      .eq('Label_Board_ID', boardId);
    if (error) throw new Error(error.message);
    return data;
  },

  fetchLabelsByTeamId: async (payload, { supabase }) => {
    const { boardId, teamId } = payload as { boardId: number; teamId: number };
    const { data, error } = await supabase
      .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon')
      .eq('Label_Board_ID', boardId).eq('Label_Team_ID', teamId);
    if (error) throw new Error(error.message);
    return data;
  },

  createLabel: async (payload, { supabase }) => {
    const { boardId, teamId, name, color, icon } = payload as {
      boardId: number; teamId: number; name: string; color: string; icon: string;
    };
    const { data, error } = await supabase
      .from('TBL_Labels')
      .insert({ Label_Board_ID: boardId, Label_Team_ID: teamId, Label_Name: name, Label_Color: color, Label_Icon: icon })
      .select('Label_ID, Label_Name, Label_Color, Label_Icon').single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateLabel: async (payload, { supabase }) => {
    const { id, name, color, icon } = payload as { id: number; name: string; color: string; icon: string };
    const { error } = await supabase
      .from('TBL_Labels').update({ Label_Name: name, Label_Color: color, Label_Icon: icon }).eq('Label_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  deleteLabel: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Label_ID', id);
    const { error } = await supabase.from('TBL_Labels').delete().eq('Label_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
