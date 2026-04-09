import type { UserOption } from "./Commons";

export type Ticket = {
  ID?: string;
  Nombreresolutor?: string;
  IdResolutor?: string;
  Solicitante?: string;
  Title?: string; //Asunto
  FechaApertura?: string | null; // "dd/mm/yyyy hh:mm"
  TiempoSolucion?: string | null;   // "dd/mm/yyyy hh:mm"
  Estadodesolicitud?: string;
  Observador?: string;
  Descripcion?: string;
  Categoria?: string;
  SubCategoria?: string;
  Fuente?: string;
  Correoresolutor?: string;
  CorreoSolicitante?: string;
  IdCasoPadre?: string;
  ANS?: string;
  CorreoObservador?: string;
  Id_Subcategoria: string;
  id_Categoria: string
};

export type FormRecategorizarState = {
  categoria: string;
  subcategoria: string;
  articulo: string;
};

export type FormReasignarState = {
    resolutor: UserOption | null;
    Nota: string
}

export type FormObservadorState = {
    observador: UserOption | null;
}

export type FormObservadorErrors = Partial<Record<keyof FormObservadorState, string>>

export type FormReasignarErrors = Partial<Record<keyof FormReasignarState, string>>

export type ticketOption = {
  value: string;      //Id Ticket
  label: string;      //Nombre del ticket
};

export type AttachmentLite = {
  id: string;                     // id opaco del adjunto (suele ser el nombre de archivo, pero trátalo como opaco)
  name: string;                   // nombre del archivo
  size: number;                   // bytes
  contentType?: string;
  lastModifiedDateTime?: string;
  downloadPath: string;     
};

// Para filtros locales
export type SortDir = 'asc' | 'desc';
export type SortField = 'id' | 'FechaApertura' | 'TiempoSolucion' | 'Title' | 'resolutor';

export type TicketErrors = Partial<Record<keyof Ticket, string>>;

export type RelacionadorState = {
  TicketRelacionar?: ticketOption | null;
  archivo?: File | null
};

export type TicketsAttachments = {
  Id?: string;
  Title: string;
  IdTicket: string;
  IdAttachment: string;
}