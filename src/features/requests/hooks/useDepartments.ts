// src/features/requests/hooks/useDepartments.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Department, Team } from '@/types/commons';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type DepartmentWithTeams = {
  Department_ID:             number;
  Department_Name:           string;
  Department_Code:           string;
  Is_Hidden_From_Onboarding: boolean;
  teams:                     Team[];
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const MOCK_DEPARTMENTS: (Department & { Is_Hidden_From_Onboarding: boolean })[] = [
  { Department_ID: 1, Department_Name: 'Tecnología',     Department_Code: 'tecnologia',    Is_Hidden_From_Onboarding: true  },
  { Department_ID: 2, Department_Name: 'Comercial',      Department_Code: 'comercial',     Is_Hidden_From_Onboarding: false },
  { Department_ID: 3, Department_Name: 'Operaciones',    Department_Code: 'operaciones',   Is_Hidden_From_Onboarding: false },
  { Department_ID: 4, Department_Name: 'Administración', Department_Code: 'administracion',Is_Hidden_From_Onboarding: false },
];

const MOCK_DEPTS_WITH_TEAMS: DepartmentWithTeams[] = MOCK_DEPARTMENTS.map((d) => ({
  ...d,
  teams: [],
}));

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDepartments() {
  return useQuery<(Department & { Is_Hidden_From_Onboarding: boolean })[]>({
    queryKey: ['departments'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_DEPARTMENTS)
      : () => apiClient.call<(Department & { Is_Hidden_From_Onboarding: boolean })[]>('getDepartments', {}),
    staleTime: Infinity,
  });
}

export function useDepartmentsWithTeams() {
  return useQuery<DepartmentWithTeams[]>({
    queryKey: ['departments-with-teams'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_DEPTS_WITH_TEAMS)
      : () => apiClient.call<DepartmentWithTeams[]>('getDepartmentsWithTeams', {}),
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code: string; isHidden: boolean }) =>
      apiClient.call<DepartmentWithTeams>('createDepartment', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; name: string; code: string; isHidden: boolean }) =>
      apiClient.call('updateDepartment', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteDepartment', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
      // Usuarios afectados vuelven al onboarding — refrescar lista
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    },
  });
}