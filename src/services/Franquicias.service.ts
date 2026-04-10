import { GraphRest } from '../graph/GraphRest';
import type { Franquicias } from '../Models/Usuarios';
import { BaseSharePointListService } from './base.Service';
export class FranquiciasService extends BaseSharePointListService<Franquicias> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - Tickets"
    );
  }

  protected toModel(item: any): Franquicias {
    const f = item?.fields ?? {};

    return {
      Id: String(item?.id ?? ''),
      Title: f.Title, 
      Ciudad: f.Ciudad,
      Correo: f.Correo,
      Direccion: f.Direccion,
      Jefe_x0020_de_x0020_zona: f.Jefe_x0020_de_x0020_zona,
      Celular: f.Celular
    };
  }
}