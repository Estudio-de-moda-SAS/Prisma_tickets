import * as React from 'react';
import { GraphRest } from '@/graph/GraphRest';
import { useAuth } from '@/auth/AuthProvider';
import { RequestsService } from '@/features/requests/services/Requests.service';
import { GraphServicesContext } from './useGraphServices';

// ─── Agrega aquí cada servicio nuevo ────────────────────────
// import { UsuariosService } from '@/features/usuarios/services/Usuarios.service';

/* ============================================================
   Configuración de sitios SharePoint
   ============================================================ */
export type SiteConfig = {
  hostname: string;
  sitePath: string;
};

export type SitesConfig = {
  main: SiteConfig;
};

const DEFAULT_CONFIG: SitesConfig = {
  main: {
    hostname: 'estudiodemoda.sharepoint.com',
    sitePath: '/sites/TransformacionDigital/IN/HD',
  },
};

/* ============================================================
   Tipo del contexto — exportado para que useGraphServices.ts
   pueda referenciarlo
   ============================================================ */
export type GraphServices = {
  graph:    GraphRest;
  Requests: RequestsService;
  // Usuarios: UsuariosService;
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
  config?:  Partial<SitesConfig>;
};

export const GraphServicesProvider: React.FC<ProviderProps> = ({ children, config }) => {
  const { getToken } = useAuth();

  const cfg = React.useMemo<SitesConfig>(() => {
    const normPath = (p: string) => (p.startsWith('/') ? p : `/${p}`);
    return {
      main: {
        hostname: config?.main?.hostname ?? DEFAULT_CONFIG.main.hostname,
        sitePath: normPath(config?.main?.sitePath ?? DEFAULT_CONFIG.main.sitePath),
      },
    };
  }, [config]);

  const graph = React.useMemo(() => new GraphRest(getToken), [getToken]);

  const services = React.useMemo<GraphServices>(() => ({
    graph,
    Requests: new RequestsService(graph, cfg.main.hostname, cfg.main.sitePath),
  }), [graph, cfg]);

  return (
    <GraphServicesContext.Provider value={services}>
      {children}
    </GraphServicesContext.Provider>
  );
};