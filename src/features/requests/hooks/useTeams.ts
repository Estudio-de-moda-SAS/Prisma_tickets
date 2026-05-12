// src/features/requests/hooks/useTeams.ts

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Team } from '@/types/commons';

const MOCK_TEAMS: Team[] = [
  { Team_ID: 1, Team_Name: 'Desarrollo & UX',          Team_Code: 'desarrollo', Department_ID: 1 },
  { Team_ID: 2, Team_Name: 'CRM',                       Team_Code: 'crm',        Department_ID: 1 },
  { Team_ID: 3, Team_Name: 'Sistemas de Información',   Team_Code: 'sistemas',   Department_ID: 1 },
  { Team_ID: 4, Team_Name: 'Ciencia de Datos',          Team_Code: 'analisis',   Department_ID: 1 },
];

export function useTeams(departmentId: number | null) {
  return useQuery<Team[]>({
    queryKey: ['teams', departmentId],
    queryFn: config.USE_MOCK
      ? () => Promise.resolve(MOCK_TEAMS.filter(t => t.Department_ID === departmentId))
      : () => apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }),
    enabled:   departmentId !== null,
    staleTime: Infinity,
  });
}