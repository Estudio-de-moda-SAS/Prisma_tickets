// src/features/requests/hooks/useSubTeamMembers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AppUser } from './useUsers';

export type SubTeamMember = AppUser; // misma forma, reutilizamos el tipo

export function useSubTeamMembers(subTeamId: number | null) {
  return useQuery<SubTeamMember[]>({
    queryKey: ['subTeamMembers', subTeamId],
    queryFn:  () => apiClient.call<SubTeamMember[]>('fetchSubTeamMembers', { subTeamId }),
    enabled:  subTeamId !== null,
    staleTime: 0,
    retry: 1,
  });
}

export function useAddSubTeamMember(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('addSubTeamMember', { subTeamId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeamMembers', subTeamId] }),
  });
}

export function useRemoveSubTeamMember(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('removeSubTeamMember', { subTeamId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeamMembers', subTeamId] }),
  });
}