/**
 * Handlers CRUD de etiquetas (labels) de tickets (`TBL_Labels`).
 *
 * Registrados en {@link labelHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Cada etiqueta pertenece a un
 * board y a un equipo; la relación con las solicitudes vive en la tabla puente
 * `TBL_Request_Labels`.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de etiquetas indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const labelHandlers: Record<string, ActionHandler> = {
  /**
   * Lista todas las etiquetas de un board (de todos sus equipos).
   *
   * @param payload - `{ boardId }`.
   * @returns Las etiquetas del board, incluyendo su `Label_Team_ID`.
   */
  fetchLabelsByBoardId: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon, Label_Team_ID')
      .eq('Label_Board_ID', boardId);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Lista las etiquetas de un equipo específico dentro de un board.
   *
   * @param payload - `{ boardId, teamId }`.
   * @returns Las etiquetas que pertenecen a ese equipo.
   */
  fetchLabelsByTeamId: async (payload, { supabase }) => {
    const { boardId, teamId } = payload as { boardId: number; teamId: number };
    const { data, error } = await supabase
      .from('TBL_Labels').select('Label_ID, Label_Name, Label_Color, Label_Icon')
      .eq('Label_Board_ID', boardId).eq('Label_Team_ID', teamId);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Crea una etiqueta nueva asociada a un board y un equipo.
   *
   * @param payload - `{ boardId, teamId, name, color, icon }`.
   * @returns La etiqueta creada.
   */
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

  /**
   * Actualiza nombre, color e ícono de una etiqueta.
   *
   * @param payload - `{ id, name, color, icon }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateLabel: async (payload, { supabase }) => {
    const { id, name, color, icon } = payload as { id: number; name: string; color: string; icon: string };
    const { error } = await supabase
      .from('TBL_Labels').update({ Label_Name: name, Label_Color: color, Label_Icon: icon }).eq('Label_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Elimina una etiqueta y sus asignaciones a solicitudes.
   *
   * Primero borra las filas puente en `TBL_Request_Labels` (para no dejar
   * referencias colgando) y luego la etiqueta en sí.
   *
   * @param payload - `{ id }`.
   * @returns `{ ok: true }` tras eliminar la etiqueta y sus vínculos.
   */
  deleteLabel: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    await supabase.from('TBL_Request_Labels').delete().eq('Request_Labels_Label_ID', id);
    const { error } = await supabase.from('TBL_Labels').delete().eq('Label_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};