import { GraphRest } from '../graph/GraphRest';
import type { Log } from '../Models/Log';
import { BaseSharePointListService } from './base.Service';

export class LogService extends BaseSharePointListService<Log> {
  constructor(graph: GraphRest) {
    super(
      graph,
      "estudiodemoda.sharepoint.com",
      "/sites/TransformacionDigital/IN/Test",
      "Log"
    );
  }

  protected toModel(item: any): Log {
    const f = item?.fields ?? {};

  return {
      Id: String(item?.id ?? ''),
      Title: f.Title,
      Descripcion: f.Descripcion,
      Tipo_de_accion: f.Tipo_de_accion,
      Actor: f.Actor,
      CorreoActor: f.CorreoActor,
      Created : f.Created
    };
  }
}