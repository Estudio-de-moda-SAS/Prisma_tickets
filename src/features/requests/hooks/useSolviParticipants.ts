// src/features/requests/hooks/useSolviParticipants.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type SolviParticipant = {
  User_ID: number; User_Name: string; User_Avatar_url: string;
  Added_Via: string; Added_By: number | null;
};

export function useSolviParticipants(ticketId: number) {
  return useQuery<SolviParticipant[]>({
    queryKey:  ['solvi-participants', ticketId],
    queryFn:   () => apiClient.call<SolviParticipant[]>('fetchSolviParticipants', { ticketId }),
    staleTime: 30_000,
  });
}

export function useRemoveSolviParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, userId, actorId }: { ticketId: number; userId: number; actorId: number }) =>
      apiClient.call('removeSolviParticipant', { ticketId, userId, actorId }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-participants', ticketId] }),
  });
}