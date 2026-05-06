import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import type { Equipo } from '@/features/requests/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'member' | 'client';

export type ResolvedRole =
  | { role: 'admin';  team: null }
  | { role: 'member'; team: Equipo }
  | { role: 'client'; team: null };

// ─── Resolución de rol ────────────────────────────────────────────────────────
// Un usuario puede pertenecer a varios grupos en Azure AD simultáneamente.
// Se aplica el rol de mayor jerarquía: admin > member > client.
//
// El claim `groups` llega como array de GUIDs en idTokenClaims.
// Requiere configurar en Azure AD → App registrations → Token configuration
// → Add groups claim → Security groups.

function resolveRoleFromGroups(groups: string[]): ResolvedRole {
  const g = (config as any).GROUPS;   ///esto lo cambio la ia de vs, no se que pueda pasar...

  // Admin tiene prioridad absoluta — si está en el grupo admin, es admin
  if (g.admin && groups.includes(g.admin)) {
    return { role: 'admin', team: null };
  }

  // Member — se revisan todos los equipos; si pertenece a más de uno
  // se toma el primero encontrado (caso raro, pero manejado)
  const teamEntries: [Equipo, string][] = [
    ['desarrollo', g.desarrollo],
    ['crm',        g.crm],
    ['sistemas',   g.sistemas],
    ['analisis',   g.analisis],
  ];

  for (const [team, guid] of teamEntries) {
    if (guid && groups.includes(guid)) {
      return { role: 'member', team };
    }
  }

  // Sin grupo reconocido → cliente
  return { role: 'client', team: null };
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function useRole(): ResolvedRole {
  const { account } = useAuth();

  // Bypass de desarrollo — controlado desde config.ts
  // BYPASS_ROLE debe ser null en producción
  if (config.BYPASS_ROLE !== null) {
    if (config.BYPASS_ROLE === 'admin')  return { role: 'admin',  team: null };
    if (config.BYPASS_ROLE === 'client') return { role: 'client', team: null };
    if (config.BYPASS_ROLE === 'member') return { role: 'member', team: config.BYPASS_TEAM };
  }

  // Sin cuenta activa → client por defecto
  if (!account) return { role: 'client', team: null };

  // Extraer claim `groups` del idTokenClaims
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;
  const groups = Array.isArray(claims?.groups) ? (claims.groups as string[]) : [];

  return resolveRoleFromGroups(groups);
}

// ─── Guards de conveniencia ───────────────────────────────────────────────────
export function canSeeBoard(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin' || resolved.role === 'member';
}

export function canSeeStats(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin' || resolved.role === 'member';
}

export function canSeeRequests(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin';
}

export function canSeeAutomations(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin';
}