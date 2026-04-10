import * as React from "react";
import { GraphRest } from "./GraphRest";
import { useAuth } from "../Auth/authContext";
import { TicketsService } from "../services/Tickets.service";
import { LogService } from "../services/Logs.service";
import { UsuariosSPService } from "../services/Usuarios.service";
import { CategoriasService } from "../services/Categorias.service";
import { FranquiciasService } from "../services/Franquicias.service";
import { PlantillasService } from "../services/Plantillas.service";
import { AnsService } from "../services/AnsTbl.service";
import { MailService } from "../services/Mail.service";
import { SubCategoriasService } from "../services/SubCategorias.service";
import { TicketsAttachmentsService } from "../services/TicketsAttachments.service";
import { TicketsBibliotecaAttachmentsService } from "../services/Bibliotecas.service";


/* ================== Tipos de config ================== */
export type SiteConfig = {
  hostname: string;
  sitePath: string; // Debe iniciar con '/'
};

export type UnifiedConfig = {
  hd: SiteConfig;    // sitio principal (HD)
  test: SiteConfig;  // sitio de pruebas (Paz y salvos)
};

/* ================== Tipos del contexto ================== */
export type GraphServices = {
  graph: GraphRest;

  Plantillas: PlantillasService;
  Usuarios: UsuariosSPService;
  Logs: LogService;
  Tickets: TicketsService;
  Categorias: CategoriasService;
  Franquicias: FranquiciasService;
  SubCategorias: SubCategoriasService;
  ANS: AnsService;
  mail: MailService
  tickesAttachments: TicketsAttachmentsService;
  ticketBiblioteca: TicketsBibliotecaAttachmentsService;
};

/* ================== Contexto ================== */
const GraphServicesContext = React.createContext<GraphServices | null>(null);

/* ================== Default config (puedes cambiar paths) ================== */
const DEFAULT_CONFIG: UnifiedConfig = {
  hd: {
    hostname: "estudiodemoda.sharepoint.com",
    sitePath: "/sites/TransformacionDigital/IN/HD",
  },
  test: {
    hostname: "estudiodemoda.sharepoint.com",
    sitePath: "/sites/TransformacionDigital/IN/Test",
  },
};

/* ================== Provider ================== */
type ProviderProps = {
  children: React.ReactNode;
  config?: Partial<UnifiedConfig>;
};

export const GraphServicesProvider: React.FC<ProviderProps> = ({ children, config }) => {
  const { getToken } = useAuth();

  // Mergeo de config
  const cfg: UnifiedConfig = React.useMemo(() => {
    const base = DEFAULT_CONFIG;

    const normPath = (p: string) => (p.startsWith("/") ? p : `/${p}`);

    const hd: SiteConfig = {
      hostname: config?.hd?.hostname ?? base.hd.hostname,
      sitePath: normPath(config?.hd?.sitePath ?? base.hd.sitePath),
    };

    const test: SiteConfig = {
      hostname: config?.test?.hostname ?? base.test.hostname,
      sitePath: normPath(config?.test?.sitePath ?? base.test.sitePath),
    };

    return { hd, test, };
  }, [config]);

  // Cliente Graph
  const graph = React.useMemo(() => new GraphRest(getToken), [getToken]);

  // Instanciar servicios (HD usando cfg.hd, PazYSalvos usando cfg.test)
  const services = React.useMemo<GraphServices>(() => {

    // HD
    const Plantillas           = new PlantillasService(graph,);
    const Usuarios             = new UsuariosSPService(graph,);
    const Logs                 = new LogService(graph);
    const Tickets              = new TicketsService(graph);
    const Categorias           = new CategoriasService(graph,);
    const Franquicias          = new FranquiciasService(graph,);
    const SubCategorias        = new SubCategoriasService(graph,);
    const ANS                  = new AnsService(graph,)
    const mail                 = new MailService(graph)
    const tickesAttachments    = new TicketsAttachmentsService(graph)
    const ticketBiblioteca     = new TicketsBibliotecaAttachmentsService(graph, cfg.hd.hostname, cfg.hd.sitePath, "Tickets SA")

    return {
      graph, Usuarios, Tickets, Logs, Categorias, SubCategorias, Franquicias, Plantillas, ANS, mail, tickesAttachments, ticketBiblioteca

    };
  }, [graph, cfg]);

  return (
    <GraphServicesContext.Provider value={services}>
      {children}
    </GraphServicesContext.Provider>
  );
};

/* ================== Hook de consumo ================== */
export function useGraphServices(): GraphServices {
  const ctx = React.useContext(GraphServicesContext);
  if (!ctx) throw new Error("useGraphServices debe usarse dentro de <GraphServicesProvider>.");
  return ctx;
}
