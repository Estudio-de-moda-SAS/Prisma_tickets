import type { ActionHandler } from '../shared/types.ts';

export const userHandlers: Record<string, ActionHandler> = {
  fetchUserByEntraId: async (payload, { supabase }) => {
    const { entraId } = payload as { entraId: string };
    const { data, error } = await supabase
      .from('TBL_Users').select('User_ID, User_Name, User_Email, User_Role')
      .eq('User_EntraID', entraId)
      .order('User_ID', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`USER_NOT_FOUND: ${entraId}`);
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

    const { data: userId, error: rpcErr } = await supabase.rpc('upsert_user_by_entra_id', {
      p_entra_id: p.entraId,
      p_name:     p.name  ?? '',
      p_email:    p.email ?? '',
    });
    if (rpcErr) throw new Error(`[upsertUserByEntraId] ${rpcErr.message}`);
    if (!userId) throw new Error('[upsertUserByEntraId] no se resolvió User_ID');

    const { data, error } = await supabase
      .from('TBL_Users')
      .select(`
        User_ID, User_Name, User_Email, User_Avatar_url, User_Role,
        Department_ID, Team_ID, Is_New, "Is_Active",
        department:TBL_Departments!Department_ID ( Department_ID, Department_Name, Department_Code ),
        team:TBL_Teams!Team_ID ( Team_ID, Team_Name, Team_Code )
      `)
      .eq('User_ID', userId)
      .single();
    if (error) throw new Error(`[upsertUserByEntraId] ${error.message}`);
    return data;
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

    // Identidad primaria del pre-registro: sin EntraID todavía, se completa
    // en el primer login. Sin esto la RPC no puede resolverlo por identidad.
    await supabase.from('TBL_User_Identities').insert({
      Identity_User_ID:    (data as any).User_ID,
      Identity_Email:      normalizedEmail,
      Identity_Is_Primary: true,
    });

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
