import type { Ticket } from "../Models/Tickets";
import type { GraphRest } from "../graph/GraphRest";
import { BaseSharePointListService } from "./base.Service";

export class TicketsService extends BaseSharePointListService<Ticket> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - Tickets"
    );
  }

  protected toModel(item: any): Ticket {
    const f = item?.fields ?? {};

    return {
      ID: String(f.ID ?? f.Id ?? f.id ?? item?.id ?? ""),
      IdCasoPadre: f.IdCasoPadre ?? null,
      Title: f.Title ?? "",

      FechaApertura: f.FechaApertura ?? "",
      TiempoSolucion: f.TiempoSolucion ?? "",

      Fuente: f.Fuente ?? "",
      Descripcion: f.Descripcion ?? "",
      Categoria: f.Categoria ?? "",
      SubCategoria: f.Subcategoria ?? f.SubCategoria ?? "",
      Estadodesolicitud: f.Estadodesolicitud ?? "",
      ANS: f.ANS ?? "",

      Nombreresolutor: f.Nombreresolutor ?? "",
      IdResolutor: f.IdResolutor ?? "",
      Correoresolutor: f.Correoresolutor ?? "",

      Solicitante: f.Solicitante ?? "",
      CorreoSolicitante: f.CorreoSolicitante ?? "",

      Observador: f.Observador ?? "",
      CorreoObservador: f.CorreoObservador ?? "",
      id_Categoria: f.id_Categoria ?? "",
      Id_Subcategoria: f.Id_Subcategoria ?? "",
    };
  }
}