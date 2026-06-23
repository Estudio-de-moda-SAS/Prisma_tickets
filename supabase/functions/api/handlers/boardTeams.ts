import type { ActionHandler } from '../shared/types.ts';

export const boardTeamHandlers: Record<string, ActionHandler> = {
  fetchAllTeams: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Icon, Board_Team_Is_Admin_Only, Board_Team_Sort_Order')
      .order('Board_Team_Sort_Order', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  fetchTeamsByBoardId: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description')
      .eq('Board_Team_ID', boardId);
    if (error) throw new Error(error.message);
    return data;
  },

  createKanbanTeam: async (payload, { supabase }) => {
    const { name, code, color, description, icon, isAdminOnly } = payload as {
      name: string; code: string; color: string; description: string; icon?: string; isAdminOnly?: boolean;
    };
    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .insert({
        Board_Team_Name:           name.trim(),
        Board_Team_Code:           code.trim().toLowerCase(),
        Board_Team_Color:          color,
        Board_Team_Description:    description?.trim() || null,
        Board_Team_Icon:           icon ?? '🗂️',
        Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
      })
      .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Is_Admin_Only')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateKanbanTeam: async (payload, { supabase }) => {
    const { id, name, code, description, color, icon, isAdminOnly } = payload as {
      id: number; name: string; code: string; color: string; description: string; icon?: string; isAdminOnly?: boolean;
    };
    const { error } = await supabase
      .from('TBL_Board_Teams')
      .update({
        Board_Team_Name:           name.trim(),
        Board_Team_Code:           code.trim().toLowerCase(),
        Board_Team_Color:          color,
        Board_Team_Description:    description?.trim() || null,
        Board_Team_Icon:           icon ?? '🗂️',
        Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
      })
      .eq('Board_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  reorderBoardTeam: async (payload, { supabase }) => {
    const { teamId, direction } = payload as { teamId: number; direction: 'up' | 'down' };

    const { data: teams, error: teamsErr } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Sort_Order')
      .order('Board_Team_Sort_Order', { ascending: true });
    if (teamsErr) throw new Error(teamsErr.message);

    const sorted = teams as { Board_Team_ID: number; Board_Team_Sort_Order: number }[];
    const idx = sorted.findIndex((t) => t.Board_Team_ID === teamId);
    if (idx === -1) return { ok: true };

    const si = direction === 'up' ? idx - 1 : idx + 1;
    if (si < 0 || si >= sorted.length) return { ok: true };

    const posA = sorted[idx].Board_Team_Sort_Order;
    const posB = sorted[si].Board_Team_Sort_Order;
    const idB  = sorted[si].Board_Team_ID;

    await Promise.all([
      supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: posB }).eq('Board_Team_ID', teamId),
      supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: posA }).eq('Board_Team_ID', idB),
    ]);
    return { ok: true };
  },
};
