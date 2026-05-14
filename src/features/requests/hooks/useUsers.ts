// src/features/requests/hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type AppUser = {
  User_ID:         number;
  User_Name:       string;
  User_Email:      string;
  User_Avatar_url: string;
  User_Role:       string;
};

export function useUsers() {
  return useQuery<AppUser[]>({
    queryKey:  ['users'],
    queryFn:   () => apiClient.call<AppUser[]>('fetchAllUsers', {}),
    staleTime: 5 * 60 * 1000,
    retry:     1,
  });
}

export function useAssignRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId }: { requestId: string; userId: number }) =>
      apiClient.call('assignRequest', { requestId, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useUnassignRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId }: { requestId: string; userId: number }) =>
      apiClient.call('unassignRequest', { requestId, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}