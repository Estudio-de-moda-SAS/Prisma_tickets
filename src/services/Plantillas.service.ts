import { GraphRest } from '../graph/GraphRest';
import type { Plantillas } from '../Models/Plantilla';
import { BaseSharePointListService } from './base.Service';

export class PlantillasService extends BaseSharePointListService<Plantillas> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "SA - Plantillas"
    );
  }

  protected toModel(item: any): Plantillas {
    const f = item?.fields ?? {};

    return {
      Id: String(item?.id ?? ''),
      Title: f.Title,
      CamposPlantilla: f.CamposPlantilla,
    };
  }
}