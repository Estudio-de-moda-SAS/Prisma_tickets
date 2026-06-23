import type { ActionHandler } from '../shared/types.ts';

export const orgUnitHandlers: Record<string, ActionHandler> = {
  getDepartments: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Departments')
      .select('Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding')
      .order('Department_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  getTeamsByDepartment: async (payload, { supabase }) => {
    const p = payload as { departmentId: number };
    const { data, error } = await supabase
      .from('TBL_Teams').select('Team_ID, Team_Name, Team_Code, Department_ID')
      .eq('Department_ID', p.departmentId).order('Team_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  getDepartmentsWithTeams: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Departments')
      .select(`
        Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding,
        teams:TBL_Teams!Department_ID (
          Team_ID, Team_Name, Team_Code, Department_ID
        )
      `)
      .order('Department_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  createDepartment: async (payload, { supabase }) => {
    const { name, code, isHidden } = payload as {
      name: string; code: string; isHidden: boolean;
    };
    const { data, error } = await supabase
      .from('TBL_Departments')
      .insert({
        Department_Name:             name.trim(),
        Department_Code:             code.trim().toLowerCase(),
        Is_Hidden_From_Onboarding:   isHidden,
        Created_At:                  new Date().toISOString(),
      })
      .select(`
        Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding,
        teams:TBL_Teams!Department_ID ( Team_ID, Team_Name, Team_Code, Department_ID )
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateDepartment: async (payload, { supabase }) => {
    const { id, name, code, isHidden } = payload as {
      id: number; name: string; code: string; isHidden: boolean;
    };
    const { error } = await supabase
      .from('TBL_Departments')
      .update({
        Department_Name:           name.trim(),
        Department_Code:           code.trim().toLowerCase(),
        Is_Hidden_From_Onboarding: isHidden,
      })
      .eq('Department_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  deleteDepartment: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    await supabase
      .from('TBL_Users')
      .update({ Department_ID: null, Team_ID: null, Is_New: true })
      .eq('Department_ID', id);
    await supabase.from('TBL_Teams').delete().eq('Department_ID', id);
    const { error } = await supabase
      .from('TBL_Departments').delete().eq('Department_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  createTeam: async (payload, { supabase }) => {
    const { departmentId, name, code } = payload as {
      departmentId: number; name: string; code: string;
    };
    const { data, error } = await supabase
      .from('TBL_Teams')
      .insert({
        Department_ID: departmentId,
        Team_Name:     name.trim(),
        Team_Code:     code.trim().toLowerCase(),
        Created_At:    new Date().toISOString(),
      })
      .select('Team_ID, Team_Name, Team_Code, Department_ID')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  updateTeam: async (payload, { supabase }) => {
    const { id, name, code } = payload as { id: number; name: string; code: string };
    const { error } = await supabase
      .from('TBL_Teams')
      .update({ Team_Name: name.trim(), Team_Code: code.trim().toLowerCase() })
      .eq('Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  deleteTeam: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    await supabase
      .from('TBL_Users')
      .update({ Team_ID: null, Is_New: true })
      .eq('Team_ID', id);
    const { error } = await supabase.from('TBL_Teams').delete().eq('Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
