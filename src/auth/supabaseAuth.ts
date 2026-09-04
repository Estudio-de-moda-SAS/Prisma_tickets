// src/auth/supabaseAuth.ts
//
// Login vía Supabase Auth con provider Azure. Convive con MSAL.
// Solo se usa cuando config.USE_SUPABASE_AUTH está en true.

import { supabase } from '@/lib/supabaseClient';

const SUPABASE_AZURE_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Sites.ReadWrite.All',
].join(' ');

const AZURE_CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID as string;
const AZURE_TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID as string;

// ── Cache del access token de Graph derivado de un refresh silencioso ──────
// Supabase solo expone provider_token en el login inicial: cuando su propio
// JWT se auto-refresca (o la app vuelve de background), provider_token
// desaparece de la sesión aunque el usuario siga logueado. Este cache evita
// pedirle un token nuevo a Microsoft en cada llamada a Graph mientras siga
// vigente.
let graphTokenCache: { token: string; expiresAt: number } | null = null;

function cacheGraphAccessToken(token: string, expiresInSec: number): void {
  // Margen de 60s para no devolver un token a punto de vencer.
  graphTokenCache = { token, expiresAt: Date.now() + (expiresInSec - 60) * 1000 };
}

function getCachedGraphAccessToken(): string | null {
  if (graphTokenCache && graphTokenCache.expiresAt > Date.now()) return graphTokenCache.token;
  return null;
}

function clearGraphAccessTokenCache(): void {
  graphTokenCache = null;
}

// ── Persistencia del provider_refresh_token de Microsoft ───────────────────
// Azure solo lo entrega en el intercambio OAuth inicial (igual que
// provider_token) y Supabase no lo vuelve a exponer en refreshes
// posteriores. Se guarda aparte para poder canjearlo por un provider_token
// nuevo sin pasar por Supabase ni por un redirect a Microsoft.
const PROVIDER_REFRESH_TOKEN_KEY = 'sb_graph_provider_refresh_token';

function saveProviderRefreshToken(token: string | null | undefined): void {
  if (!token) return;
  try { localStorage.setItem(PROVIDER_REFRESH_TOKEN_KEY, token); } catch { /* noop */ }
}

function getStoredProviderRefreshToken(): string | null {
  try { return localStorage.getItem(PROVIDER_REFRESH_TOKEN_KEY); } catch { return null; }
}

function clearStoredProviderRefreshToken(): void {
  try { localStorage.removeItem(PROVIDER_REFRESH_TOKEN_KEY); } catch { /* noop */ }
}

/**
 * Canjea el provider_refresh_token guardado por un provider_token nuevo,
 * hablando directo con el endpoint de token de Azure AD (grant_type=refresh_token).
 * Es la renovación silenciosa real: un POST en background, sin redirect ni iframe.
 * Devuelve null si no hay refresh token guardado o si el canje falla (refresh
 * token revocado/vencido) — en ese caso el llamador cae al redirect completo.
 */
async function refreshProviderTokenSilently(): Promise<string | null> {
  const refreshToken = getStoredProviderRefreshToken();
  if (!refreshToken || !AZURE_CLIENT_ID || !AZURE_TENANT_ID) return null;

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: AZURE_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: SUPABASE_AZURE_SCOPES,
        }).toString(),
      },
    );

    if (!res.ok) {
      // Refresh token inválido/revocado: se limpia para no reintentar en vano.
      if (res.status === 400 || res.status === 401) clearStoredProviderRefreshToken();
      return null;
    }

    const data = (await res.json()) as {
      access_token?:  string;
      refresh_token?: string;
      expires_in?:    number;
    };
    if (!data.access_token) return null;

    // Azure AD rota el refresh token en cada canje: hay que guardar el nuevo.
    if (data.refresh_token) saveProviderRefreshToken(data.refresh_token);
    cacheGraphAccessToken(data.access_token, data.expires_in ?? 3300);
    return data.access_token;
  } catch {
    return null;
  }
}

/** Inicia el flujo de login con Microsoft a través de Supabase Auth.
 *  Con `silent: true` agrega prompt=none: usa la sesión SSO de Azure ya activa
 *  en el navegador para volver con un provider_token nuevo sin pedir credenciales. */
export async function signInWithSupabaseAzure(opts?: { silent?: boolean }): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes:     SUPABASE_AZURE_SCOPES,
      redirectTo: opts?.silent ? window.location.href : window.location.origin,
      ...(opts?.silent ? { queryParams: { prompt: 'none' } } : {}),
    },
  });
  if (error) throw error;
}

const POST_LOGIN_REDIRECT_KEY = 'sb_post_login_redirect';

/** Recuerda a dónde quería ir el usuario antes de mandarlo a /login, para
 *  volver ahí (y no a /home) una vez completado el login. */
export function savePostLoginRedirect(path: string): void {
  try { sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path); } catch { /* noop */ }
}

/** Lee y limpia la ruta guardada por savePostLoginRedirect (uso único). */
export function consumePostLoginRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (path) sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return path;
  } catch {
    return null;
  }
}

// Supabase renueva su propio JWT sola (autoRefreshToken), pero esa renovación
// no vuelve a traer el provider_token de Microsoft: Azure solo lo entrega en el
// intercambio OAuth inicial. Por eso, tras un refresh (o al restaurar sesión
// desde localStorage), session.provider_token puede venir vacío aunque la
// sesión siga "activa". Este flag evita loops de redirect si prompt=none falla
// (p.ej. sin sesión SSO activa, o consentimiento pendiente).
const SILENT_REAUTH_FLAG        = 'sb_graph_silent_reauth_at';
const SILENT_REAUTH_COOLDOWN_MS = 30_000;

function hasRecentSilentReauthAttempt(): boolean {
  try {
    const raw = sessionStorage.getItem(SILENT_REAUTH_FLAG);
    return !!raw && Date.now() - Number(raw) < SILENT_REAUTH_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function clearSilentReauthAttempt(): void {
  try { sessionStorage.removeItem(SILENT_REAUTH_FLAG); } catch { /* sessionStorage puede no estar disponible */ }
}

/**
 * Reintenta el login con Azure en modo silencioso (prompt=none) para recuperar
 * el provider_token sin interacción del usuario. Navega fuera de la página si
 * lo intenta — no devuelve token, solo indica si el intento se disparó.
 * Devuelve false (sin navegar) si ya se intentó hace poco, para no loopear.
 */
export async function trySilentGraphReauth(): Promise<boolean> {
  if (hasRecentSilentReauthAttempt()) return false;
  try { sessionStorage.setItem(SILENT_REAUTH_FLAG, String(Date.now())); } catch { /* noop */ }
  await signInWithSupabaseAzure({ silent: true });
  return true;
}

/** Devuelve la sesión actual de Supabase (o null). */
export async function getSupabaseSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Devuelve el token OAuth emitido por Microsoft para llamar a Graph.
 * No usar session.access_token aquí: ese JWT es de Supabase, no de Graph.
 */
export async function getSupabaseProviderToken(): Promise<string> {
  const session = await getSupabaseSession();
  saveProviderRefreshToken(session?.provider_refresh_token);

  const providerToken = session?.provider_token;
  if (providerToken) {
    clearSilentReauthAttempt();
    return providerToken;
  }

  // provider_token ausente en la sesión (típico tras un auto-refresh del JWT
  // de Supabase, que no lo repite). Antes de recurrir al redirect completo a
  // Microsoft, intentamos renovarlo en background con el refresh token guardado.
  const cached = getCachedGraphAccessToken();
  if (cached) return cached;

  const refreshed = await refreshProviderTokenSilently();
  if (refreshed) {
    clearSilentReauthAttempt();
    return refreshed;
  }

  if (await trySilentGraphReauth()) {
    // signInWithOAuth navega fuera de la página; esta promesa no llega a resolverse.
    return new Promise<string>(() => {});
  }

  throw new Error(
    'La sesión actual no incluye provider_token de Microsoft. Cerrá sesión y volvé a ingresar para consentir los scopes de Graph.',
  );
}

/** Cierra la sesión de Supabase Auth. */
export async function signOutSupabase(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } finally {
    // Evita que el próximo usuario en este navegador herede el refresh token
    // (o un token cacheado) de la sesión de Graph anterior.
    clearStoredProviderRefreshToken();
    clearGraphAccessTokenCache();
  }
}

/**
 * Reconstruye el entraId (formato <oid>.<tid>) desde la sesión de Supabase,
 * para matchear contra TBL_Users.User_EntraID igual que hace MSAL.
 * Devuelve null si no hay sesión o faltan los claims.
 */
export async function getSupabaseEntraId(): Promise<{
  entraId: string;
  name:    string;
  email:   string;
} | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const user = data.session.user;
  const claims = (user.user_metadata?.custom_claims ?? {}) as {
    oid?: string;
    tid?: string;
  };

  if (!claims.oid || !claims.tid) return null;

  return {
    entraId: `${claims.oid}.${claims.tid}`,
    name:    (user.user_metadata?.full_name as string) ?? user.email ?? '',
    email:   user.email ?? '',
  };
}
