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
  const { account, ready, dbReady, dbUser, dbError } = useAuth();

  return useQuery<UserProfile>({
    // dbUser?.User_ID en la key: cuando el usuario se resuelve tarde, la key
    // cambia y la query se rehace en vez de quedar cacheada en error.
    queryKey: ['currentUser', account?.homeAccountId ?? 'anonymous', dbUser?.User_ID ?? 'none'],
    queryFn: () => {
      if (config.USE_MOCK) return Promise.resolve(MOCK_USER);
      if (dbUser) return Promise.resolve(dbUser);
      // Falla explícita en vez de pending eterno.
      return Promise.reject(new Error(dbError ?? 'No se pudo resolver tu usuario en PRISMA.'));
    },
    // Habilitada apenas la auth terminó, con o sin dbUser.
    enabled:   config.USE_MOCK || (ready && dbReady),
    staleTime: Infinity,
    retry:     false,
  });
}