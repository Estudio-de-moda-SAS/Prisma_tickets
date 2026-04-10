

export type FlowToUser = {
  recipient: string;            
  message: string;
  title?: string;
  mail: boolean
};


export type AdjuntoPayload = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  contentBase: string; // o contentBase64 si prefieres ese nombre
};

export type FlowToReasign = {
  IDCandidato: number;            
  Nota: string;
  IDCaso: number;
  IDSolicitante: number;
};

export type MasiveFlow = {
  file: {
    name: string
    contentType: string
    contentBase64: string
  };
}
