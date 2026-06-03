import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationActionType,
} from '@/features/automations/types';

function mapRow(row: Record<string, unknown>): AutomationRule {
  return {
    ruleId:           row['Rule_ID']                     as number,
    ruleName:         row['Rule_Name']                   as string,
    ruleDescription:  (row['Rule_Description']           as string)  ?? null,
    teamId:           (row['Rule_Team_ID']               as number)  ?? null,
    teamName:         (row['team'] as any)?.Board_Team_Name          ?? null,
    trigger:          row['Rule_Trigger']                as AutomationTriggerType,
    triggerValue:     (row['Rule_Trigger_Value']         as string)  ?? null,
    action:           row['Rule_Action']                 as AutomationActionType,
    actionValue:      row['Rule_Action_Value']           as string,
    actionValueLabel: (row['Rule_Action_Resolved_Label'] as string)  ?? null,
    isActive:         row['Rule_Is_Active']              as boolean,
    execCount:        row['Rule_Exec_Count']             as number,
    lastExecAt:       (row['Rule_Last_Exec_At']          as string)  ?? null,
    createdAt:        row['Rule_Created_At']             as string,
  };
}

export const AUTOMATION_RULES_KEY = ['automation-rules'] as const;

export function useAutomationRules() {
  return useQuery({
    queryKey: [...AUTOMATION_RULES_KEY],
    queryFn: async () => {
      const res = await apiClient.call<Record<string, unknown>[]>(
        'fetchAutomationRules',
        {},
      );
      return res.map(mapRow);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export type CreateRuleParams = {
  name:         string;
  description:  string | null;
  teamId:       number | null;
  trigger:      AutomationTriggerType;
  triggerValue: string | null;
  action:       AutomationActionType;
  actionValue:  string;
};

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateRuleParams) =>
      apiClient.call('createAutomationRule', p as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: AUTOMATION_RULES_KEY }),
  });
}

export function useToggleAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: number; isActive: boolean }) =>
      apiClient.call('toggleAutomationRule', { ruleId, isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AUTOMATION_RULES_KEY }),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) =>
      apiClient.call('deleteAutomationRule', { ruleId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AUTOMATION_RULES_KEY }),
  });
}