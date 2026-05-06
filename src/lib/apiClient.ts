// src/lib/apiClient.ts
// Cliente que llama a la Edge Function con el token de Azure AD.
// El frontend nunca habla directamente con Supabase.

import { getAccessToken } from '@/auth/msal';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;

/* ============================================================
   Función base — todas las llamadas pasan por aquí
   ============================================================ */
async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = await getAccessToken({ forceSilent: false, interactionMode: 'popup' });

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
  console.log('[apiClient] body raw:', rawText);

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

