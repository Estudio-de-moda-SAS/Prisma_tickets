// src/features/requests/hooks/useCurrentUser.ts
// Resuelve el User_ID de Supabase a partir del EntraID de Azure AD.
// Si el usuario no existe en TBL_Users lo crea automáticamente (upsert).

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

type SupabaseUser = {
  User_ID:   number;
  User_Name:  string;
  User_Email: string;
  User_Role:  string;
};

// En mock siempre devuelve el usuario con ID 1
const MOCK_USER: SupabaseUser = {
  User_ID:   1,
  User_Name:  'Dev (Bypass)',
  User_Email: 'dev@bypass.local',
  User_Role:  'admin',
};

export function useCurrentUser() {
  const { account } = useAuth();

  return useQuery<SupabaseUser>({
    queryKey: ['currentUser', account?.homeAccountId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_USER)
      : () => apiClient.call<SupabaseUser>('upsertUserByEntraId', {
          entraId: account?.homeAccountId ?? '',
          name:    account?.name          ?? '',
          email:   account?.username      ?? '',
          role:    'member',
        }),
    enabled:   !!account || config.USE_MOCK,
    staleTime: Infinity,
    retry:     1,
  });
}