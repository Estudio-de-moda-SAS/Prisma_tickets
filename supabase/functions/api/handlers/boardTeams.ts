/**
 * Handlers de equipos/boards del Kanban y control de visibilidad por usuario.
 *
 * Registrados en {@link boardTeamHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Cubre el CRUD de boards
 * (`TBL_Board_Teams`), su reordenamiento dentro de un mismo departamento, y los
 * grants de acceso por usuario (`TBL_Board_Team_Access`).
 *
 * En el modelo, un board puede ser *externo* (link a otro sistema) o de
 * *integración* (p. ej. SOLVI), pero nunca ambos: son excluyentes.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { resolveVisibleBoardIds } from '../shared/boardAccess.ts';

/**
 * Select reutilizado: board team + su departamento (para agrupar en el sidebar).
 */
const BOARD_TEAM_SELECT =
  'Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Icon, Board_Team_Is_Admin_Only, Board_Team_Is_External, Board_Team_External_URL, Board_Team_Is_Active, Board_Team_Is_Integration, Board_Team_Integration_Key, Board_Team_Sort_Order, Department_ID, department:TBL_Departments!Department_ID ( Department_ID, Department_Name )';

/**
 * Mapa de handlers de boards indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const boardTeamHandlers: Record<string, ActionHandler> = {
  /**
   * Lista todos los boards, ordenados por posición y luego por ID.
   *
   * @returns Todos los boards con su departamento embebido.
   */
  fetchAllTeams: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .select(BOARD_TEAM_SELECT)
      .order('Board_Team_Sort_Order', { ascending: true })
      .order('Board_Team_ID', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Trae los datos básicos de un board por su ID.
   *
   * @param payload - `{ boardId }`.
   * @returns El board coincidente (campos reducidos).
   */
  fetchTeamsByBoardId: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description')
      .eq('Board_Team_ID', boardId);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Crea un board nuevo y lo coloca al final del orden.
   *
   * Aplica las reglas de exclusión externo/integración: si es de integración,
   * fuerza `external = false`; un board externo exige `externalUrl` y uno de
   * integración exige `integrationKey`, lanzando error si faltan. El código se
   * normaliza a minúsculas y la posición se calcula como el máximo actual + 1.
   *
   * @param payload - Datos del board (`name`, `code`, `color`, flags, etc.).
   * @returns El board creado.
   * @throws Si un board externo no trae URL o uno de integración no trae clave.
   */
  createKanbanTeam: async (payload, { supabase }) => {
    const { name, code, color, description, icon, isAdminOnly, isExternal, externalUrl, isActive, departmentId, isIntegration, integrationKey } = payload as {
      name: string; code: string; color: string; description: string;
      icon?: string; isAdminOnly?: boolean; isExternal?: boolean; externalUrl?: string; isActive?: boolean;
      departmentId?: number | null; isIntegration?: boolean; integrationKey?: string | null;
    };

    const integration = isIntegration ?? false;
    // Un equipo de integración nunca es externo (excluyentes en el modelo).
    const external = integration ? false : (isExternal ?? false);
    const cleanUrl = external ? (externalUrl?.trim() || null) : null;
    if (external && !cleanUrl) {
      throw new Error('Un equipo externo requiere un link de destino.');
    }
    // La clave de integración ('solvi', etc.) solo aplica a equipos integrados.
    const cleanIntegrationKey = integration ? (integrationKey?.trim() || null) : null;
    if (integration && !cleanIntegrationKey) {
      throw new Error('Un equipo de integración requiere una clave de integración.');
    }

    // Siguiente posición: max actual + 1 (los nuevos van al final)
    const { data: maxRow, error: maxErr } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_Sort_Order')
      .order('Board_Team_Sort_Order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new Error(maxErr.message);
    const nextOrder = (maxRow?.Board_Team_Sort_Order ?? 0) + 1;

    const { data, error } = await supabase
      .from('TBL_Board_Teams')
      .insert({
        Board_Team_Name:           name.trim(),
        Board_Team_Code:           code.trim().toLowerCase(),
        Board_Team_Color:          color,
        Board_Team_Description:    description?.trim() || null,
        Board_Team_Icon:           icon ?? '🗂️',
        Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
        Board_Team_Is_External:    external,
        Board_Team_External_URL:   cleanUrl,
        Board_Team_Is_Integration: integration,
        Board_Team_Integration_Key: cleanIntegrationKey,
        Board_Team_Sort_Order:     nextOrder,
        Board_Team_Is_Active:      isActive ?? true,
        Department_ID:             departmentId ?? null,
      })
      .select('Board_Team_ID, Board_Team_Name, Board_Team_Code, Board_Team_Color, Board_Team_Description, Board_Team_Icon, Board_Team_Is_Admin_Only, Board_Team_Is_External, Board_Team_External_URL, Board_Team_Is_Integration, Board_Team_Integration_Key, Board_Team_Sort_Order, Department_ID')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Actualiza un board existente por ID.
   *
   * Aplica las mismas reglas de exclusión externo/integración y normalización
   * que {@link boardTeamHandlers.createKanbanTeam}, pero no altera el orden.
   *
   * @param payload - `{ id, ...datos del board }`.
   * @returns `{ ok: true }` tras actualizar.
   * @throws Si un board externo no trae URL o uno de integración no trae clave.
   */
  updateKanbanTeam: async (payload, { supabase }) => {
    const { id, name, code, description, color, icon, isAdminOnly, isExternal, externalUrl, isActive, departmentId, isIntegration, integrationKey } = payload as {
      id: number; name: string; code: string; color: string; description: string;
      icon?: string; isAdminOnly?: boolean; isExternal?: boolean; externalUrl?: string; isActive?: boolean;
      departmentId?: number | null; isIntegration?: boolean; integrationKey?: string | null;
    };

    const integration = isIntegration ?? false;
    // Un equipo de integración nunca es externo (excluyentes en el modelo).
    const external = integration ? false : (isExternal ?? false);
    const cleanUrl = external ? (externalUrl?.trim() || null) : null;
    if (external && !cleanUrl) {
      throw new Error('Un equipo externo requiere un link de destino.');
    }
    // La clave de integración ('solvi', etc.) solo aplica a equipos integrados.
    const cleanIntegrationKey = integration ? (integrationKey?.trim() || null) : null;
    if (integration && !cleanIntegrationKey) {
      throw new Error('Un equipo de integración requiere una clave de integración.');
    }

    const { error } = await supabase
      .from('TBL_Board_Teams')
      .update({
        Board_Team_Name:           name.trim(),
        Board_Team_Code:           code.trim().toLowerCase(),
        Board_Team_Color:          color,
        Board_Team_Description:    description?.trim() || null,
        Board_Team_Icon:           icon ?? '🗂️',
        Board_Team_Is_Admin_Only:  isAdminOnly ?? false,
        Board_Team_Is_External:    external,
        Board_Team_External_URL:   cleanUrl,
        Board_Team_Is_Integration: integration,
        Board_Team_Integration_Key: cleanIntegrationKey,
        Board_Team_Is_Active:      isActive ?? true,
        Department_ID:             departmentId ?? null,
      })
      .eq('Board_Team_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Mueve un board una posición hacia arriba o abajo dentro de su departamento.
   *
   * El reordenamiento está acotado al subconjunto de boards del mismo
   * `Department_ID` (incluido el grupo `null`): solo intercambia el
   * `Board_Team_Sort_Order` con el vecino inmediato de ese grupo, dejando
   * intactos los demás departamentos. Si el board ya está en el extremo de su
   * grupo, no hace nada.
   *
   * @param payload - `{ teamId, direction: 'up' | 'down' }`.
   * @returns `{ ok: true }` (idempotente aunque no haya movimiento).
   */
  reorderBoardTeam: async (payload, { supabase }) => {
    const { teamId, direction } = payload as { teamId: number; direction: 'up' | 'down' };

    // El kanban que se mueve — necesitamos su departamento para el scope.
    const { data: moving, error: movErr } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Sort_Order, Department_ID')
      .eq('Board_Team_ID', teamId)
      .single();
    if (movErr) throw new Error(movErr.message);
    if (!moving) return { ok: true };

    // Kanbans del MISMO departamento (null incluido), ordenados.
    // El swap solo ocurre entre vecinos de este subconjunto.
    let scopeQuery = supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Sort_Order')
      .order('Board_Team_Sort_Order', { ascending: true })
      .order('Board_Team_ID', { ascending: true });

    scopeQuery = moving.Department_ID === null
      ? scopeQuery.is('Department_ID', null)
      : scopeQuery.eq('Department_ID', moving.Department_ID);

    const { data: scope, error: scopeErr } = await scopeQuery;
    if (scopeErr) throw new Error(scopeErr.message);

    const list = (scope ?? []) as { Board_Team_ID: number; Board_Team_Sort_Order: number }[];
    const idx  = list.findIndex((t) => t.Board_Team_ID === teamId);
    if (idx === -1) return { ok: true };

    const si = direction === 'up' ? idx - 1 : idx + 1;
    if (si < 0 || si >= list.length) return { ok: true }; // ya está en el extremo de su grupo

    // Permutamos SOLO los valores de Sort_Order entre los dos vecinos del grupo.
    // El orden global se mantiene coherente; el resto de departamentos no se toca.
    const a = list[idx];
    const b = list[si];
    await Promise.all([
      supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: b.Board_Team_Sort_Order }).eq('Board_Team_ID', a.Board_Team_ID),
      supabase.from('TBL_Board_Teams').update({ Board_Team_Sort_Order: a.Board_Team_Sort_Order }).eq('Board_Team_ID', b.Board_Team_ID),
    ]);
    return { ok: true };
  },

  /* ============================================================
     VISIBILIDAD DE BOARDS — pass de acceso por usuario
     ============================================================ */

  /**
   * Lista los boards visibles para un usuario según su nivel de acceso.
   *
   * Delega en `resolveVisibleBoardIds`, cuyo resultado se interpreta así:
   * `null` = sin restricción (admin), no se filtra por ID; `[]` = sin acceso a
   * nada, se devuelve vacío sin consultar la DB; una lista = se filtra por esos
   * IDs.
   *
   * @param payload - `{ userId }`.
   * @returns Los boards visibles para el usuario, con su departamento embebido.
   */
  fetchMyBoardTeams: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    if (!userId) return [];

    const visibleIds = await resolveVisibleBoardIds(supabase, userId);

    // [] → restringido a nada: devolvemos vacío sin pegarle a la DB.
    if (visibleIds !== null && visibleIds.length === 0) return [];

    let query = supabase
      .from('TBL_Board_Teams')
      .select(BOARD_TEAM_SELECT)
      .order('Board_Team_Sort_Order', { ascending: true })
      .order('Board_Team_ID', { ascending: true });

    // null → sin restricción (admin): no filtramos por ID.
    if (visibleIds !== null) {
      query = query.in('Board_Team_ID', visibleIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Trae los IDs de boards a los que un usuario tiene acceso explícito.
   *
   * Alimenta el multi-select del formulario de edición de usuario.
   *
   * @param payload - `{ userId }`.
   * @returns Arreglo de `Board_Team_ID` con grant activo para el usuario.
   */
  fetchUserBoardAccess: async (payload, { supabase }) => {
    const { userId } = payload as { userId: number };
    if (!userId) return [];
    const { data, error } = await supabase
      .from('TBL_Board_Team_Access')
      .select('Board_Team_ID')
      .eq('User_ID', userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { Board_Team_ID: number }) => r.Board_Team_ID);
  },

  /**
   * Reemplaza el set completo de grants de acceso de un usuario.
   *
   * Estrategia delete-all + insert: borra todos los grants actuales del usuario
   * y luego inserta los nuevos (si los hay), registrando quién los otorgó.
   *
   * @param payload - `{ userId, boardTeamIds, actorId? }`.
   * @returns `{ ok: true, count }` con la cantidad de grants otorgados.
   * @throws Si no se provee `userId`.
   */
  setUserBoardAccess: async (payload, { supabase }) => {
    const { userId, boardTeamIds, actorId } = payload as {
      userId: number; boardTeamIds: number[]; actorId?: number | null;
    };
    if (!userId) throw new Error('[setUserBoardAccess] userId requerido');

    const { error: delErr } = await supabase
      .from('TBL_Board_Team_Access')
      .delete()
      .eq('User_ID', userId);
    if (delErr) throw new Error(delErr.message);

    if (Array.isArray(boardTeamIds) && boardTeamIds.length > 0) {
      const rows = boardTeamIds.map((bid) => ({
        User_ID:       userId,
        Board_Team_ID: bid,
        Granted_By:    actorId ?? null,
      }));
      const { error: insErr } = await supabase
        .from('TBL_Board_Team_Access')
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true, count: boardTeamIds?.length ?? 0 };
  },
};