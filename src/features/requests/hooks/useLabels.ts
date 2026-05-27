// src/features/requests/hooks/useLabels.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

export type Label = {
  Label_ID:     number;
  Label_Name:   string;
  Label_Color:  string;
  Label_Icon:   string;
  Label_Team_ID?: number | null;
};

/* ── Labels por equipo (boardId + teamId) ── */
export function useLabelsByTeamId(boardId: number, teamId: number | null) {
  return useQuery<Label[]>({
    queryKey:  ['labels', 'team', boardId, teamId],
    queryFn:   () =>
      apiClient.call<Label[]>('fetchLabelsByTeamId', { boardId, teamId }),
    enabled:   teamId !== null,
    staleTime: 60_000,
    retry:     1,
  });
}

/* ── Todos los labels del board (sin filtrar por equipo) ── */
export function useLabelsByBoardId(boardId: number) {
  return useQuery<Label[]>({
    queryKey:  ['labels', 'board', boardId],
    queryFn:   config.USE_MOCK
      ? () => Promise.resolve(MOCK_LABELS)
      : () => apiClient.call<Label[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: 60_000,
    retry:     1,
  });
}

/* ── Mock para desarrollo offline ── */
const MOCK_LABELS: Label[] = [
  { Label_ID: 1, Label_Name: 'Diseño',         Label_Color: '#a78bfa', Label_Icon: '🎨' },
  { Label_ID: 2, Label_Name: 'Infraestructura', Label_Color: '#60a5fa', Label_Icon: '🖥️' },
  { Label_ID: 3, Label_Name: 'Bug',             Label_Color: '#f87171', Label_Icon: '🐛' },
  { Label_ID: 4, Label_Name: 'UI',              Label_Color: '#34d399', Label_Icon: '✨' },
  { Label_ID: 5, Label_Name: 'Analytics',       Label_Color: '#fb923c', Label_Icon: '📊' },
  { Label_ID: 6, Label_Name: 'Integración',     Label_Color: '#facc15', Label_Icon: '🔗' },
  { Label_ID: 7, Label_Name: 'Datos',           Label_Color: '#22d3ee', Label_Icon: '📦' },
  { Label_ID: 8, Label_Name: 'CRM',             Label_Color: '#e879f9', Label_Icon: '👥' },
];