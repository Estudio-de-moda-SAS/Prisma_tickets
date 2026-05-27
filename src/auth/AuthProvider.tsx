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

// ─── Config ───────────────────────────────────────────────────────────────────
// Cambiá este mail cuando lo tengan definido
const CONTACT_EMAIL = 'ti@empresa.com';

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
  Is_Active:     true,
  team: { Team_Code: 'ti', Team_Name: 'TI' },
};

// ─── Pantalla de acceso suspendido ────────────────────────────────────────────

function BlockedScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg-base, #0d0d0f)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body, sans-serif)',
    }}>
      {/* Fondo geométrico — mismo que LoginPage */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.04 }}>
          <defs>
            <pattern id="hex-blocked" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
              <polygon points="30,2 56,16 56,44 30,58 4,44 4,16" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-blocked)" />
        </svg>
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,71,87,0.12) 0%, transparent 70%)',
          top: '10%', left: '20%', filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,92,231,0.10) 0%, transparent 70%)',
          bottom: '10%', right: '20%', filter: 'blur(60px)',
        }} />
      </div>

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--bg-panel, #16161a)',
        border: '1px solid rgba(255,71,87,0.25)',
        borderRadius: 16, padding: '48px 40px',
        maxWidth: 440, width: '90%',
        boxShadow: '0 0 0 1px rgba(255,71,87,0.08), 0 24px 64px rgba(0,0,0,0.5)',
        textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}>

        {/* Icono */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%', marginBottom: 24,
          background: 'rgba(255,71,87,0.1)',
          border: '1px solid rgba(255,71,87,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>

        {/* Título */}
        <h1 style={{
          margin: '0 0 8px',
          fontSize: 22, fontWeight: 700,
          fontFamily: 'var(--font-display, sans-serif)',
          color: 'var(--txt, #f0f0f0)',
          letterSpacing: 0.5,
        }}>
          Acceso suspendido
        </h1>

        {/* Subtítulo */}
        <p style={{
          margin: '0 0 28px',
          fontSize: 13, lineHeight: 1.6,
          color: 'var(--txt-muted, #888)',
        }}>
          Tu cuenta ha sido desactivada y ya no tenés acceso al sistema.
          Si creés que esto es un error, contactá al equipo de soporte.
        </p>

        {/* Mail de contacto */}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 8, marginBottom: 24,
            background: 'rgba(255,71,87,0.08)',
            border: '1px solid rgba(255,71,87,0.25)',
            color: '#ff4757', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,71,87,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,71,87,0.08)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {CONTACT_EMAIL}
        </a>

        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: 'var(--border-subtle, rgba(255,255,255,0.06))', marginBottom: 20 }} />

        {/* Cerrar sesión */}
        <button
          onClick={onSignOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 7,
            background: 'transparent',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            color: 'var(--txt-muted, #888)', fontSize: 12,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.15))'; e.currentTarget.style.color = 'var(--txt, #f0f0f0)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255,255,255,0.08))'; e.currentTarget.style.color = 'var(--txt-muted, #888)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Cerrar sesión
        </button>

        {/* Usuario */}
        <p style={{ margin: '16px 0 0', fontSize: 10, color: 'var(--txt-muted, #888)', opacity: 0.5 }}>
          {email}
        </p>
      </div>

      <p style={{ position: 'relative', zIndex: 1, marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        Prisma Support System · Uso interno exclusivo
      </p>
    </div>
  );
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const Ctx = React.createContext<AuthCtx | null>(null);

// ─── Helper ───────────────────────────────────────────────────────────────────

async function loadDbUser(account: AccountInfo): Promise<UserProfile> {
  const user = await apiClient.call<UserProfile>('upsertUserByEntraId', {
    entraId: account.homeAccountId,
    name:    account.name    ?? account.username,
    email:   account.username,
  });
  return user;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready,    setReady]    = React.useState<boolean>(config.BYPASS_AUTH);
  const [dbReady,  setDbReady]  = React.useState<boolean>(config.BYPASS_AUTH);
  const [blocked,  setBlocked]  = React.useState<boolean>(false);
  const [account,  setAccount]  = React.useState<AccountInfo | null>(
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
            if (!cancel) {
              if (user.Is_Active === false) {
                setBlocked(true);
              } else {
                setDbUser(user);
              }
            }
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
      if (user.Is_Active === false) {
        setBlocked(true);
      } else {
        setDbUser(user);
      }
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
      setBlocked(false);
      setDbReady(true);
      return;
    }

    await logout();
    setAccount(null);
    setDbUser(null);
    setBlocked(false);
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
      if (user.Is_Active === false) {
        setBlocked(true);
        setDbUser(null);
      } else {
        setBlocked(false);
        setDbUser(user);
      }
    } catch (err) {
      console.error('[AuthProvider] Error refrescando usuario DB:', err);
    }
  }, [account]);

  const value = React.useMemo<AuthCtx>(
    () => ({ ready, dbReady, account, dbUser, getToken, signIn, signOut, refreshDbUser }),
    [ready, dbReady, account, dbUser, getToken, signIn, signOut, refreshDbUser],
  );

  // Si el usuario está bloqueado, mostramos la pantalla de acceso suspendido
  // en vez de la app — sin tocar el router ni ninguna ruta
  if (blocked) {
    return (
      <BlockedScreen
        email={account?.username ?? ''}
        onSignOut={signOut}
      />
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}