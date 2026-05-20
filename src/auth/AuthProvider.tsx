import * as React from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { config } from '@/config';
import {
  initMSAL,
  ensureActiveAccount,
  isLoggedIn,
  getAccessToken,
  ensureLogin,
  logout,
} from './msal';
import { apiClient } from '@/lib/apiClient';
import type { UserProfile } from '@/types/commons';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AuthCtx = {
  ready:         boolean;
  dbReady:       boolean;
  account:       AccountInfo | null;
  dbUser:        UserProfile | null;
  getToken:      () => Promise<string>;
  signIn:        (mode?: 'popup' | 'redirect') => Promise<void>;
  signOut:       () => Promise<void>;
  refreshDbUser: () => Promise<void>;
};

// ─── Cuenta ficticia para bypass ─────────────────────────────────────────────

const MOCK_ACCOUNT: AccountInfo = {
  homeAccountId:  'bypass-dev-account',
  environment:    'login.microsoftonline.com',
  tenantId:       'dev-tenant',
  username:       'dev@bypass.local',
  localAccountId: 'bypass-local-id',
  name:           'Dev (Bypass)',
  authorityType:  'MSSTS',
  idTokenClaims:  {},
  nativeAccountId: undefined,
  tenantProfiles:  new Map(),
};

const MOCK_DB_USER: UserProfile = {
  User_ID:       1,
  User_Name:     'Dev (Bypass)',
  User_Email:    'dev@bypass.local',
  User_Role:     'admin',
  Department_ID: 7,
  Team_ID:       1,
  Is_New:        false,
  team: { Team_Code: 'ti', Team_Name: 'TI' },
};

// ─── Contexto ─────────────────────────────────────────────────────────────────

const Ctx = React.createContext<AuthCtx | null>(null);

// ─── Helper ───────────────────────────────────────────────────────────────────

// Usamos homeAccountId porque es el identificador que ya está guardado en la DB
async function loadDbUser(account: AccountInfo): Promise<UserProfile> {
  const user = await apiClient.call<UserProfile>('upsertUserByEntraId', {
    entraId: account.homeAccountId,
    name:    account.name    ?? account.username,
    email:   account.username,
  });
  //console.log('[AUTH] dbUser cargado:', user); // ← agregar esto
  return user;
}
// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready,   setReady]   = React.useState<boolean>(config.BYPASS_AUTH);
  const [dbReady, setDbReady] = React.useState<boolean>(config.BYPASS_AUTH);
  const [account, setAccount] = React.useState<AccountInfo | null>(
    config.BYPASS_AUTH ? MOCK_ACCOUNT : null,
  );
  const [dbUser, setDbUser] = React.useState<UserProfile | null>(
    config.BYPASS_AUTH ? MOCK_DB_USER : null,
  );

  // ── Inicialización MSAL ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (config.BYPASS_AUTH) return;

    let cancel = false;

    (async () => {
      try {
        await initMSAL();
        const acc = ensureActiveAccount();

        if (cancel) return;

        setAccount(acc ?? null);
        setReady(true);

        if (acc) {
          try {
            const user = await loadDbUser(acc);
            if (!cancel) setDbUser(user);
          } catch (err) {
            console.error('[AuthProvider] Error cargando usuario DB:', err);
          }
        }

        if (!cancel) setDbReady(true);

      } catch {
        if (!cancel) {
          setReady(true);
          setDbReady(true);
        }
      }
    })();

    return () => { cancel = true; };
  }, []);

  // ── Sign in ──────────────────────────────────────────────────────────────
  const signIn = React.useCallback(async (mode: 'popup' | 'redirect' = 'popup') => {
    if (config.BYPASS_AUTH) {
      setAccount(MOCK_ACCOUNT);
      setDbUser(MOCK_DB_USER);
      setReady(true);
      setDbReady(true);
      return;
    }

    const acc = await ensureLogin(mode);
    setAccount(acc);
    setReady(true);
    setDbReady(false);

    try {
      const user = await loadDbUser(acc);
      setDbUser(user);
    } catch (err) {
      console.error('[AuthProvider] Error cargando usuario DB tras login:', err);
    } finally {
      setDbReady(true);
    }
  }, []);

  // ── Sign out ─────────────────────────────────────────────────────────────
  const signOut = React.useCallback(async () => {
    if (config.BYPASS_AUTH) {
      setAccount(null);
      setDbUser(null);
      setDbReady(true);
      return;
    }

    await logout();
    setAccount(null);
    setDbUser(null);
    setReady(true);
    setDbReady(true);
  }, []);

  // ── Get token ────────────────────────────────────────────────────────────
  const getToken = React.useCallback(async (): Promise<string> => {
    if (config.BYPASS_AUTH) return 'bypass-dev-token';
    if (!isLoggedIn()) throw new Error('No hay sesión iniciada.');
    return getAccessToken({ interactionMode: 'popup', forceSilent: false });
  }, []);

  // ── Refresh dbUser ───────────────────────────────────────────────────────
  const refreshDbUser = React.useCallback(async () => {
    if (config.BYPASS_AUTH || !account) return;
    try {
      const user = await loadDbUser(account);
      setDbUser(user);
    } catch (err) {
      console.error('[AuthProvider] Error refrescando usuario DB:', err);
    }
  }, [account]);

  const value = React.useMemo<AuthCtx>(
    () => ({ ready, dbReady, account, dbUser, getToken, signIn, signOut, refreshDbUser }),
    [ready, dbReady, account, dbUser, getToken, signIn, signOut, refreshDbUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}