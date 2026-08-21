// src/features/requests/hooks/useDepartments.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { Department, Team } from '@/types/commons';

/**
 * Hooks de TanStack Query para departamentos.
 *
 * Expone dos queries de lectura ({@link useDepartments} plano y
 * {@link useDepartmentsWithTeams} con sus equipos anidados) y las mutaciones de
 * crear, actualizar y eliminar, todas con actualización optimista sobre la caché
 * `departments-with-teams` y rollback por snapshot.
 *
 * @module useDepartments
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Departamento con sus equipos anidados. */
export type DepartmentWithTeams = {
  Department_ID:             number;
  Department_Name:           string;
  Department_Code:           string;
  Is_Hidden_From_Onboarding: boolean;
  teams:                     Team[];
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Departamentos simulados para el modo mock. */
const MOCK_DEPARTMENTS: (Department & { Is_Hidden_From_Onboarding: boolean })[] = [
  { Department_ID: 1, Department_Name: 'Tecnología',     Department_Code: 'tecnologia',    Is_Hidden_From_Onboarding: true  },
  { Department_ID: 2, Department_Name: 'Comercial',      Department_Code: 'comercial',     Is_Hidden_From_Onboarding: false },
  { Department_ID: 3, Department_Name: 'Operaciones',    Department_Code: 'operaciones',   Is_Hidden_From_Onboarding: false },
  { Department_ID: 4, Department_Name: 'Administración', Department_Code: 'administracion',Is_Hidden_From_Onboarding: false },
];

/** Departamentos con equipos (vacíos) simulados para el modo mock. */
const MOCK_DEPTS_WITH_TEAMS: DepartmentWithTeams[] = MOCK_DEPARTMENTS.map((d) => ({
  ...d,
  teams: [],
}));

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Lista los departamentos (sin equipos).
 *
 * @remarks
 * En modo mock devuelve {@link MOCK_DEPARTMENTS}. `staleTime: Infinity`.
 *
 * @returns El resultado de `useQuery` con los departamentos.
 */
export function useDepartments() {
  return useQuery<(Department & { Is_Hidden_From_Onboarding: boolean })[]>({
    queryKey: ['departments'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_DEPARTMENTS)
      : () => apiClient.call<(Department & { Is_Hidden_From_Onboarding: boolean })[]>('getDepartments', {}),
    staleTime: Infinity,
  });
}

/**
 * Lista los departamentos con sus equipos anidados.
 *
 * @remarks
 * En modo mock devuelve {@link MOCK_DEPTS_WITH_TEAMS}. `staleTime` de 30s. Es la
 * caché que actualizan de forma optimista las mutaciones de este módulo.
 *
 * @returns El resultado de `useQuery` con los departamentos y sus equipos.
 */
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

/**
 * Crea un departamento (optimista).
 *
 * @remarks
 * `onMutate` inserta un departamento temporal con `Department_ID` negativo (sin
 * equipos); `onError` restaura el snapshot; `onSettled` invalida `departments` y
 * `departments-with-teams`.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ name, code, isHidden }`.
 */
export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code: string; isHidden: boolean }) =>
      apiClient.call<DepartmentWithTeams>('createDepartment', data),

    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      const tempDept: DepartmentWithTeams = {
        Department_ID:             -Date.now(),
        Department_Name:           data.name,
        Department_Code:           data.code,
        Is_Hidden_From_Onboarding: data.isHidden,
        teams:                     [],
      };
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) => [...old, tempDept]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

/**
 * Actualiza un departamento (optimista).
 *
 * @remarks
 * `onMutate` aplica los nuevos valores en caché; `onError` restaura el snapshot;
 * `onSettled` invalida `departments` y `departments-with-teams`.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ id, name, code, isHidden }`.
 */
export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; name: string; code: string; isHidden: boolean }) =>
      apiClient.call('updateDepartment', data),

    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) =>
        old.map((d) =>
          d.Department_ID === data.id
            ? { ...d, Department_Name: data.name, Department_Code: data.code, Is_Hidden_From_Onboarding: data.isHidden }
            : d
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
    },
  });
}

/**
 * Elimina un departamento (optimista).
 *
 * @remarks
 * `onMutate` quita el departamento de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida `departments`, `departments-with-teams` y `allUsers` (los
 * usuarios pueden depender del departamento eliminado).
 *
 * @returns El objeto de mutación de React Query. Variables: `id` del departamento.
 */
export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteDepartment', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['departments-with-teams'] });
      const prev = qc.getQueryData<DepartmentWithTeams[]>(['departments-with-teams']);
      qc.setQueryData<DepartmentWithTeams[]>(['departments-with-teams'], (old = []) =>
        old.filter((d) => d.Department_ID !== id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['departments-with-teams'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['departments-with-teams'] });
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    },
  });
}