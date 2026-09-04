// src/lib/users.ts
//
// Resuelve "Asignada" (texto del Excel) → User_ID.
//
// El Excel suele traer solo el primer nombre ("Monica"), así que
// indexamos a los usuarios por varias claves: nombre completo,
// forma de display colombiana (primer nombre + primer apellido) y
// primer nombre suelto. Si una clave matchea exactamente 1 usuario
// → resuelve; si 0 → no encontrado; si varios → ambiguo (lo reporta
// el dry-run para que lo resuelvas a mano; nunca elige al azar).

import { call } from './apiClient.ts';
import { normalizeKey } from './transforms.ts';

interface DbUser { User_ID: number; User_Name: string }

export type ResolveOutcome =
  | { userId: number; status: 'ok' }
  | { userId: null; status: 'not_found' }
  | { userId: null; status: 'ambiguous'; candidates: string[] };

export interface UserResolver {
  resolve(rawName: string): ResolveOutcome;
}

function addAlias(index: Map<string, Set<number>>, key: string, id: number): void {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key)!.add(id);
}

/** Trae los usuarios una sola vez y construye el índice de búsqueda. */
export async function buildUserResolver(): Promise<UserResolver> {
  const users = await call<DbUser[]>('migrationFetchUsers', {});

  const index   = new Map<string, Set<number>>();
  const nameById = new Map<number, string>();

  for (const u of users) {
    nameById.set(u.User_ID, u.User_Name);
    const parts = u.User_Name.trim().split(/\s+/);

    // Nombre completo normalizado
    addAlias(index, normalizeKey(u.User_Name), u.User_ID);
    // Primer nombre suelto (parts[0])
    if (parts[0]) addAlias(index, normalizeKey(parts[0]), u.User_ID);
    // Display colombiano: primer nombre + primer apellido (parts[0] + parts[2])
    if (parts[0] && parts[2])
      addAlias(index, normalizeKey(`${parts[0]} ${parts[2]}`), u.User_ID);
  }

  return {
    resolve(rawName: string): ResolveOutcome {
      const key = normalizeKey(rawName);
      const hit = key ? index.get(key) : undefined;
      const ids = hit ? [...hit] : [];

      if (ids.length === 1) return { userId: ids[0], status: 'ok' };
      if (ids.length === 0) return { userId: null, status: 'not_found' };
      return {
        userId: null,
        status: 'ambiguous',
        candidates: ids.map((id) => nameById.get(id) ?? String(id)),
      };
    },
  };
}