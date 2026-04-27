// src/features/requests/hooks/useBoardMetadata.ts
// Carga los metadatos del board (equipos, labels, templates) una sola vez.

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

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

// Mock data alineada con el SQL de inserción
const MOCK_TEAMS: BoardTeam[] = [
  { Board_Team_ID: 1, Board_Team_Name: 'Desarrollo & UX', Board_Team_Code: 'desarrollo', Board_Team_Color: '#00c8ff' },
  { Board_Team_ID: 2, Board_Team_Name: 'CRM',             Board_Team_Code: 'crm',        Board_Team_Color: '#a29bfe' },
  { Board_Team_ID: 3, Board_Team_Name: 'Sistemas',        Board_Team_Code: 'sistemas',   Board_Team_Color: '#00e5a0' },
  { Board_Team_ID: 4, Board_Team_Name: 'Ciencia de Datos',Board_Team_Code: 'analisis',   Board_Team_Color: '#fdcb6e' },
];

const MOCK_LABELS: BoardLabel[] = [
  { Label_ID: 1, Label_Name: 'Bug',           Label_Color: '#ff4757', Label_Icon: '🐛' },
  { Label_ID: 2, Label_Name: 'Feature',       Label_Color: '#00c8ff', Label_Icon: '🚀' },
  { Label_ID: 3, Label_Name: 'Mejora',        Label_Color: '#a29bfe', Label_Icon: '✨' },
  { Label_ID: 4, Label_Name: 'Urgente',       Label_Color: '#ff6b81', Label_Icon: '🔔' },
  { Label_ID: 5, Label_Name: 'Documentación', Label_Color: '#fdcb6e', Label_Icon: '📋' },
];

const MOCK_TEMPLATES: BoardTemplate[] = [
  { Request_Template_ID: 1, Request_Template_Name: 'Default',     Request_Template_Description: 'Template general' },
  { Request_Template_ID: 2, Request_Template_Name: 'CRM Request', Request_Template_Description: 'Template CRM' },
];

export function useBoardTeams(boardId: number) {
  return useQuery<BoardTeam[]>({
    queryKey: ['boardTeams', boardId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_TEAMS)
      : () => apiClient.call<BoardTeam[]>('fetchAllTeams', {}),
    staleTime: Infinity,
    retry:     1,
  });
}

export function useBoardLabels(boardId: number) {
  return useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', boardId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_LABELS)
      : () => apiClient.call<BoardLabel[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

export function useBoardTemplates(boardId: number) {
  return useQuery<BoardTemplate[]>({
    queryKey: ['boardTemplates', boardId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_TEMPLATES)
      : () => apiClient.call<BoardTemplate[]>('fetchTemplatesByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}