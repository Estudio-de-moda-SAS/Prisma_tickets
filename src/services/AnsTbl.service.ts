import { GraphRest } from '../graph/GraphRest';
import type { ANS, } from '../Models/Categorias';
import { BaseSharePointListService } from './base.Service';

export class AnsService extends BaseSharePointListService<ANS> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - ANS"
    );
  }

  protected toModel(item: any): ANS {
    const f = item?.fields ?? {};

  return {
      Id: String(item?.id ?? ''),
      Title: f.Title,
      CategoriaId: f.CategoriaId,
      ArticuloId: f.ArticuloId,
      SubCategoriaId: f.SubCategoriaId,
    };
  }
}