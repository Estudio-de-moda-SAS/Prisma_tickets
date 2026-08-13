export type SolviTicket = {
  ticket_solvi_id?: number;
  ticket_solvi_titulo: string;
  ticket_solvi_estado: string | null;
  ticket_solvi_fuente: string | null;
  ticket_solvi_solicitante: string | null;
  ticket_solvi_correo_solicitante: string | null;
  ticket_solvi_resolutor: string | null;
  ticket_solvi_categoria: string | null;
  ticket_solvi_subcategoria: string | null;
  ticket_solvi_ans: string | null;
  ticket_solvi_fechaapertura: Date | null;
  ticket_solvi_fechamaxima: string | null;
  FechaCierreReal: string | null;
  ticket_solvi_correo_resolutor: string | null;
  ticket_solvi_descripcion: string;
  ticket_solvi_articulo: string | null;
};
