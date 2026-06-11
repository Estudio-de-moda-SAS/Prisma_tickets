// src/features/requests/hooks/useBoardMetadata.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TemplateExtraField, TemplateDefinition, TemplateVisual } from '@/features/requests/templates/types';

/* ============================================================
   Tipos de DB
   ============================================================ */
export type BoardTeam = {
  Board_Team_ID:          number;
  Board_Team_Name:        string;
  Board_Team_Code:        string;
  Board_Team_Color:       string;
  Board_Team_Description: string | null;
  Board_Team_Icon:           string;
  Board_Team_Is_Admin_Only:  boolean;
};

export type BoardLabel = {
  Label_ID:    number;
  Label_Name:  string;
  Label_Color: string;
  Label_Icon:  string;
};

export type BoardTemplate = {
  Request_Template_ID:          number;
  Request_Template_Name:        string;
  Request_Template_Description: string;
  Request_Template_Icon:        string;
  Request_Template_Color:       string;
  Request_Template_Badge:       string;
  Request_Template_Form_Schema: TemplateExtraField[];
  Request_Template_Teams:       number[];
  Request_Template_Is_Active:   boolean;
};

export type TemplatePayload = {
  boardId:     number;
  name:        string;
  description: string;
  icon:        string;
  color:       string;
  badge:       string;
  formSchema:  TemplateExtraField[];
  teamIds:     number[];
  isActive:    boolean;
};

/* ============================================================
   Fallback
   ============================================================ */
const FALLBACK_TEMPLATE: TemplateDefinition = {
  id:          0,
  nombre:      'General',
  descripcion: 'Solicitud general.',
  visual: {
    accentColor: '#00c8ff',
    icon:        '📋',
    badgeLabel:  'General',
  },
  extraFields: [],
  teamIds:     [],
  isActive:    true,
};

/* ============================================================
   Helpers — reemplazan registry.ts por completo
   ============================================================ */
export function mapBoardTemplateToDefinition(t: BoardTemplate): TemplateDefinition {
  return {
    id:          t.Request_Template_ID,
    nombre:      t.Request_Template_Name,
    descripcion: t.Request_Template_Description,
    visual: {
      accentColor: t.Request_Template_Color ?? '#00c8ff',
      icon:        t.Request_Template_Icon  ?? '📋',
      badgeLabel:  t.Request_Template_Badge ?? t.Request_Template_Name,
    } satisfies TemplateVisual,
    extraFields: t.Request_Template_Form_Schema ?? [],
    teamIds:     t.Request_Template_Teams       ?? [],
    isActive:    t.Request_Template_Is_Active   ?? true,
  };
}

export function getTemplateDefinition(
  templateId: number,
  templates:  BoardTemplate[],
): TemplateDefinition {
  const found = templates.find((t) => t.Request_Template_ID === templateId);
  return found ? mapBoardTemplateToDefinition(found) : FALLBACK_TEMPLATE;
}

export function getTemplateAccent(templateId: number, templates: BoardTemplate[]): string {
  return getTemplateDefinition(templateId, templates).visual.accentColor;
}

export function getTemplateBadge(templateId: number, templates: BoardTemplate[]): string {
  return getTemplateDefinition(templateId, templates).visual.badgeLabel;
}

/* ============================================================
   Query keys
   ============================================================ */
const templateKeys = {
  all: (boardId: number) => ['boardTemplates', boardId] as const,
};

const labelKeys = {
  byTeam:  (boardId: number, teamId: number | null) => ['boardLabels', boardId, teamId] as const,
  byBoard: (boardId: number)                         => ['boardLabels', boardId]         as const,
};

/* ============================================================
   Hooks — Equipos
   ============================================================ */
export function useBoardTeams(boardId: number) {
  return useQuery<BoardTeam[]>({
    queryKey:  ['boardTeams', boardId],
    queryFn:   () => apiClient.call<BoardTeam[]>('fetchAllTeams', {}),
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Labels lectura
   ============================================================ */
export function useBoardLabels(boardId: number) {
  return useQuery<BoardLabel[]>({
    queryKey:  labelKeys.byBoard(boardId),
    queryFn:   () => apiClient.call<BoardLabel[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

export function useLabelsByTeamId(boardId: number, teamId: number | null) {
  return useQuery<BoardLabel[]>({
    queryKey: labelKeys.byTeam(boardId, teamId),
    queryFn:  () => apiClient.call<BoardLabel[]>('fetchLabelsByTeamId', { boardId, teamId }),
    enabled:  teamId !== null,
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Labels CRUD con optimistic updates
   ============================================================ */
export function useCreateLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: (d: { name: string; color: string; icon: string }) =>
      apiClient.call<BoardLabel>('createLabel', { boardId, teamId, ...d }),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      // ID temporal negativo para no colisionar con IDs reales
      const tempLabel: BoardLabel = {
        Label_ID:    -Date.now(),
        Label_Name:  d.name,
        Label_Color: d.color,
        Label_Icon:  d.icon,
      };
      qc.setQueryData<BoardLabel[]>(qk, (prev) => [...(prev ?? []), tempLabel]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useUpdateLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: ({ id, ...d }: { id: number; name: string; color: string; icon: string }) =>
      apiClient.call('updateLabel', { id, ...d }),

    onMutate: async ({ id, ...d }) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      qc.setQueryData<BoardLabel[]>(qk, (prev) =>
        prev?.map((l) => l.Label_ID === id
          ? { ...l, Label_Name: d.name, Label_Color: d.color, Label_Icon: d.icon }
          : l
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useDeleteLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteLabel', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      qc.setQueryData<BoardLabel[]>(qk, (prev) =>
        prev?.filter((l) => l.Label_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/* ============================================================
   Hooks — Templates lectura
   ============================================================ */
export function useBoardTemplates(boardId: number) {
  return useQuery<BoardTemplate[]>({
    queryKey:  templateKeys.all(boardId),
    queryFn:   () => apiClient.call<BoardTemplate[]>('fetchTemplatesByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Templates CRUD con optimistic updates
   ============================================================ */
export function useCreateTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: (payload: Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call<BoardTemplate>('createTemplate', { boardId, ...payload }),

    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      const tempTemplate: BoardTemplate = {
        Request_Template_ID:          -Date.now(),
        Request_Template_Name:        payload.name,
        Request_Template_Description: payload.description,
        Request_Template_Icon:        payload.icon,
        Request_Template_Color:       payload.color,
        Request_Template_Badge:       payload.badge,
        Request_Template_Form_Schema: payload.formSchema,
        Request_Template_Teams:       payload.teamIds,
        Request_Template_Is_Active:   payload.isActive,
      };
      qc.setQueryData<BoardTemplate[]>(qk, (prev) => [...(prev ?? []), tempTemplate]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useUpdateTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call('updateTemplate', { id, boardId, ...payload }),

    onMutate: async ({ id, ...payload }) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      qc.setQueryData<BoardTemplate[]>(qk, (prev) =>
        prev?.map((t) => t.Request_Template_ID === id
          ? {
              ...t,
              Request_Template_Name:        payload.name,
              Request_Template_Description: payload.description,
              Request_Template_Icon:        payload.icon,
              Request_Template_Color:       payload.color,
              Request_Template_Badge:       payload.badge,
              Request_Template_Form_Schema: payload.formSchema,
              Request_Template_Teams:       payload.teamIds,
              Request_Template_Is_Active:   payload.isActive,
            }
          : t
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useDeleteTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteTemplate', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      qc.setQueryData<BoardTemplate[]>(qk, (prev) =>
        prev?.filter((t) => t.Request_Template_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}