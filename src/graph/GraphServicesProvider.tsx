import * as React from 'react';
import { GraphRest } from '@/graph/GraphRest';
import { useAuth } from '@/auth/AuthProvider';
import { RequestsService } from '@/features/requests/services/Requests.service';

// ─── Agrega aquí cada servicio nuevo ────────────────────────
// import { UsuariosService } from '@/features/usuarios/services/Usuarios.service';
// ─────────────────────────────────────────────────────────────

/* ============================================================
   Configuración de sitios SharePoint
   ============================================================ */
export type SiteConfig = {
  hostname: string;
  sitePath: string; // debe empezar con '/'
};

export type SitesConfig = {
  /** Sitio principal de producción */
  main: SiteConfig;
};

const DEFAULT_CONFIG: SitesConfig = {
  main: {
    hostname: 'estudiodemoda.sharepoint.com',
    sitePath: '/sites/TransformacionDigital/IN/HD',
  },
};

/* ============================================================
   Tipo del contexto — agrega un campo por cada servicio nuevo
   ============================================================ */
export type GraphServices = {
  graph:    GraphRest;
  Requests: RequestsService;
  // Usuarios: UsuariosService;
};

/* ============================================================
   Contexto
   ============================================================ */
const GraphServicesContext = React.createContext<GraphServices | null>(null);

/* ============================================================
   Provider
   ============================================================ */
type ProviderProps = {
  children: React.ReactNode;
  /** Sobreescribe parcialmente la config de sitios en tiempo de ejecución */
  config?: Partial<SitesConfig>;
};

export const GraphServicesProvider: React.FC<ProviderProps> = ({
  children,
  config,
}) => {
  const { getToken } = useAuth();

  /* Merge de config — solo se recalcula si cambian las props */
  const cfg = React.useMemo<SitesConfig>(() => {
    const normPath = (p: string) => (p.startsWith('/') ? p : `/${p}`);

    return {
      main: {
        hostname: config?.main?.hostname ?? DEFAULT_CONFIG.main.hostname,
        sitePath: normPath(
          config?.main?.sitePath ?? DEFAULT_CONFIG.main.sitePath,
        ),
      },
    };
  }, [config]);

  /* Cliente Graph — se recrea solo si cambia getToken */
  const graph = React.useMemo(() => new GraphRest(getToken), [getToken]);

  const services = React.useMemo<GraphServices>(() => ({
    graph,
    Requests: new RequestsService(
      graph,
      cfg.main.hostname,
      cfg.main.sitePath,
    ),
  }), [graph, cfg]);

  return (
    <GraphServicesContext.Provider value={services}>
      {children}
    </GraphServicesContext.Provider>
  );
};

/* ============================================================
   Hook de consumo
   ============================================================ */
export function useGraphServices(): GraphServices {
  const ctx = React.useContext(GraphServicesContext);
  if (!ctx) {
    throw new Error(
      'useGraphServices debe usarse dentro de <GraphServicesProvider>.',
    );
  }
  return ctx;
}
