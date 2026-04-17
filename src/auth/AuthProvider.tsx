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

type AuthCtx = {
  ready:    boolean;
  account:  AccountInfo | null;
  getToken: () => Promise<string>;
  signIn:   (mode?: 'popup' | 'redirect') => Promise<void>;
  signOut:  () => Promise<void>;
};

// ── Cuenta ficticia para bypass ──────────────────────────────────────────────
const MOCK_ACCOUNT: AccountInfo = {
  homeAccountId:          'bypass-dev-account',
  environment:            'login.microsoftonline.com',
  tenantId:               'dev-tenant',
  username:               'dev@bypass.local',
  localAccountId:         'bypass-local-id',
  name:                   'Dev (Bypass)',
  authorityType:          'MSSTS',
  idTokenClaims:          {},
  nativeAccountId:        undefined,
  tenantProfiles:         new Map(),
};

const Ctx = React.createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready,   setReady]   = React.useState(config.BYPASS_AUTH); // si bypass, ya arranca ready
  const [account, setAccount] = React.useState<AccountInfo | null>(
    config.BYPASS_AUTH ? MOCK_ACCOUNT : null,
  );

  React.useEffect(() => {
    if (config.BYPASS_AUTH) return; // ← nada que inicializar

    let cancel = false;
    (async () => {
      try {
        await initMSAL();
        const acc = ensureActiveAccount();
        if (!cancel) {
          setAccount(acc ?? null);
          setReady(true);
        }
        console.log('[AuthProvider] MSAL initialized');
      } catch (err) {
        console.error('[AuthProvider] init error:', err);
        if (!cancel) setReady(true);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const signIn = React.useCallback(async (mode: 'popup' | 'redirect' = 'popup') => {
    if (config.BYPASS_AUTH) { setAccount(MOCK_ACCOUNT); return; }
    const acc = await ensureLogin(mode);
    setAccount(acc);
    setReady(true);
  }, []);

  const signOut = React.useCallback(async () => {
    if (config.BYPASS_AUTH) { setAccount(null); return; }
    await logout();
    setAccount(null);
    setReady(true);
  }, []);

  const getToken = React.useCallback(async (): Promise<string> => {
    if (config.BYPASS_AUTH) return 'bypass-dev-token'; // ← token ficticio
    if (!isLoggedIn()) {
      throw new Error('No hay sesión iniciada. Inicia sesión para continuar.');
    }
    return getAccessToken({ interactionMode: 'popup', forceSilent: false });
  }, []);

  const value = React.useMemo<AuthCtx>(
    () => ({ ready, account, getToken, signIn, signOut }),
    [ready, account, getToken, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useAuth(): AuthCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}