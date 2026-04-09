import { GraphRest } from '../graph/GraphRest';
import type { SubCategoria } from '../Models/Categorias';
import { BaseSharePointListService } from './base.Service';

export class SubCategoriasService extends BaseSharePointListService<SubCategoria> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - Subcategorias"
    );
  }

  protected toModel(item: any): SubCategoria {
    const f = item?.fields ?? {};

    return {
      ID: String(item?.id ?? ''),
      Title: f.Title,
      Id_categoria: f.Id_categoria
    };
  }
}

