// @ts-ignore
import { createRemoteJWKSet, jwtVerify } from '../deps.ts';
// @ts-ignore
import { TENANT_ID, CLIENT_ID } from '../config.ts';

/**
 * Verificación de JWT para los dos flujos de autenticación soportados.
 *
 * Expone {@link verifyAzureToken} (tokens de Microsoft Entra ID / Azure AD) y
 * {@link verifySupabaseToken} (tokens de Supabase Auth). Ambos validan la firma
 * contra el JWKS público del emisor correspondiente y comprueban emisor,
 * audiencia y claims específicos.
 *
 * @remarks
 * La validación de Supabase se añadió durante la migración de MSAL a Supabase y
 * reutiliza el mismo mecanismo basado en JWKS remoto que la de Azure.
 *
 * @module authVerify
 */

/** Emisor esperado para tokens Entra ID v2.0. */
const ENTRA_ISSUER_V2 = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
/** Emisor esperado para tokens Entra ID v1.0 (endpoint `sts.windows.net`). */
const ENTRA_ISSUER_V1 = `https://sts.windows.net/${TENANT_ID}/`;

/** JWKS remoto de Entra ID; provee las claves públicas para verificar la firma. */
const ENTRA_JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`),
);

/**
 * Verifica un token de acceso de Microsoft Entra ID (Azure AD).
 *
 * @remarks
 * Decodifica primero el payload (base64url) solo para detectar si el token es v1
 * (`sts.windows.net`) o v2 y elegir el emisor esperado; la validación real de la
 * firma la hace `jwtVerify` contra {@link ENTRA_JWKS}, exigiendo el emisor
 * correcto y la audiencia `api://<CLIENT_ID>`. Adicionalmente comprueba que el
 * claim `tid` coincida con el tenant configurado.
 *
 * @param token - JWT de acceso en formato compacto (`header.payload.signature`).
 * @returns El payload verificado del token.
 * @throws Si la firma, el emisor o la audiencia son inválidos, o si el `tid` no
 *   corresponde al tenant autorizado.
 */
export async function verifyAzureToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  const raw = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  const issuer = raw.iss?.includes('sts.windows.net') ? ENTRA_ISSUER_V1 : ENTRA_ISSUER_V2;
  const { payload } = await jwtVerify(token, ENTRA_JWKS, {
    issuer,
    audience: `api://${CLIENT_ID}`,
  });
  if (payload['tid'] !== TENANT_ID)
    throw new Error('[API] Token de tenant no autorizado: ' + payload['tid']);
  return payload as Record<string, unknown>;
}

// ── Validación de token de Supabase Auth (migración MSAL → Supabase) ────────
// Los tokens de Supabase están firmados con ES256 y se validan contra el
// JWKS público del proyecto. Reusa el mismo mecanismo que verifyAzureToken.

/** URL base del proyecto Supabase (desde variable de entorno). */
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? '';
/** Emisor esperado para tokens de Supabase Auth. */
const SUPABASE_ISSUER = `${SUPABASE_URL}/auth/v1`;

/** JWKS remoto del proyecto Supabase; provee las claves públicas (ES256). */
const SUPABASE_JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

/**
 * Verifica un token de Supabase Auth.
 *
 * @remarks
 * Valida la firma (ES256) contra {@link SUPABASE_JWKS}, exigiendo el emisor
 * `<SUPABASE_URL>/auth/v1` y la audiencia `authenticated`, y comprueba que el
 * claim `role` sea `authenticated` (rechaza tokens anónimos o de servicio).
 *
 * @param token - JWT de Supabase en formato compacto.
 * @returns El payload verificado del token.
 * @throws Si la firma, el emisor o la audiencia son inválidos, o si el `role`
 *   no es `authenticated`.
 */
export async function verifySupabaseToken(token: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, SUPABASE_JWKS, {
    issuer:   SUPABASE_ISSUER,
    audience: 'authenticated',
  });
  if (payload['role'] !== 'authenticated')
    throw new Error('[API] Token de Supabase sin role authenticated');
  return payload as Record<string, unknown>;
}