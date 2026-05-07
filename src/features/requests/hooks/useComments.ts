// src/features/requests/hooks/useComments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type Comment = {
  Comment_ID:         number;
  Comment_Text:       string;
  Comment_Created_At: string;
  author: {
    User_ID:         number;
    User_Name:       string;
    User_Avatar_url: string;
  } | null;
};

export function useComments(requestId: number) {
  return useQuery<Comment[]>({
    queryKey:  ['comments', requestId],
    queryFn:   () => apiClient.call<Comment[]>('fetchComments', { requestId }),
    staleTime: 0,
    retry:     1,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId, text }: { requestId: number; userId: number; text: string }) =>
      apiClient.call<Comment>('createComment', { requestId, userId, text }),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['comments', requestId] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId}: { commentId: number; requestId: number }) =>
      apiClient.call('deleteComment', { commentId }),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['comments', requestId] });
    },
  });
}