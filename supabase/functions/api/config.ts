/**
 * Configuración central: variables de entorno y constantes de ajuste.
 *
 * Reúne las credenciales y URLs leídas del entorno (Azure/Entra ID, Supabase,
 * secreto de jobs internos) y los parámetros de tuning de los jobs en background
 * y de la exportación.
 *
 * @remarks
 * Las variables marcadas con `!` (non-null assertion) se asumen presentes: si
 * faltan en el entorno, valdrán `undefined` en tiempo de ejecución pese al tipo.
 * Conviene garantizarlas en el despliegue.
 *
 * @module config
 */

/** Tenant de Azure/Entra ID (`AZURE_TENANT_ID`). */
export const TENANT_ID    = Deno.env.get('AZURE_TENANT_ID')!;
/** URL base del proyecto Supabase (`SUPABASE_URL`). */
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/** Service role key de Supabase (`SUPABASE_SERVICE_ROLE_KEY`); solo backend, salta RLS. */
export const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Client ID de la app en Azure/Entra ID (`AZURE_CLIENT_ID`). */
export const CLIENT_ID    = Deno.env.get('AZURE_CLIENT_ID')!;
/** Secreto compartido para autorizar la auto-invocación de jobs internos; `''` si no está definido. */
export const INTERNAL_JOB_SECRET = Deno.env.get('INTERNAL_JOB_SECRET') ?? '';
/** URL de la propia Edge Function `api`, usada para auto-invocarse en el procesamiento por chunks. */
export const SELF_URL     = `${SUPABASE_URL}/functions/v1/api`;

/** Tamaño de lote (requests por chunk) para jobs genéricos en background. */
export const JOB_CHUNK_SIZE            = 100;
/** Máximo de chunks procesados por invocación antes de auto-reinvocarse (jobs genéricos). */
export const JOB_MAX_CHUNKS_PER_INVOKE = 5;
/** Días mínimos entre calificaciones (rate limit). `0` = sin límite. */
export const RATING_RATE_LIMIT_DAYS    = 0;

/** Tope de tickets exportables (`MAX_EXPORT_SIZE`, por defecto 100000). */
export const MAX_EXPORT_SIZE              = parseInt(Deno.env.get('MAX_EXPORT_SIZE') ?? '100000', 10);
/** Tamaño de chunk de la exportación (`EXPORT_JOB_CHUNK_SIZE`, por defecto 500). */
export const EXPORT_JOB_CHUNK_SIZE        = parseInt(Deno.env.get('EXPORT_JOB_CHUNK_SIZE') ?? '500', 10);
/** Máximo de chunks de exportación por invocación (`EXPORT_MAX_CHUNKS_PER_INVOKE`, por defecto 8). */
export const EXPORT_MAX_CHUNKS_PER_INVOKE = parseInt(Deno.env.get('EXPORT_MAX_CHUNKS_PER_INVOKE') ?? '8', 10);
/** Nombre del bucket de Storage donde se guardan los artifacts de exportación. */
export const EXPORT_BUCKET                = 'exports';