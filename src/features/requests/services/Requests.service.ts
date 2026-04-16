import { BaseSharePointListService } from '@/auth/BaseSharePointListService';
import { GraphRest } from '@/graph/GraphRest';
import type {
  Request,
  CrearSolicitudPayload,
  MoverSolicitudPayload,
  KanbanColumna,
  Equipo,
} from '../types';

/* ============================================================
   Shape del item crudo que devuelve Graph/SharePoint
   ============================================================ */
type SPRequestsFields = {
  Title:         string;
  Descripcion:   string;
  Solicitante:   string;
  Resolutor?:    string;
  Equipo?:       string;
  Columna:       string;
  Prioridad:     string;
  Categoria?:    string;
  FechaApertura: string;
  FechaMaxima?:  string;
  Progreso?:     number;
};

type SPItem = {
  id:     string;
  fields: SPRequestsFields;
};

/* ============================================================
   Servicio
   ============================================================ */
export class RequestsService extends BaseSharePointListService<
  Request,
  CrearSolicitudPayload,
  Partial<SPRequestsFields>
> {
  constructor(graph: GraphRest, hostname: string, sitePath: string) {
    super(graph, hostname, sitePath, 'Solicitudes');
  }

  // ── Mapeo SP → modelo interno ──────────────────────────────
  protected toModel(raw: unknown): Request {
    const item = raw as SPItem;
    const f    = item.fields;

    return {
      id:            item.id,
      titulo:        f.Title        ?? '',
      descripcion:   f.Descripcion  ?? '',
      solicitante:   f.Solicitante  ?? '',
      resolutor:     f.Resolutor    ?? null,
      equipo:        (f.Equipo      as Equipo | undefined)    ?? null,
      columna:       (f.Columna     as KanbanColumna)         ?? 'sin_categorizar',
      prioridad:     (f.Prioridad   as Request['prioridad']) ?? 'media',
      categoria:     f.Categoria    ?? null,
      fechaApertura: f.FechaApertura ?? new Date().toISOString(),
      fechaMaxima:   f.FechaMaxima  ?? null,
      progreso:      f.Progreso     ?? 0,
    };
  }

  // ── Crear solicitud (siempre entra en sin_categorizar) ──────
  async crear(payload: CrearSolicitudPayload): Promise<Request> {
    return this.create({
      ...payload,
      columna: payload.columna ?? 'sin_categorizar',
    } as unknown as CrearSolicitudPayload);
  }

  // ── Mover tarjeta entre columnas / asignar equipo ───────────
  async mover({ id, columna, equipo }: MoverSolicitudPayload): Promise<Request> {
    return this.update(id, {
      Columna: columna,
      ...(equipo ? { Equipo: equipo } : {}),
    });
  }

  // ── Obtener todas agrupadas por columna ─────────────────────
  async getByEquipo(equipo: Equipo): Promise<Request[]> {
    return this.getAllPlain({
      filter: `fields/Equipo eq '${this.esc(equipo)}'`,
      orderby: 'fields/FechaApertura desc',
    });
  }

  // ── Sin categorizar (bandeja de entrada global) ─────────────
  async getSinCategorizar(): Promise<Request[]> {
    return this.getAllPlain({
      filter: `fields/Columna eq 'sin_categorizar'`,
      orderby: 'fields/FechaApertura desc',
    });
  }

  // ── Actualizar progreso ─────────────────────────────────────
  async actualizarProgreso(id: string, progreso: number): Promise<Request> {
    return this.update(id, { Progreso: Math.min(100, Math.max(0, progreso)) });
  }
}