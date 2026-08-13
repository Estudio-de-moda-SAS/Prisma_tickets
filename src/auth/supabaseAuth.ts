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
  const providerToken = session?.provider_token;

  if (providerToken) {
    clearSilentReauthAttempt();
    return providerToken;
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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
