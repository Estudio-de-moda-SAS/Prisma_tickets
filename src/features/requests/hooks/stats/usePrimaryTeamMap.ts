/**
 * Equipo principal por usuario (memoizado).
 *
 * @module stats/usePrimaryTeamMap
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import { buildPrimaryTeamMap } from './lib/buildPrimaryTeamMap';

/**
 * Map `userId → primaryTeam` derivado del historial de asignaciones.
 *
 * @param requests - Todos los requests.
 * @returns El mapa de equipo principal.
 */
export function usePrimaryTeamMap(requests: Request[]): Map<number, string> {
  return useMemo(() => buildPrimaryTeamMap(requests), [requests]);
}
