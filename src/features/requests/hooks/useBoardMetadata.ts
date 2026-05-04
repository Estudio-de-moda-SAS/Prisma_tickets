// src/features/requests/hooks/useBoardMetadata.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

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
};

/** Todos los equipos del board */
export function useBoardTeams(boardId: number) {
  return useQuery<BoardTeam[]>({
    queryKey:  ['boardTeams', boardId],
    queryFn:   () => apiClient.call<BoardTeam[]>('fetchAllTeams', {}),
    staleTime: Infinity,
    retry:     1,
  });
}

/** Todas las labels del board — usar cuando no hay equipo seleccionado */
export function useBoardLabels(boardId: number) {
  return useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', boardId],
    queryFn:  () => apiClient.call<BoardLabel[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

/** Labels filtradas por equipo — usar en formularios con equipo seleccionado */
export function useLabelsByTeamId(boardId: number, teamId: number | null) {
  return useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', boardId, teamId],
    queryFn:  () => apiClient.call<BoardLabel[]>('fetchLabelsByTeamId', { boardId, teamId }),
    enabled:  teamId !== null,
    staleTime: Infinity,
    retry:     1,
  });
}

/** Templates del board */
export function useBoardTemplates(boardId: number) {
  return useQuery<BoardTemplate[]>({
    queryKey: ['boardTemplates', boardId],
    queryFn:  () => apiClient.call<BoardTemplate[]>('fetchTemplatesByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}