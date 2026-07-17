// src/auth/supabaseAuth.ts
//
// Login vía Supabase Auth con provider Azure. Convive con MSAL.
// Solo se usa cuando config.USE_SUPABASE_AUTH está en true.

import { supabase } from '@/lib/supabaseClient';

/** Inicia el flujo de login con Microsoft a través de Supabase Auth. */
export async function signInWithSupabaseAzure(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes:     'openid email profile',
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

/** Devuelve la sesión actual de Supabase (o null). */
export async function getSupabaseSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
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