export type GetAllOpts = {
  filter?: string;    
  orderby?: string;   
  top?: number;        
};

export type PageResult<T> = {
  items: T[];
  nextLink: string | null;
};

export type Worker = {
    id?: string | number,
    displayName: string;
    mail?: string;
    jobTitle?: string;
};

export type UserOption = {
  value: string;      // lo que guardas (recomiendo el correo)
  label: string;      // lo que se muestra
  id?: string;        // opcional (aad id si quieres)
  email?: string;     // opcional: para mostrar/filtrar
  jobTitle?: string;  // opcional: para mostrar/filtrar
  
};

export type Reasignar = {
    IDCandidato: number;            
    Nota: string;
    IDCaso: number;
    IDSolicitante: number
}

export type SPCajerosPOS = {
    Usuario: number;            
    CorreoUsuario: string;
    Cedula: number;
    CO: number
    CorreoTercero: number
    Compañia: number
}

export type DateRange = {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}; //Rango de fechas para filtrar
