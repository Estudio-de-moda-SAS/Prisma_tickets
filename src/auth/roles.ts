// src/auth/roles.ts
//
// Fuente de verdad: TBL_Users (User_Role + Department_ID)
//
// Reglas de acceso:
//   admin  + TI  → acceso completo (board + config)
//   member + TI  → acceso a board, sin config
//   member + otro dpto → solo inicio y nueva solicitud

import { useAuth } from '@/auth/AuthProvider';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'ti_member' | 'client';

export type ResolvedRole =
  | { role: 'admin';     teamCode: string | null }  // TI admin — todo
  | { role: 'ti_member'; teamCode: string | null }  // TI member — board, sin config
  | { role: 'client';    teamCode: null };           // Otros — solo inicio

const TI_DEPARTMENT_ID = 7;

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useRole(): ResolvedRole {
  const { dbUser } = useAuth();
 //console.log('[ROLE] dbUser:', dbUser?.User_Role, 'dept:', dbUser?.Department_ID);
  // Bypass de desarrollo
  if (!dbUser) return { role: 'client', teamCode: null };

  const isTI    = dbUser.Department_ID === TI_DEPARTMENT_ID;
  const isAdmin = dbUser.User_Role === 'admin';
  const teamCode = dbUser.team?.Team_Code ?? null;

  if (isAdmin && isTI)  return { role: 'admin',     teamCode };
  if (isTI)             return { role: 'ti_member', teamCode };
  return { role: 'client', teamCode: null };
}

// ─── Guards de conveniencia ───────────────────────────────────────────────────

export function canSeeBoard(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin' || resolved.role === 'ti_member';
}

export function canSeeConfig(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin';
}

export function canSeeStats(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin' || resolved.role === 'ti_member';
}

export function canSeeAutomations(resolved: ResolvedRole): boolean {
  return resolved.role === 'admin';
}