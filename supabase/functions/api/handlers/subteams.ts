/**
 * Handlers CRUD de sub-equipos, sus integrantes y sus supervisores.
 *
 * Registrados en {@link subTeamHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Los sub-equipos
 * (`TBL_Sub_Teams`) cuelgan de un equipo y agrupan integrantes
 * (`TBL_Sub_Team_Members`) y supervisores (`TBL_Sub_Team_Supervisors`). Regla
 * del modelo: un supervisor debe ser también integrante del sub-equipo.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de sub-equipos indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const subTeamHandlers: Record<string, ActionHandler> = {
  /**
   * Lista los sub-equipos de un equipo con los IDs de sus supervisores.
   *
   * Aplana la relación anidada de supervisores a un arreglo `supervisorIds` por
   * sub-equipo.
   *
   * @param payload - `{ teamId }`.
   * @returns Los sub-equipos con `supervisorIds`.
   */
  fetchSubTeamsByTeamId: async (payload, { supabase }) => {
    const { teamId } = payload as { teamId: number };
    const { data, error } = await supabase
      .from('TBL_Sub_Teams')
      .select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color, supervisors:TBL_Sub_Team_Supervisors ( Sub_Team_Supervisor_User_ID )')
      .eq('Sub_Team_Team_ID', teamId);
    if (error) throw new Error(error.message);
    return (data as any[]).map((s) => ({
      Sub_Team_ID:    s.Sub_Team_ID,
      Sub_Team_Name:  s.Sub_Team_Name,
      Sub_Team_Color: s.Sub_Team_Color,
      supervisorIds:  (s.supervisors ?? []).map((x: any) => x.Sub_Team_Supervisor_User_ID),
    }));
  },

  /**
   * Crea un sub-equipo dentro de un equipo.
   *
   * @param payload - `{ teamId, name, color }`.
   * @returns El sub-equipo creado.
   */
  createSubTeam: async (payload, { supabase }) => {
    const { teamId, name, color } = payload as { teamId: number; name: string; color: string };
    const { data, error } = await supabase
      .from('TBL_Sub_Teams')
      .insert({ Sub_Team_Team_ID: teamId, Sub_Team_Name: name, Sub_Team_Color: color })
      .select('Sub_Team_ID, Sub_Team_Name, Sub_Team_Color').single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Actualiza nombre y color de un sub-equipo.
   *
   * @param payload - `{ id, name, color }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateSubTeam: async (payload, { supabase }) => {
    const { id, name, color } = payload as { id: number; name: string; color: string };
    const { error } = await supabase
      .from('TBL_Sub_Teams').update({ Sub_Team_Name: name, Sub_Team_Color: color }).eq('Sub_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Elimina un sub-equipo por su ID.
   *
   * @param payload - `{ id }`.
   * @returns `{ ok: true }` tras eliminar el sub-equipo.
   */
  deleteSubTeam: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase.from('TBL_Sub_Teams').delete().eq('Sub_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Lista los integrantes de un sub-equipo con sus datos de usuario.
   *
   * @param payload - `{ subTeamId }`.
   * @returns Los usuarios integrantes del sub-equipo.
   */
  fetchSubTeamMembers: async (payload, { supabase }) => {
    const { subTeamId } = payload as { subTeamId: number };
    const { data, error } = await supabase
      .from('TBL_Sub_Team_Members')
      .select(`user:TBL_Users!Sub_Team_Member_User_ID ( User_ID, User_Name, User_Email, User_Avatar_url, User_Role )`)
      .eq('Sub_Team_Member_Sub_Team_ID', subTeamId);
    if (error) throw new Error(error.message);
    return (data as { user: Record<string, unknown> }[]).map((r) => r.user);
  },

  /**
   * Agrega un integrante a un sub-equipo (idempotente).
   *
   * Usa upsert sobre la clave compuesta para no duplicar si ya es integrante.
   *
   * @param payload - `{ subTeamId, userId }`.
   * @returns `{ ok: true }` tras agregar al integrante.
   */
  addSubTeamMember: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    const { error } = await supabase.from('TBL_Sub_Team_Members').upsert(
      { Sub_Team_Member_Sub_Team_ID: subTeamId, Sub_Team_Member_User_ID: userId },
      { onConflict: 'Sub_Team_Member_Sub_Team_ID,Sub_Team_Member_User_ID' },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Quita un integrante de un sub-equipo y revoca su rol de supervisor.
   *
   * Como un supervisor debe ser integrante, al sacar al integrante también se
   * elimina su fila de supervisor para no dejar el modelo inconsistente.
   *
   * @param payload - `{ subTeamId, userId }`.
   * @returns `{ ok: true }` tras quitar integrante y supervisión.
   */
  removeSubTeamMember: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    const { error } = await supabase.from('TBL_Sub_Team_Members')
      .delete().eq('Sub_Team_Member_Sub_Team_ID', subTeamId).eq('Sub_Team_Member_User_ID', userId);
    if (error) throw new Error(error.message);
    await supabase.from('TBL_Sub_Team_Supervisors')
      .delete().eq('Sub_Team_Supervisor_Sub_Team_ID', subTeamId).eq('Sub_Team_Supervisor_User_ID', userId);
    return { ok: true };
  },

  /**
   * Lista los IDs de los supervisores de un sub-equipo.
   *
   * @param payload - `{ subTeamId }`.
   * @returns Arreglo de `User_ID` de los supervisores.
   */
  fetchSubTeamSupervisors: async (payload, { supabase }) => {
    const { subTeamId } = payload as { subTeamId: number };
    const { data, error } = await supabase
      .from('TBL_Sub_Team_Supervisors')
      .select('Sub_Team_Supervisor_User_ID')
      .eq('Sub_Team_Supervisor_Sub_Team_ID', subTeamId);
    if (error) throw new Error(error.message);
    return (data as any[]).map((r) => r.Sub_Team_Supervisor_User_ID);
  },

  /**
   * Marca a un integrante como supervisor del sub-equipo (idempotente).
   *
   * Valida primero que el usuario ya sea integrante del sub-equipo; si no lo es,
   * lanza error. El alta usa upsert sobre la clave compuesta para no duplicar.
   *
   * @param payload - `{ subTeamId, userId }`.
   * @returns `{ ok: true }` tras marcar al supervisor.
   * @throws Si el usuario no es integrante del sub-equipo.
   */
  addSubTeamSupervisor: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    // Validación: el supervisor DEBE ser integrante del sub-equipo
    const { data: member, error: memErr } = await supabase
      .from('TBL_Sub_Team_Members')
      .select('Sub_Team_Member_User_ID')
      .eq('Sub_Team_Member_Sub_Team_ID', subTeamId)
      .eq('Sub_Team_Member_User_ID', userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!member) throw new Error('El supervisor debe ser integrante del sub-equipo.');
    const { error } = await supabase.from('TBL_Sub_Team_Supervisors').upsert(
      { Sub_Team_Supervisor_Sub_Team_ID: subTeamId, Sub_Team_Supervisor_User_ID: userId },
      { onConflict: 'Sub_Team_Supervisor_Sub_Team_ID,Sub_Team_Supervisor_User_ID' },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Quita el rol de supervisor a un usuario en un sub-equipo.
   *
   * No lo saca como integrante; solo revoca la supervisión.
   *
   * @param payload - `{ subTeamId, userId }`.
   * @returns `{ ok: true }` tras revocar la supervisión.
   */
  removeSubTeamSupervisor: async (payload, { supabase }) => {
    const { subTeamId, userId } = payload as { subTeamId: number; userId: number };
    const { error } = await supabase.from('TBL_Sub_Team_Supervisors')
      .delete()
      .eq('Sub_Team_Supervisor_Sub_Team_ID', subTeamId)
      .eq('Sub_Team_Supervisor_User_ID', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};