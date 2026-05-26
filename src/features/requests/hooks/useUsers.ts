// src/features/requests/hooks/useUsers.ts
import { apiClient } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  return useMutation({
    mutationFn: ({ requestId, userId, assignedBy }: { requestId: string; userId: number; assignedBy?: number }) =>
      apiClient.call('assignRequest', { requestId, userId, assignedBy }),
  });
}

export function useUnassignRequest() {
  return useMutation({
    mutationFn: ({ requestId, userId }: { requestId: string; userId: number }) =>
      apiClient.call('unassignRequest', { requestId, userId }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('deactivateUser', { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['allUsers'] }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('reactivateUser', { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['allUsers'] }),
  });
}