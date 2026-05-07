// src/features/requests/hooks/useSubTeams.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type SubTeam = {
  Sub_Team_ID:    number;
  Sub_Team_Name:  string;
  Sub_Team_Color: string;
};

export function useSubTeams(teamId: number | null) {
  return useQuery<SubTeam[]>({
    queryKey: ['subTeams', teamId],
    queryFn:  () => apiClient.call<SubTeam[]>('fetchSubTeamsByTeamId', { teamId }),
    enabled:  teamId !== null,
    staleTime: 0,
    retry:    1,
  });
}

export function useCreateSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; color: string }) =>
      apiClient.call('createSubTeam', { teamId, name: d.name, color: d.color }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeams', teamId] }),
  });
}

export function useUpdateSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { id: number; name: string; color: string }) =>
      apiClient.call('updateSubTeam', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeams', teamId] }),
  });
}

export function useDeleteSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteSubTeam', { id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['subTeams', teamId] }),
  });
}