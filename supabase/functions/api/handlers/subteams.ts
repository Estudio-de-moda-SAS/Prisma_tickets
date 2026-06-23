import type { ActionHandler } from '../shared/types.ts';

export const subTeamHandlers: Record<string, ActionHandler> = {
  fetchSubTeamsByTeamId: async (payload, { supabase }) => {
    const { teamId } = payload as { teamId: number };
    const { data, error } = await supabase
      .from('TBL_Sub_Teams').select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color')
      .eq('Sub_Team_Team_ID', teamId);
    if (error) throw new Error(error.message);
    return data;
  },

  createSubTeam: async (payload, { supabase }) => {
    const { teamId, name, color } = payload as { teamId: number; name: string; color: string };
    const { data, error } = await supabase
      .from('TBL_Sub_Teams')
      .insert({ Sub_Team_Team_ID: teamId, Sub_Team_Name: name, Sub_Team_Color: color })
      .select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color').single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateSubTeam: async (payload, { supabase }) => {
    const { id, name, color } = payload as { id: number; name: string; color: string };
    const { error } = await supabase
      .from('TBL_Sub_Teams').update({ Sub_Team_Name: name, Sub_Team_Color: color }).eq('Sub_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  deleteSubTeam: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase.from('TBL_Sub_Teams').delete().eq('Sub_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  fetchSubTeamMembers: async (payload, { supabase }) => {
    const { subTeamId } = payload as { subTeamId: number };
    const { data, error } = await supabase
      .from('TBL_Sub_Team_Members')
      .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
      .eq('Sub_Team_Member_Sub_Team_ID', subTeamId);
    if (error) throw new Error(error.message);
    return (data as { user: Record<string, unknown> }[]).map((r) => r.user);
  },

  addSubTeamMember: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    const { error } = await supabase.from('TBL_Sub_Team_Members').upsert(
      { Sub_Team_Member_Sub_Team_ID: subTeamId, Sub_Team_Member_User_ID: userId },
      { onConflict: 'Sub_Team_Member_Sub_Team_ID,Sub_Team_Member_User_ID' },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  removeSubTeamMember: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    const { error } = await supabase.from('TBL_Sub_Team_Members')
      .delete().eq('Sub_Team_Member_Sub_Team_ID', subTeamId).eq('Sub_Team_Member_User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
