/**
 * Métricas de flujo/salud (memoizadas).
 *
 * @module stats/useFlowStats
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import { calcFlowMetrics } from './lib/calcFlowMetrics';
import type { FlowMetrics } from './types';

/**
 * Calcula lead time, aging, throughput y estimación.
 *
 * @param requests - Requests con scope de usuario + equipo, sin filtro de sprint.
 * @returns Las métricas de flujo.
 */
export function useFlowStats(requests: Request[]): FlowMetrics {
  return useMemo(() => calcFlowMetrics(requests), [requests]);
}
