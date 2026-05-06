// src/features/requests/hooks/useBoardMetadata.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TemplateExtraField, TemplateDefinition, TemplateVisual } from '@/features/requests/templates/types';

/* ============================================================
   Tipos de DB
   ============================================================ */
export type BoardTeam = {
  Board_Team_ID:    number;
  Board_Team_Name:  string;
  Board_Team_Code:  string;
  Board_Team_Color: string;
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
   Hooks — Labels
   ============================================================ */
export function useBoardLabels(boardId: number) {
  return useQuery<BoardLabel[]>({
    queryKey:  ['boardLabels', boardId],
    queryFn:   () => apiClient.call<BoardLabel[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

export function useLabelsByTeamId(boardId: number, teamId: number | null) {
  return useQuery<BoardLabel[]>({
    queryKey:  ['boardLabels', boardId, teamId],
    queryFn:   () => apiClient.call<BoardLabel[]>('fetchLabelsByTeamId', { boardId, teamId }),
    enabled:   teamId !== null,
    staleTime: Infinity,
    retry:     1,
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
   Hooks — Templates CRUD
   ============================================================ */
export function useCreateTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call('createTemplate', { boardId, ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all(boardId) }),
  });
}

export function useUpdateTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call('updateTemplate', { id, boardId, ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all(boardId) }),
  });
}

export function useDeleteTemplate(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteTemplate', { id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: templateKeys.all(boardId) }),
  });
}