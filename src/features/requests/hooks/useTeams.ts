// src/features/requests/hooks/useTeams.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Team } from '@/types/commons';
import type { DepartmentWithTeams } from './useDepartments';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const MOCK_TEAMS: Team[] = [
  { Team_ID: 1, Team_Name: 'Desarrollo & UX',         Team_Code: 'desarrollo', Department_ID: 1 },
  { Team_ID: 2, Team_Name: 'CRM',                     Team_Code: 'crm',        Department_ID: 1 },
  { Team_ID: 3, Team_Name: 'Sistemas de Información',  Team_Code: 'sistemas',   Department_ID: 1 },
  { Team_ID: 4, Team_Name: 'Ciencia de Datos',         Team_Code: 'analisis',   Department_ID: 1 },
  { Team_ID: 5, Team_Name: 'SOLVI',                    Team_Code: 'solvi',      Department_ID: 1 },
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

    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      const tempTeam: Team = {
        Team_ID:       -Date.now(),
        Team_Name:     data.name,
        Team_Code:     data.code,
        Department_ID: data.departmentId,
      };
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) =>
        old.map((d) =>
          d.Department_ID === data.departmentId
            ? { ...d, teams: [...d.teams, tempTeam] }
            : d
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: (_data, _err, vars) => {
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

    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) =>
        old.map((d) => ({
          ...d,
          teams: d.teams.map((t) =>
            t.Team_ID === data.id
              ? { ...t, Team_Name: data.name, Team_Code: data.code }
              : t
          ),
        }))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteTeam', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) =>
        old.map((d) => ({
          ...d,
          teams: d.teams.filter((t) => t.Team_ID !== id),
        }))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    },
  });
}