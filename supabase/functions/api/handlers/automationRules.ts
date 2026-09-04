/**
 * Handlers CRUD de reglas de automatización (`TBL_Automation_Rules`).
 *
 * Registrados en {@link automationRuleHandlers} y despachados desde el Edge
 * Function único vía el envelope `{ action, payload }`. Cada regla define un
 * disparador (`Rule_Trigger`) y una acción (`Rule_Action`) con su valor; el
 * valor de la acción se guarda como string genérico y se resuelve a una
 * etiqueta legible al momento de listar.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de reglas de automatización indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const automationRuleHandlers: Record<string, ActionHandler> = {
  /**
   * Lista todas las reglas con una etiqueta legible de su acción.
   *
   * Trae las reglas con su equipo embebido y luego resuelve
   * `Rule_Action_Value` a `Rule_Action_Resolved_Label` según el tipo de acción:
   * nombre de usuario para `asignar_resolutor`, etiqueta de prioridad para
   * `asignar_prioridad`, y etiqueta de audiencia (o nombre de usuario como
   * fallback) para `notificar_usuario`. Los nombres de usuario se resuelven en
   * una sola query batch a partir de los IDs numéricos presentes.
   *
   * @returns Reglas ordenadas por fecha de creación descendente, cada una con
   *          `Rule_Action_Resolved_Label`.
   */
  fetchAutomationRules: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Automation_Rules')
      .select(`
        Rule_ID, Rule_Name, Rule_Description, Rule_Team_ID,
        Rule_Trigger, Rule_Trigger_Value, Rule_Action, Rule_Action_Value,
        Rule_Is_Active, Rule_Exec_Count, Rule_Last_Exec_At, Rule_Created_At,
        team:TBL_Board_Teams!Rule_Team_ID ( Board_Team_ID, Board_Team_Name, Board_Team_Code )
      `)
      .order('Rule_Created_At', { ascending: false });
    if (error) throw new Error(error.message);

    const rows = data as any[];

    // IDs de usuario únicos referenciados por acciones que apuntan a un resolutor.
    const resolverIds = [...new Set(
      rows
        .filter((r) =>
          (r.Rule_Action === 'asignar_resolutor' || r.Rule_Action === 'notificar_usuario') &&
          r.Rule_Action_Value &&
          !isNaN(parseInt(r.Rule_Action_Value, 10)),
        )
        .map((r) => parseInt(r.Rule_Action_Value, 10)),
    )];

    const userMap: Record<number, string> = {};
    if (resolverIds.length > 0) {
      const { data: users } = await supabase
        .from('TBL_Users')
        .select('User_ID, User_Name')
        .in('User_ID', resolverIds);
      for (const u of (users ?? []) as any[])
        userMap[u.User_ID as number] = u.User_Name as string;
    }

    const PRIO: Record<string, string> = {
      baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
    };
    const NOTIFY_LABELS: Record<string, string> = {
      'asignados':   'Resolutores asignados',
      'solicitante': 'Solicitante',
      'todos':       'Todos los participantes',
    };

    return rows.map((r) => ({
      ...r,
      Rule_Action_Resolved_Label:
        r.Rule_Action === 'asignar_resolutor'
          ? (userMap[parseInt(r.Rule_Action_Value, 10)] ?? null)
          : r.Rule_Action === 'asignar_prioridad'
          ? (PRIO[r.Rule_Action_Value] ?? null)
          : r.Rule_Action === 'notificar_usuario'
          ? (NOTIFY_LABELS[r.Rule_Action_Value] ?? userMap[parseInt(r.Rule_Action_Value, 10)] ?? null)
          : null,
    }));
  },

  /**
   * Crea una regla de automatización nueva (activa por defecto).
   *
   * Normaliza con `trim()` el nombre y la descripción, e inicializa el contador
   * de ejecuciones en 0.
   *
   * @param payload - `{ name, description, teamId, trigger, triggerValue, action, actionValue }`.
   * @returns La regla creada con su equipo embebido.
   */
  createAutomationRule: async (payload, { supabase }) => {
    const p = payload as {
      name: string; description: string | null; teamId: number | null;
      trigger: string; triggerValue: string | null;
      action: string; actionValue: string;
    };
    const { data, error } = await supabase
      .from('TBL_Automation_Rules')
      .insert({
        Rule_Name:          p.name.trim(),
        Rule_Description:   p.description?.trim() ?? null,
        Rule_Team_ID:       p.teamId ?? null,
        Rule_Trigger:       p.trigger,
        Rule_Trigger_Value: p.triggerValue ?? null,
        Rule_Action:        p.action,
        Rule_Action_Value:  p.actionValue,
        Rule_Is_Active:     true,
        Rule_Exec_Count:    0,
        Rule_Created_At:    new Date().toISOString(),
      })
      .select(`
        Rule_ID, Rule_Name, Rule_Description, Rule_Team_ID,
        Rule_Trigger, Rule_Trigger_Value, Rule_Action, Rule_Action_Value,
        Rule_Is_Active, Rule_Exec_Count, Rule_Last_Exec_At, Rule_Created_At,
        team:TBL_Board_Teams!Rule_Team_ID ( Board_Team_ID, Board_Team_Name, Board_Team_Code )
      `)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Activa o desactiva una regla sin eliminarla.
   *
   * @param payload - `{ ruleId, isActive }`.
   * @returns `{ ok: true }` tras actualizar el estado.
   */
  toggleAutomationRule: async (payload, { supabase }) => {
    const { ruleId, isActive } = payload as { ruleId: number; isActive: boolean };
    const { error } = await supabase
      .from('TBL_Automation_Rules')
      .update({ Rule_Is_Active: isActive })
      .eq('Rule_ID', ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Elimina una regla de automatización de forma permanente.
   *
   * @param payload - `{ ruleId }`.
   * @returns `{ ok: true }` tras eliminar la regla.
   */
  deleteAutomationRule: async (payload, { supabase }) => {
    const { ruleId } = payload as { ruleId: number };
    const { error } = await supabase
      .from('TBL_Automation_Rules')
      .delete()
      .eq('Rule_ID', ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};