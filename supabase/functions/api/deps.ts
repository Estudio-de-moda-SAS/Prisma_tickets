/**
 * Punto único de importación de dependencias externas (barrel).
 *
 * Centraliza las dependencias de terceros para fijar sus versiones en un solo
 * lugar y que el resto del código las importe desde aquí en vez de referenciar
 * las URLs/specifiers directamente.
 *
 * Reexporta:
 * - `createClient` de `@supabase/supabase-js@2` (JSR) — cliente de Supabase.
 * - `createRemoteJWKSet` y `jwtVerify` de `jose@5` (npm) — verificación de JWT
 *   contra un JWKS remoto.
 *
 * @module deps
 */

// @ts-ignore
export { createClient } from 'jsr:@supabase/supabase-js@2';
// @ts-ignore
export { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';