import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type EmailTemplate = {
  Email_Template_ID:        number;
  Email_Template_Name:      string;
  Email_Template_Subject:   string;
  Email_Template_Body_html: string;
  Email_Template_Body_Text: string;
  Email_Template_Event_Key: string;
  Email_Template_Is_Active: boolean;
  Email_Template_Variables: string[];
  Email_Template_Updated_At: string;
};

const QUERY_KEY = (boardId: number) => ['emailTemplates', boardId];

export function useEmailTemplates(boardId: number) {
  return useQuery({
    queryKey: QUERY_KEY(boardId),
    queryFn:  () => apiClient.call<EmailTemplate[]>('fetchEmailTemplates', { boardId }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; subject: string; html: string; text: string }) =>
      apiClient.call('updateEmailTemplate', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

export function useToggleEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; isActive: boolean }) =>
      apiClient.call('toggleEmailTemplate', p),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY(boardId) });
      const snap = qc.getQueryData<EmailTemplate[]>(QUERY_KEY(boardId));
      qc.setQueryData<EmailTemplate[]>(QUERY_KEY(boardId), (prev) =>
        prev?.map((t) => t.Email_Template_ID === p.id
          ? { ...t, Email_Template_Is_Active: p.isActive } : t)
      );
      return { snap };
    },
    onError: (_err, _p, ctx) => {
      if (ctx?.snap) qc.setQueryData(QUERY_KEY(boardId), ctx.snap);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

export function useCreateEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      name: string; eventKey: string; subject: string; variables: string[];
    }) => apiClient.call<EmailTemplate>('createEmailTemplate', { boardId, ...p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

export function useDeleteEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteEmailTemplate', { id }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY(boardId) });
      const snap = qc.getQueryData<EmailTemplate[]>(QUERY_KEY(boardId));
      qc.setQueryData<EmailTemplate[]>(QUERY_KEY(boardId), (prev) =>
        prev?.filter((t) => t.Email_Template_ID !== id)
      );
      return { snap };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snap) qc.setQueryData(QUERY_KEY(boardId), ctx.snap);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

// Variables base hardcodeadas como fallback para los 6 eventos del sistema
export const EMAIL_EVENT_VARIABLES_FALLBACK: Record<string, string[]> = {
  assignRequest:                  ['ticket_id', 'ticket_title', 'ticket_url', 'assignee_name', 'actor_name'],
  createComment:                  ['ticket_id', 'ticket_title', 'ticket_url', 'actor_name', 'comment_preview'],
  moveToColumn:                   ['ticket_id', 'ticket_title', 'ticket_url', 'column_name', 'actor_name'],
  closeRequest:                   ['ticket_id', 'ticket_title', 'ticket_url', 'actor_name', 'closure_notes'],
  updateAcceptanceCriteriaStatus: ['ticket_id', 'ticket_title', 'ticket_url', 'criteria_title', 'new_status', 'actor_name'],
  submitClientFeedback:           ['ticket_id', 'ticket_title', 'ticket_url', 'feedback_status', 'actor_name'],
};

// Helper para obtener variables de un template — usa las de DB si existen, si no el fallback
export function getTemplateVariables(template: EmailTemplate): string[] {
  if (template.Email_Template_Variables?.length > 0) {
    return template.Email_Template_Variables;
  }
  return EMAIL_EVENT_VARIABLES_FALLBACK[template.Email_Template_Event_Key] ?? [];
}

export function useUpdateEmailTemplateMetadata(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; name: string; subject: string; variables: string[] }) =>
      apiClient.call('updateEmailTemplateMetadata', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}