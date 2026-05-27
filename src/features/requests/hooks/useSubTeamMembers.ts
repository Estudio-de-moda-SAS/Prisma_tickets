// src/features/requests/hooks/useSubTeamMembers.ts
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AppUser } from './useUsers';

export type SubTeamMember = AppUser;

export function useSubTeamMembers(subTeamId: number | null) {
  return useQuery<SubTeamMember[]>({
    queryKey: ['subTeamMembers', subTeamId],
    queryFn:  () => apiClient.call<SubTeamMember[]>('fetchSubTeamMembers', { subTeamId }),
    enabled:  subTeamId !== null,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useSubTeamMembersGrouped(subTeams: { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string }[]) {
  const results = useQueries({
    queries: subTeams.map((st) => ({
      queryKey:  ['subTeamMembers', st.Sub_Team_ID],
      queryFn:   () => apiClient.call<SubTeamMember[]>('fetchSubTeamMembers', { subTeamId: st.Sub_Team_ID }),
      staleTime: 2 * 60 * 1000,
      retry:     1,
    })),
  });

  return subTeams.map((st, i) => ({
    subTeam:  st,
    members:  (results[i]?.data ?? []) as SubTeamMember[],
    isLoading: results[i]?.isLoading ?? false,
  }));
}

export function useSubTeamMembersBulk(subTeamIds: number[]) {
  return useQuery<SubTeamMember[]>({
    queryKey:  ['subTeamMembers', 'bulk', subTeamIds],
    queryFn:   () => apiClient.call<SubTeamMember[]>('fetchMembersBySubTeams', { subTeamIds }),
    enabled:   subTeamIds.length > 0,
    staleTime: 0,
    retry:     1,
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