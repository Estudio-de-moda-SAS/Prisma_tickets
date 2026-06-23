import type { ActionHandler } from '../shared/types.ts';

export const automationRuleHandlers: Record<string, ActionHandler> = {
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

  toggleAutomationRule: async (payload, { supabase }) => {
    const { ruleId, isActive } = payload as { ruleId: number; isActive: boolean };
    const { error } = await supabase
      .from('TBL_Automation_Rules')
      .update({ Rule_Is_Active: isActive })
      .eq('Rule_ID', ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

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
