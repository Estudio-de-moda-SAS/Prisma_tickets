import type { Ticket } from "../../../Models/Tickets";
import type { TZDate } from "@date-fns/tz";
import { toGraphDateTime } from "../../../utils/Date";
import { ESTADO_EN_ATENCION } from "./ticketConstants";

export function buildNuevoTicketPayload(state: Ticket, ans: string, apertura: Date, solucion: TZDate | Date | null): Ticket {
  return {
    Title: state.Title,
    Descripcion: state.Descripcion,
    FechaApertura: toGraphDateTime(apertura),
    TiempoSolucion: toGraphDateTime(solucion as any),
    Fuente: state.Fuente,
    Categoria: state.Categoria,
    SubCategoria: state.SubCategoria,
    Nombreresolutor: state.Nombreresolutor,
    Correoresolutor: state.Correoresolutor,
    Solicitante: state.Solicitante,
    CorreoSolicitante: state.CorreoSolicitante,
    Estadodesolicitud: ESTADO_EN_ATENCION,
    ANS: ans,
    id_Categoria: state.id_Categoria,
    Id_Subcategoria: state.Id_Subcategoria,
  };
}

export function buildNuevoUsuarioTicketPayload(
  params: {
    ans: string; 
    motivo: string; 
    descripcion: string; 
    resolutor?: { Title?: string; Correo?: string; Id?: string }; 
    solicitante?: { name?: string; email?: string };
    solucion: TZDate | Date | null}
): Ticket {
  return {
    Title: params.motivo,
    Descripcion: params.descripcion,
    FechaApertura: toGraphDateTime(new Date()),
    TiempoSolucion: toGraphDateTime(params.solucion as any),
    Nombreresolutor: params.resolutor?.Title,
    Correoresolutor: params.resolutor?.Correo,
    IdResolutor: params.resolutor?.Id,
    Solicitante: params.solicitante?.name,
    CorreoSolicitante: params.solicitante?.email,
    Estadodesolicitud: ESTADO_EN_ATENCION,
    Fuente: "Aplicación",
    id_Categoria: "",
    Id_Subcategoria: "",
  };
}