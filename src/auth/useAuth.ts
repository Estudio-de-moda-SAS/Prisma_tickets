import * as React from 'react';

type AuthCtx = {
  ready:    boolean;
  account:  import('@azure/msal-browser').AccountInfo | null;
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