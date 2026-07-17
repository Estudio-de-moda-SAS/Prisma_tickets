// src/features/requests/hooks/useCurrentUser.ts

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
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
  team:       { Team_Code: 'desarrollo', Team_Name: 'Desarrollo & UX' },
  department: { Department_ID: 7, Department_Name: 'TI', Department_Code: 'ti' },
  Is_Active:    true,
};

export function useCurrentUser() {
  const { account, ready, dbReady, dbUser } = useAuth();

  return useQuery<UserProfile>({
    queryKey: ['currentUser', account?.homeAccountId ?? 'anonymous'],
    queryFn: () => {
      if (config.USE_MOCK) return Promise.resolve(MOCK_USER);
      // AuthProvider ya resolvió el usuario (por oid.tid con Supabase Auth,
      // o por homeAccountId con MSAL). Reusamos ese dbUser en vez de volver
      // a llamar upsertUserByEntraId — así evitamos crear duplicados cuando
      // el flag está on y account.homeAccountId es el sub de Supabase.
      if (dbUser) return Promise.resolve(dbUser);
      throw new Error('[useCurrentUser] dbUser aún no disponible');
    },
    enabled:   config.USE_MOCK || (ready && dbReady && !!dbUser),
    staleTime: Infinity,
    retry:     1,
  });
}