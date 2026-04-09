export type UsuariosSP = {
    Title: string; // Nombre completo
    Correo: string;
    Id?: string;
    Rol: string;
    Numerodecasos?: number;
    Disponible?: string;
    _x0052_ol2?: string; // Rol2
};

export type UserMe = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string | null;
  userPrincipalName?: string;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  businessPhones?: string[]; 
  mobilePhone?: string | null;
};

export type FormNewUserErrors = Partial<Record<keyof UsuariosSP, string>>;

export type User = {
  displayName?: string;
  mail?: string;
  jobTitle?: string;
} | null;

export type Franquicias = {
    Id?: string;
    Title: string; //Nombre de la franquicia
    Ciudad: string;
    Correo: string;
    Direccion: string;
    Jefe_x0020_de_x0020_zona: string; 
    Celular: string;
};

  export type FormFranquinciasError = Partial<Record<keyof Franquicias, string>>;