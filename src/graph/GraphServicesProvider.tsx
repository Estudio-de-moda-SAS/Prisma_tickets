import * as React from 'react';
import { GraphRest } from '@/graph/GraphRest';
import { useAuth } from '@/auth/AuthProvider';
import { SupabaseRequestsService } from '@/features/requests/services/SupabaseRequestsService';
import { GraphServicesContext } from './useGraphServices';
import { config } from '@/config';

/* ============================================================
   Tipo del contexto
   — GraphRest se mantiene para Graph API (usuarios, org, mail)
   — Requests apunta a Supabase
   ============================================================ */
export type GraphServices = {
  graph:    GraphRest;
  Requests: SupabaseRequestsService;
};

/* ============================================================
   Re-export del hook — mantiene compatibilidad con todos los
   imports existentes de '@/graph/GraphServicesProvider'
   ============================================================ */
export { useGraphServices } from './useGraphServices';

/* ============================================================
   Provider
   ============================================================ */
type ProviderProps = {
  children: React.ReactNode;
  boardId?: number; // Board_ID de Supabase; por defecto usa config.DEFAULT_BOARD_ID
};

export const GraphServicesProvider: React.FC<ProviderProps> = ({
  children,
  boardId = config.DEFAULT_BOARD_ID,
}) => {
  const { getToken } = useAuth();

  const graph = React.useMemo(
    () => new GraphRest(getToken),
    [getToken],
  );

  const services = React.useMemo<GraphServices>(
    () => ({
      graph,
      Requests: new SupabaseRequestsService(boardId),
    }),
    [graph, boardId],
  );

  return (
    <GraphServicesContext.Provider value={services}>
      {children}
    </GraphServicesContext.Provider>
  );
};