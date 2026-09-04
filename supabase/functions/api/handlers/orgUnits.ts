/**
 * Handlers CRUD de la estructura organizacional: departamentos y equipos.
 *
 * Registrados en {@link orgUnitHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Modelan la jerarquía
 * organizacional (`TBL_Departments` → `TBL_Teams`) que se usa en el onboarding
 * y en la clasificación de usuarios. Ojo: son distintos de los *board teams*
 * (`TBL_Board_Teams`) del Kanban; acá se trata de la organización de personas,
 * no de tableros.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de unidades organizacionales indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const orgUnitHandlers: Record<string, ActionHandler> = {
  /**
   * Lista todos los departamentos, ordenados por nombre.
   *
   * @returns Los departamentos, incluyendo su flag `Is_Hidden_From_Onboarding`.
   */
  getDepartments: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Departments')
      .select('Department_ID, Department_Name, Department_Code, Is_Hidden_From_Onboarding')
      .order('Department_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Lista los equipos de un departamento, ordenados por nombre.
   *
   * @param payload - `{ departmentId }`.
   * @returns Los equipos que pertenecen a ese departamento.
   */
  getTeamsByDepartment: async (payload, { supabase }) => {
    const p = payload as { departmentId: number };
    const { data, error } = await supabase
      .from('TBL_Teams').select('Team_ID, Team_Name, Team_Code, Department_ID')
      .eq('Department_ID', p.departmentId).order('Team_Name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Lista los departamentos con sus equipos anidados.
   *
   * Versión combinada de {@link orgUnitHandlers.getDepartments} y
   * {@link orgUnitHandlers.getTeamsByDepartment}: trae cada departamento con su
   * arreglo `teams` embebido, en una sola consulta.
   *
   * @returns Departamentos ordenados por nombre, cada uno con sus equipos.
   */
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

  /**
   * Crea un departamento nuevo.
   *
   * Normaliza el nombre con `trim()` y el código a minúsculas.
   *
   * @param payload - `{ name, code, isHidden }`.
   * @returns El departamento creado, con su arreglo `teams` (vacío) embebido.
   */
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

  /**
   * Actualiza nombre, código y visibilidad en onboarding de un departamento.
   *
   * @param payload - `{ id, name, code, isHidden }`.
   * @returns `{ ok: true }` tras actualizar.
   */
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

  /**
   * Elimina un departamento y limpia sus dependencias.
   *
   * Antes de borrar el departamento, desvincula a sus usuarios (les pone
   * `Department_ID`/`Team_ID` en null y los marca como `Is_New` para que pasen
   * de nuevo por onboarding) y elimina sus equipos.
   *
   * @param payload - `{ id }`.
   * @returns `{ ok: true }` tras eliminar el departamento y sus vínculos.
   */
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

  /**
   * Crea un equipo nuevo dentro de un departamento.
   *
   * Normaliza el nombre con `trim()` y el código a minúsculas.
   *
   * @param payload - `{ departmentId, name, code }`.
   * @returns El equipo creado.
   */
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

  /**
   * Actualiza nombre y código de un equipo.
   *
   * @param payload - `{ id, name, code }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateTeam: async (payload, { supabase }) => {
    const { id, name, code } = payload as { id: number; name: string; code: string };
    const { error } = await supabase
      .from('TBL_Teams')
      .update({ Team_Name: name.trim(), Team_Code: code.trim().toLowerCase() })
      .eq('Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Elimina un equipo y desvincula a sus usuarios.
   *
   * Antes de borrar, pone `Team_ID` en null a sus usuarios y los marca como
   * `Is_New` para que retomen el onboarding.
   *
   * @param payload - `{ id }`.
   * @returns `{ ok: true }` tras eliminar el equipo y desvincular usuarios.
   */
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