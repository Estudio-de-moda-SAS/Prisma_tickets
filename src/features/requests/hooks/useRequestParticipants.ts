// src/features/requests/hooks/useRequestParticipants.ts
import { apiClient } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
export type RequestParticipant = {
  User_ID: number; User_Name: string; User_Avatar_url: string;
  Added_Via: string; Added_By: number | null;
};

export function useRequestParticipants(requestId: string) {
  return useQuery<RequestParticipant[]>({
    queryKey:  ['requestParticipants', requestId],
    queryFn:   () => apiClient.call<RequestParticipant[]>('fetchRequestParticipants', { requestId }),
    staleTime: 30_000,
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId, actorId }: { requestId: string; userId: number; actorId: number }) =>
      apiClient.call('removeParticipant', { requestId, userId, actorId }),
    onSuccess: (_d, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['requestParticipants', requestId] });
    },
  });
}