// src/auth/msal.ts
import {
  PublicClientApplication,
  EventType,
  InteractionRequiredAuthError,
  type AccountInfo,
  type EventMessage,
  type PopupRequest,
  type RedirectRequest,
  type SilentRequest,
} from '@azure/msal-browser';

/* ===========================
   Variables de entorno
   =========================== */
const clientId  = import.meta.env.VITE_AZURE_CLIENT_ID  as string;
const tenantId  = import.meta.env.VITE_AZURE_TENANT_ID  as string;

if (!clientId || !tenantId) {
  throw new Error(
    '[MSAL] Faltan variables de entorno: VITE_AZURE_CLIENT_ID y/o VITE_AZURE_TENANT_ID',
  );
}

/* ===========================
   Configuración básica MSAL
   =========================== */
export const msal = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation:         'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (message?.includes('msal')) {
          console.debug('[MSAL]', level, message);
        }
      },
      piiLoggingEnabled: false,
    },
  },
});

/* ===========================
   Estado de inicialización
   =========================== */
let initialized = false;

/** Scopes centralizados para login/token */
export const SCOPES = ['openid', 'profile', 'email', 'User.Read'] as const;

const loginPopupRequest: PopupRequest     = { scopes: [...SCOPES], prompt: 'select_account' };
const loginRedirectRequest: RedirectRequest = { scopes: [...SCOPES], prompt: 'select_account' };

/** Inicializa MSAL y procesa el retorno de redirect */
export async function initMSAL(): Promise<void> {
  if (initialized) return;
  await msal.initialize();
  await msal.handleRedirectPromise().catch((e) => {
    console.error('[MSAL] handleRedirectPromise error:', e);
  });
  wireEventsOnce();
  ensureActiveAccount();
  initialized = true;
}

/* ===========================
   Gestión de cuenta activa
   =========================== */

export function ensureActiveAccount(): AccountInfo | null {
  const acc = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  if (acc) msal.setActiveAccount(acc);
  return acc;
}

export function isLoggedIn(): boolean {
  return !!(msal.getActiveAccount() ?? msal.getAllAccounts()[0]);
}

export function getAccount(): AccountInfo | null {
  return msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
}

/* ===========================
   Login (popup / redirect)
   =========================== */

export async function ensureLoginPopup(): Promise<AccountInfo> {
  await initMSAL();
  let account = ensureActiveAccount();
  if (!account) {
    try {
      const res = await msal.loginPopup(loginPopupRequest);
      account = res.account ?? msal.getAllAccounts()[0]!;
      msal.setActiveAccount(account);
    } catch (e) {
      console.warn('[MSAL] loginPopup falló, fallback a redirect…', e);
      await msal.loginRedirect(loginRedirectRequest);
      return new Promise<AccountInfo>(() => {});
    }
  }
  return account;
}

export async function ensureLoginRedirect(): Promise<AccountInfo> {
  await initMSAL();
  const account = ensureActiveAccount();
  if (!account) {
    await msal.loginRedirect(loginRedirectRequest);
    return new Promise<AccountInfo>(() => {});
  }
  return account;
}

export async function ensureLogin(mode: 'popup' | 'redirect' = 'redirect'): Promise<AccountInfo> {
  return mode === 'popup' ? ensureLoginPopup() : ensureLoginRedirect();
}

/* ===========================
   Tokens (silent → popup → redirect)
   =========================== */

export async function getAccessToken(opts?: {
  interactionMode?:           'popup' | 'redirect';
  silentExtraScopesToConsent?: string[];
  forceSilent?:               boolean;
}): Promise<string> {
  await initMSAL();
  const account = ensureActiveAccount();

  if (!account) {
    const mode = opts?.interactionMode ?? 'popup';
    if (mode === 'popup') {
      try {
        const res = await msal.loginPopup(loginPopupRequest);
        msal.setActiveAccount(res.account ?? null);
      } catch {
        await msal.loginRedirect(loginRedirectRequest);
        return new Promise<string>(() => {});
      }
    } else {
      await msal.loginRedirect(loginRedirectRequest);
      return new Promise<string>(() => {});
    }
  }

  const silentReq: SilentRequest = {
    account: ensureActiveAccount()!,
    scopes:  [...SCOPES, ...(opts?.silentExtraScopesToConsent ?? [])],
  };

  try {
    const res = await msal.acquireTokenSilent(silentReq);
    return res.accessToken;
  } catch (e) {
    if (opts?.forceSilent) throw e;

    if (e instanceof InteractionRequiredAuthError) {
      const mode = opts?.interactionMode ?? 'popup';
      if (mode === 'popup') {
        try {
          const res = await msal.acquireTokenPopup({ scopes: [...SCOPES], account: silentReq.account });
          return res.accessToken;
        } catch (popupErr) {
          console.warn('[MSAL] popup bloqueado/cancelado; fallback a redirect para token…', popupErr);
          await msal.acquireTokenRedirect({ scopes: [...SCOPES], account: silentReq.account });
          return new Promise<string>(() => {});
        }
      } else {
        await msal.acquireTokenRedirect({ scopes: [...SCOPES], account: silentReq.account });
        return new Promise<string>(() => {});
      }
    }
    throw e;
  }
}

/* ===========================
   Logout
   =========================== */

export async function logout(): Promise<void> {
  await initMSAL();
  const account = ensureActiveAccount();
  await msal.logoutRedirect({
    account,
    postLogoutRedirectUri: 'https://solvi.estudiodemoda.com.co/',
  });
}

/* ===========================
   Eventos MSAL
   =========================== */
let eventsWired = false;

function wireEventsOnce() {
  if (eventsWired) return;
  msal.addEventCallback((ev: EventMessage) => {
    switch (ev.eventType) {
      case EventType.LOGIN_SUCCESS: {
        const acc = (ev.payload as any)?.account as AccountInfo | undefined;
        if (acc) msal.setActiveAccount(acc);
        break;
      }
      case EventType.LOGIN_FAILURE:
      case EventType.ACQUIRE_TOKEN_FAILURE:
      case EventType.LOGOUT_FAILURE:
        console.warn('[MSAL] Event error:', ev);
        break;
      default:
        break;
    }
  });
  eventsWired = true;
}

export function onMsalEvent(cb: (ev: EventMessage) => void): void {
  msal.addEventCallback(cb);
}