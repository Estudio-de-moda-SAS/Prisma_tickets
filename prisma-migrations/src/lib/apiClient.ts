// src/lib/apiClient.ts
//
// Wrapper de llamadas al Edge Function de PRISMA, para el script
// de migración. Se autentica con X-Internal-Job-Secret (NO Bearer
// de Azure), igual que los background jobs internos.
//
// Espeja el patrón apiClient.call(action, payload) del front.

import 'dotenv/config';

const API_URL = process.env.PRISMA_API_URL;
const SECRET  = process.env.INTERNAL_JOB_SECRET;

if (!API_URL)  throw new Error('Falta PRISMA_API_URL en el .env');
if (!SECRET)   throw new Error('Falta INTERNAL_JOB_SECRET en el .env');

export interface ApiError extends Error {
  status?: number;
  action?: string;
}

/**
 * Llama una acción del Edge Function y devuelve su `data`.
 * Lanza ApiError con status/action si la respuesta no es 2xx.
 */
export async function call<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'X-Internal-Job-Secret': SECRET!,
    },
    body: JSON.stringify({ action, payload }),
  });

  let json: { data?: T; error?: string } | null = null;
try { json = (await res.json()) as { data?: T; error?: string }; } catch { /* respuesta sin JSON */ }
  if (!res.ok) {
    const err = new Error(
      json?.error ?? `HTTP ${res.status} en acción "${action}"`,
    ) as ApiError;
    err.status = res.status;
    err.action = action;
    throw err;
  }

  return (json?.data as T);
}

/**
 * Igual que call(), pero reintenta ante errores de red o 5xx
 * (no reintenta 4xx, que son errores de datos). Útil para los
 * cientos de llamadas de la fase de carga.
 */
export async function callWithRetry<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await call<T>(action, payload);
    } catch (err) {
      lastErr = err;
      const status = (err as ApiError).status;
      // 4xx = error de datos: no tiene sentido reintentar.
      if (status && status >= 400 && status < 500) throw err;
      if (attempt < maxRetries) {
        const backoffMs = 500 * attempt;
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}