// @ts-ignore
import { createClient } from '../deps.ts';
// @ts-ignore
import { SUPABASE_URL, SERVICE_KEY } from '../config.ts';

export function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export type DB = ReturnType<typeof createServiceClient>;