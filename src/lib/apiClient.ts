// src/lib/apiClient.ts
// Cliente que llama a la Edge Function con el token de Azure AD.
// El frontend nunca habla directamente con Supabase.

import { getAccessToken } from '@/auth/msal';
import { supabase } from '@/lib/supabaseClient';
import { config } from '@/config';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;

/* ============================================================
   Obtiene el token según el modo de auth activo.
   - Flag on  → token de sesión de Supabase Auth
   - Flag off → token de MSAL/Azure (comportamiento original)
   ============================================================ */
async function getAuthToken(): Promise<string> {
  if (config.USE_SUPABASE_AUTH) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error('[apiClient] No hay sesión de Supabase');
    return data.session.access_token;
  }
  // [MSAL-LEGACY]
  return getAccessToken({ forceSilent: false, interactionMode: 'popup' });
}

/* ============================================================
   Función base — todas las llamadas pasan por aquí
   ============================================================ */
async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = await getAuthToken();

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  //console.log('[apiClient] status:', res.status);
  //console.log('[apiClient] headers:', Object.fromEntries(res.headers.entries()));
  const rawText = await res.text();
  //console.log('[apiClient] body raw:', rawText);

  if (!res.ok) {
    throw new Error(`[API] ${action} → ${res.status}: ${rawText}`);
  }

  const json = JSON.parse(rawText) as { data: T };
  return json.data;
}
/* ============================================================
   Exportación del cliente tipado
   ============================================================ */
export const apiClient = {
  call: callApi,
};

