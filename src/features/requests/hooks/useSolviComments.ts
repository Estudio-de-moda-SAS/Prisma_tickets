// src/features/requests/hooks/useSolviComments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type SolviComment = {
  Comment_ID:         number;
  Comment_Text:       string;
  Comment_Created_At: string;
  author: { User_ID: number; User_Name: string; User_Avatar_url: string } | null;
};

export function useSolviComments(ticketId: number) {
  return useQuery<SolviComment[]>({
    queryKey:  ['solvi-comments', ticketId],
    queryFn:   () => apiClient.call<SolviComment[]>('fetchSolviComments', { ticketId }),
    staleTime: 0,
    retry:     1,
  });
}

export function useCreateSolviComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, userId, text, mentionedUserIds }: { ticketId: number; userId: number; text: string; mentionedUserIds?: number[] }) =>
      apiClient.call<SolviComment>('createSolviComment', { ticketId, userId, text, mentionedUserIds: mentionedUserIds ?? [] }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-comments', ticketId] }),
  });
}

export function useDeleteSolviComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number; ticketId: number }) =>
      apiClient.call('deleteSolviComment', { commentId }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-comments', ticketId] }),
  });
}