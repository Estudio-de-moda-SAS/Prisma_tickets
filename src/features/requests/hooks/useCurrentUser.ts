// src/features/requests/hooks/useCurrentUser.ts

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import type { UserProfile } from '@/types/commons';

/**
 * Hook que expone el perfil del usuario autenticado en PRISMA.
 *
 * Toma el usuario ya resuelto por el `AuthProvider` (o un usuario mock en modo
 * bypass) y lo entrega como una query de TanStack Query, fallando de forma
 * explícita cuando la auth terminó pero no se pudo resolver el usuario.
 *
 * @module useCurrentUser
 */

/** Usuario simulado para el modo bypass (`config.USE_MOCK`). */
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

/**
 * Devuelve el perfil del usuario actual.
 *
 * @remarks
 * En modo mock resuelve {@link MOCK_USER}. Si no, entrega el `dbUser` del
 * `AuthProvider`; si la auth terminó pero no hay `dbUser`, rechaza con un error
 * explícito (en vez de quedar en *pending* eterno). La query key incluye
 * `dbUser?.User_ID`: así, cuando el usuario se resuelve tarde, la key cambia y la
 * query se rehace en lugar de quedar cacheada en estado de error. Se habilita en
 * cuanto la autenticación está lista (`ready && dbReady`), con o sin `dbUser`.
 * `staleTime: Infinity` y sin reintentos.
 *
 * @returns El resultado de `useQuery` con el {@link UserProfile} actual.
 */
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