import * as React from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import {
  initMSAL,
  ensureActiveAccount,
  isLoggedIn,
  getAccessToken,
  ensureLogin,
  logout,
} from './msal';

export type AuthCtx = {
  ready:    boolean;
  account:  AccountInfo | null;
  getToken: () => Promise<string>;
  signIn:   (mode?: 'popup' | 'redirect') => Promise<void>;
  signOut:  () => Promise<void>;
};

export const AuthContext = React.createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready,   setReady]   = React.useState(false);
  const [account, setAccount] = React.useState<AccountInfo | null>(null);

  React.useEffect(() => {
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
    const acc = await ensureLogin(mode);
    setAccount(acc);
    setReady(true);
  }, []);

  const signOut = React.useCallback(async () => {
    await logout();
    setAccount(null);
    setReady(true);
  }, []);

  const getToken = React.useCallback(async () => {
    if (!isLoggedIn()) {
      throw new Error('No hay sesión iniciada. Inicia sesión para continuar.');
    }
    return getAccessToken({ interactionMode: 'popup', forceSilent: false });
  }, []);

  const value = React.useMemo<AuthCtx>(
    () => ({ ready, account, getToken, signIn, signOut }),
    [ready, account, getToken, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};