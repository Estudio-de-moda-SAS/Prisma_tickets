// src/features/requests/hooks/useTeams.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Team } from '@/types/commons';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const MOCK_TEAMS: Team[] = [
  { Team_ID: 1, Team_Name: 'Desarrollo & UX',        Team_Code: 'desarrollo', Department_ID: 1 },
  { Team_ID: 2, Team_Name: 'CRM',                    Team_Code: 'crm',        Department_ID: 1 },
  { Team_ID: 3, Team_Name: 'Sistemas de Información', Team_Code: 'sistemas',  Department_ID: 1 },
  { Team_ID: 4, Team_Name: 'Ciencia de Datos',       Team_Code: 'analisis',   Department_ID: 1 },
  { Team_ID: 5, Team_Name: 'SOLVI',                  Team_Code: 'solvi',      Department_ID: 1 },
];

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTeams(departmentId: number | null) {
  return useQuery<Team[]>({
    queryKey: ['teams', departmentId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_TEAMS.filter((t) => t.Department_ID === departmentId))
      : () => apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }),
    enabled:   departmentId !== null,
    staleTime: Infinity,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { departmentId: number; name: string; code: string }) =>
      apiClient.call<Team>('createTeam', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['teams', vars.departmentId] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; name: string; code: string }) =>
      apiClient.call('updateTeam', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteTeam', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
      // Usuarios afectados vuelven al onboarding
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    },
  });
}