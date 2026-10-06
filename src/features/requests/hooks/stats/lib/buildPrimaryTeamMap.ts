/**
 * Equipo principal de cada usuario, derivado del historial de asignaciones.
 *
 * @module stats/lib/buildPrimaryTeamMap
 */

import type { Request } from '@/features/requests/types';

/**
 * Deriva el equipo principal de cada usuario a partir del historial de asignaciones.
 *
 * @remarks
 * Cuenta, por usuario, cuántas veces fue asignado a solicitudes de cada equipo, y
 * elige el equipo con más apariciones.
 *
 * @param requests - Solicitudes con sus asignados y equipos.
 * @returns Un `Map` de `userId → código de equipo principal`.
 */
export function buildPrimaryTeamMap(requests: Request[]): Map<number, string> {
  const teamCount = new Map<number, Map<string, number>>();
  for (const req of requests) {
    for (const a of req.assignees) {
      if (!teamCount.has(a.userId)) teamCount.set(a.userId, new Map());
      for (const eq of req.equipo) {
        const c = teamCount.get(a.userId)!;
        c.set(eq, (c.get(eq) ?? 0) + 1);
      }
    }
  }
  const result = new Map<number, string>();
  for (const [userId, counts] of teamCount) {
    if (counts.size > 0) {
      result.set(userId, [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0]);
    }
  }
  return result;
}
