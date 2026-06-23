export const TENANT_ID    = Deno.env.get('AZURE_TENANT_ID')!;
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const CLIENT_ID    = Deno.env.get('AZURE_CLIENT_ID')!;
export const INTERNAL_JOB_SECRET = Deno.env.get('INTERNAL_JOB_SECRET') ?? '';
export const SELF_URL     = `${SUPABASE_URL}/functions/v1/api`;

export const JOB_CHUNK_SIZE            = 100;
export const JOB_MAX_CHUNKS_PER_INVOKE = 5;
export const RATING_RATE_LIMIT_DAYS    = 0;

export const MAX_EXPORT_SIZE              = parseInt(Deno.env.get('MAX_EXPORT_SIZE') ?? '100000', 10);
export const EXPORT_JOB_CHUNK_SIZE        = parseInt(Deno.env.get('EXPORT_JOB_CHUNK_SIZE') ?? '500', 10);
export const EXPORT_MAX_CHUNKS_PER_INVOKE = parseInt(Deno.env.get('EXPORT_MAX_CHUNKS_PER_INVOKE') ?? '8', 10);
export const EXPORT_BUCKET                = 'exports';