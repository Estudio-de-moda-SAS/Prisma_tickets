import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para las plantillas de correo de un board.
 *
 * Expone la query de listado ({@link useEmailTemplates}), las mutaciones de
 * crear, actualizar (contenido y metadata), activar/desactivar y eliminar, y
 * utilidades para resolver las variables disponibles de cada plantilla
 * ({@link EMAIL_EVENT_VARIABLES_FALLBACK}, {@link getTemplateVariables}).
 *
 * @module useEmailTemplates
 */

/** Una plantilla de correo tal como viene de la base. */
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

/** Fábrica de la query key de plantillas, por board. */
const QUERY_KEY = (boardId: number) => ['emailTemplates', boardId];

/**
 * Lista las plantillas de correo de un board.
 *
 * @remarks
 * `staleTime` de 5 minutos.
 *
 * @param boardId - Board cuyas plantillas se listan.
 * @returns El resultado de `useQuery` con las plantillas.
 */
export function useEmailTemplates(boardId: number) {
  return useQuery({
    queryKey: QUERY_KEY(boardId),
    queryFn:  () => apiClient.call<EmailTemplate[]>('fetchEmailTemplates', { boardId }),
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Actualiza el contenido (asunto, HTML y texto) de una plantilla.
 *
 * @remarks
 * En `onSuccess` invalida la lista de plantillas del board.
 *
 * @param boardId - Board de contexto (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `{ id, subject, html, text }`.
 */
export function useUpdateEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; subject: string; html: string; text: string }) =>
      apiClient.call('updateEmailTemplate', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

/**
 * Activa o desactiva una plantilla (optimista).
 *
 * @remarks
 * `onMutate` aplica el nuevo `Is_Active` en caché; `onError` restaura el
 * snapshot; `onSettled` invalida la lista del board.
 *
 * @param boardId - Board de contexto (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `{ id, isActive }`.
 */
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

/**
 * Crea una plantilla de correo.
 *
 * @remarks
 * En `onSuccess` invalida la lista del board.
 *
 * @param boardId - Board al que pertenece la plantilla.
 * @returns El objeto de mutación de React Query. Variables:
 *   `{ name, eventKey, subject, variables }`.
 */
export function useCreateEmailTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      name: string; eventKey: string; subject: string; variables: string[];
    }) => apiClient.call<EmailTemplate>('createEmailTemplate', { boardId, ...p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}

/**
 * Elimina una plantilla de correo (optimista).
 *
 * @remarks
 * `onMutate` quita la plantilla de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida la lista del board.
 *
 * @param boardId - Board de contexto (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `id` de la plantilla.
 */
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

/**
 * Variables base por defecto para los 6 eventos del sistema.
 *
 * @remarks
 * Sirven de respaldo cuando una plantilla no tiene variables definidas en la BD.
 * Indexado por `Email_Template_Event_Key`.
 */
export const EMAIL_EVENT_VARIABLES_FALLBACK: Record<string, string[]> = {
  assignRequest:                  ['ticket_id', 'ticket_title', 'ticket_url', 'assignee_name', 'actor_name'],
  createComment:                  ['ticket_id', 'ticket_title', 'ticket_url', 'actor_name', 'comment_preview'],
  moveToColumn:                   ['ticket_id', 'ticket_title', 'ticket_url', 'column_name', 'actor_name'],
  closeRequest:                   ['ticket_id', 'ticket_title', 'ticket_url', 'actor_name', 'closure_notes'],
  updateAcceptanceCriteriaStatus: ['ticket_id', 'ticket_title', 'ticket_url', 'criteria_title', 'new_status', 'actor_name'],
  submitClientFeedback:           ['ticket_id', 'ticket_title', 'ticket_url', 'feedback_status', 'actor_name'],
};

/**
 * Devuelve las variables disponibles de una plantilla.
 *
 * @remarks
 * Usa las variables de la BD si existen; si no, cae al fallback por evento
 * ({@link EMAIL_EVENT_VARIABLES_FALLBACK}), o `[]` si el evento no está mapeado.
 *
 * @param template - Plantilla de correo.
 * @returns La lista de nombres de variables.
 */
export function getTemplateVariables(template: EmailTemplate): string[] {
  if (template.Email_Template_Variables?.length > 0) {
    return template.Email_Template_Variables;
  }
  return EMAIL_EVENT_VARIABLES_FALLBACK[template.Email_Template_Event_Key] ?? [];
}

/**
 * Actualiza la metadata de una plantilla (nombre, asunto y variables).
 *
 * @remarks
 * En `onSuccess` invalida la lista del board.
 *
 * @param boardId - Board de contexto (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `{ id, name, subject, variables }`.
 */
export function useUpdateEmailTemplateMetadata(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; name: string; subject: string; variables: string[] }) =>
      apiClient.call('updateEmailTemplateMetadata', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(boardId) }),
  });
}