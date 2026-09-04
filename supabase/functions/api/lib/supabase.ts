// @ts-ignore
import { createClient } from '../deps.ts';
// @ts-ignore
import { SUPABASE_URL, SERVICE_KEY } from '../config.ts';

/**
 * Fábrica del cliente de Supabase con rol de servicio.
 *
 * Expone {@link createServiceClient} y el tipo {@link DB} que se usa en toda la
 * capa de acceso a datos.
 *
 * @module supabase
 */

/**
 * Crea un cliente de Supabase autenticado con la `service role key`.
 *
 * @remarks
 * Usa la clave de servicio, por lo que salta las políticas RLS: debe usarse solo
 * en el backend, nunca exponerse al cliente. Desactiva la persistencia de sesión
 * (`persistSession: false`) porque en un entorno sin estado (Edge Function) no
 * hay dónde ni por qué guardarla.
 *
 * @returns Un cliente de Supabase listo para operar con privilegios de servicio.
 */
export function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Tipo del cliente de Supabase de servicio.
 *
 * @remarks
 * Se deriva del valor de retorno de {@link createServiceClient} para mantener el
 * tipo sincronizado automáticamente. Es el tipo esperado por los handlers y
 * helpers que reciben `supabase` / `DB`.
 */
export type DB = ReturnType<typeof createServiceClient>;