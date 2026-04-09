import { GraphRest } from '../graph/GraphRest';
import type { Categoria } from '../Models/Categorias';
import { BaseSharePointListService } from './base.Service';

export class CategoriasService extends BaseSharePointListService<Categoria> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "Log"
    );
  }

  protected toModel(item: any): Categoria {
    const f = item?.fields ?? {};

  return {
      ID: String(item?.id ?? ''),
      Title: f.Title,
    };
  }
}