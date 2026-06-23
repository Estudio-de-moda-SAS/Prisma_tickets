import type { ActionHandler } from '../shared/types.ts';

export const userHandlers: Record<string, ActionHandler> = {
  fetchUserByEntraId: async (payload, { supabase }) => {
    const { entraId } = payload as { entraId: string };
    const { data, error } = await supabase
      .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
      .eq('User_EntraID', entraId).single();
    if (error) throw new Error(error.message);
    return data;
  },

  fetchAllUsers: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Users')
      .select(`
        User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
        Department_ID, Team_ID, Is_New, "Is_Active",
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .order('User_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  upsertUserByEntraId: async (payload, { supabase }) => {
    const p = payload as { entraId: string; name: string; email: string };

    const { data: existing, error: findErr } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )')
      .eq('User_EntraID', p.entraId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (existing) {
      const teamId = (existing as any).Team_ID;
      let teamData = null;
      if (teamId) {
        const { data: t } = await supabase
          .from('TBL_Teams').select('Team_Code, Team_Name').eq('Team_ID', teamId).single();
        teamData = t;
      }
      return { ...existing, team: teamData };
    }

    const normalizedEmail = p.email.toLowerCase().trim();
    const { data: preReg, error: preRegErr } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active"')
      .eq('User_EntraID', '')
      .ilike('User_Email', normalizedEmail)
      .maybeSingle();
    if (preRegErr) throw new Error(preRegErr.message);

    if (preReg) {
      const { data: linked, error: linkErr } = await supabase
        .from('TBL_Users')
        .update({
          User_EntraID: p.entraId,
          User_Name:    p.name.slice(0, 150),
        })
        .eq('User_ID', (preReg as any).User_ID)
        .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )')
        .single();
      if (linkErr) throw new Error(linkErr.message);

      const teamId = (linked as any).Team_ID;
      let teamData = null;
      if (teamId) {
        const { data: t } = await supabase
          .from('TBL_Teams').select('Team_Code, Team_Name').eq('Team_ID', teamId).single();
        teamData = t;
      }
      return { ...(linked as any), team: teamData };
    }

    const { data, error: insertErr } = await supabase
      .from('TBL_Users')
      .insert({
        User_EntraID:    p.entraId,
        User_Name:       p.name.slice(0, 150),
        User_Email:      normalizedEmail,
        User_Avatar_url: '',
        User_Role:       'member',
        Is_New:          true,
        User_Created_At: new Date().toISOString(),
      })
      .select('User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New, "Is_Active", department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code )')
      .single();
    if (insertErr) throw new Error(insertErr.message);
    return { ...(data as any), team: null };
  },

  fetchMembersBySubTeams: async (payload, { supabase }) => {
    const { subTeamIds } = payload as { subTeamIds: number[] };
    if (!subTeamIds?.length) return [];

    const { data, error } = await supabase
      .from('TBL_Sub_Team_Members')
      .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
      .in('Sub_Team_Member_Sub_Team_ID', subTeamIds);

    if (error) throw new Error(error.message);

    const seen = new Set<number>();
    return (data as { user: Record<string, unknown> }[])
      .map((r) => r.user)
      .filter((u) => u && !seen.has(u['User_ID'] as number) && seen.add(u['User_ID'] as number));
  },

  preRegisterUser: async (payload, { supabase }) => {
    const p = payload as {
      email:        string;
      role:         'admin' | 'member';
      departmentId: number | null;
      teamId:       number | null;
      isNew:        boolean;
    };

    const normalizedEmail = p.email.toLowerCase().trim();

    const { data: existing } = await supabase
      .from('TBL_Users')
      .select('User_ID, User_Email')
      .ilike('User_Email', normalizedEmail)
      .maybeSingle();

    if (existing) throw new Error(`Ya existe un usuario con el correo ${normalizedEmail}`);

    const { data, error } = await supabase
      .from('TBL_Users')
      .insert({
        User_EntraID:    '',
        User_Name:       '',
        User_Email:      normalizedEmail,
        User_Avatar_url: '',
        User_Role:       p.role,
        Department_ID:   p.departmentId,
        Team_ID:         p.teamId,
        Is_New:          p.isNew,
        User_Created_At: new Date().toISOString(),
      })
      .select(`
        User_ID, User_Name, User_Email, User_Role,
        Department_ID, Team_ID, Is_New,
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  completeOnboarding: async (payload, { supabase }) => {
    const p = payload as { userId: number; departmentId: number; teamId: number | null };
    const { data, error } = await supabase
      .from('TBL_Users')
      .update({ Department_ID: p.departmentId, Team_ID: p.teamId, Is_New: false })
      .eq('User_ID', p.userId)
      .select(`User_ID, User_Name, User_Email, User_Role, Department_ID, Team_ID, Is_New,
               team:TBL_Teams!Team_ID ( Team_Code, Team_Name )`)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateUser: async (payload, { supabase }) => {
    const p = payload as {
      userId: number; role: 'admin' | 'member';
      departmentId: number | null; teamId: number | null; isNew: boolean;
    };

    const { data: current } = await supabase
      .from('TBL_Users')
      .select('Department_ID')
      .eq('User_ID', p.userId)
      .single();

    const departmentChanged = current?.Department_ID !== p.departmentId;
    const effectiveRole = (departmentChanged && p.departmentId !== null) ? 'member' : p.role;

    const { data, error } = await supabase
      .from('TBL_Users')
      .update({
        User_Role:     effectiveRole,
        Department_ID: p.departmentId,
        Team_ID:       p.teamId,
        Is_New:        p.isNew,
      })
      .eq('User_ID', p.userId)
      .select(`
        User_ID, User_Name, User_Email, User_Role,
        Department_ID, Team_ID, Is_New,
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  deactivateUser: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { error } = await supabase
      .from('TBL_Users')
      .update({ "Is_Active": false })
      .eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  reactivateUser: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    const { error } = await supabase
      .from('TBL_Users')
      .update({ "Is_Active": true })
      .eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
