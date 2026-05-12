// src/features/requests/hooks/useCurrentUser.ts

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { UserProfile } from '@/types/commons';

const MOCK_USER: UserProfile = {
  User_ID:       1,
  User_Name:     'Dev (Bypass)',
  User_Email:    'dev@bypass.local',
  User_Role:     'admin',
  Department_ID: 1,
  Team_ID:       1,
  Is_New:        false,
  team: { Team_Code: 'desarrollo', Team_Name: 'Desarrollo & UX' },
};

export function useCurrentUser() {
  const { account, ready } = useAuth();

  return useQuery<UserProfile>({
    queryKey: ['currentUser', account?.homeAccountId ?? 'anonymous'],
    queryFn: config.USE_MOCK
      ? () => Promise.resolve(MOCK_USER)
      : () => apiClient.call<UserProfile>('upsertUserByEntraId', {
          entraId: account?.homeAccountId ?? '',
          name:    account?.name          ?? '',
          email:   account?.username      ?? '',
        }),
    enabled:   config.USE_MOCK || (ready && !!account),
    staleTime: Infinity,
    retry:     1,
  });
}