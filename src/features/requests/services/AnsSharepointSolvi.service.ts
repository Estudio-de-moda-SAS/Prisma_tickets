import { GraphRest } from '@/graph/GraphRest';
import type { GetAllOpts } from './TecnicosSharepointSolvi.service';

export type AnsSP = {
  Id?: string;
  Id_Categoria: string;
  Id_Subcategoria: string;
  Id_Articulo: string;
  ANS: number;
};

export class AnsSPService {
  private graph!: GraphRest;
  private hostname!: string;
  private sitePath!: string;
  private listName!: string;

  private siteId?: string;
  private listId?: string;

  constructor(
    graph: GraphRest,
    hostname = 'estudiodemoda.sharepoint.com',
    sitePath = '/sites/TransformacionDigital/IN/HD',
    listName = 'ANS',
  ) {
    this.graph = graph;
    this.hostname = hostname;
    this.sitePath = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
    this.listName = listName;
  }

  private esc(s: string) { return String(s).replace(/'/g, "''"); }

  private get cacheKey() { return `sp:${this.hostname}${this.sitePath}:${this.listName}`; }

  private loadCache() {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (raw) {
        const { siteId, listId } = JSON.parse(raw);
        this.siteId = siteId || this.siteId;
        this.listId = listId || this.listId;
      }
    } catch {}
  }

  private saveCache() {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({ siteId: this.siteId, listId: this.listId }));
    } catch {}
  }

  private async ensureIds() {
    if (!this.siteId || !this.listId) this.loadCache();

    if (!this.siteId) {
      const site = await this.graph.get<any>(`/sites/${this.hostname}:${this.sitePath}`);
      this.siteId = site?.id;
      if (!this.siteId) throw new Error('No se pudo resolver siteId');
      this.saveCache();
    }

    if (!this.listId) {
      const lists = await this.graph.get<any>(
        `/sites/${this.siteId}/lists?$filter=displayName eq '${this.esc(this.listName)}'`,
      );
      const list = lists?.value?.[0];
      if (!list?.id) throw new Error(`Lista no encontrada: ${this.listName}`);
      this.listId = list.id;
      this.saveCache();
    }
  }

  private toModel(item: any): AnsSP {
    const f = item?.fields ?? {};
    return {
      Id: String(item?.id ?? ''),
      Id_Categoria: f.Id_Categoria,
      Id_Subcategoria: f.Id_Subcategoria,
      Id_Articulo: f.Id_Articulo,
      ANS: Number(f.Title),
    };
  }

  async getAll(opts?: GetAllOpts): Promise<AnsSP[]> {
    await this.ensureIds();

    const qs = new URLSearchParams();
    qs.set('$expand', 'fields');
    if (opts?.orderby) qs.set('$orderby', opts.orderby);
    if (opts?.top != null) qs.set('$top', String(opts.top));
    if (opts?.filter) qs.set('$filter', opts.filter);

    const url = `/sites/${encodeURIComponent(this.siteId!)}/lists/${encodeURIComponent(this.listId!)}/items?${qs.toString()}`;
    const res = await this.graph.get<any>(url);
    return (res.value ?? []).map((x: any) => this.toModel(x));
  }

  /** Busca la fila de ANS que matchea la combinación exacta categoría/subcategoría/artículo. */
  async getByCombinacion(categoriaId: string, subcategoriaId: string, articuloId: string): Promise<AnsSP[]> {
    return this.getAll({
      filter:
        `fields/id_categoria eq '${this.esc(categoriaId)}' and ` +
        `fields/id_subcategoria eq '${this.esc(subcategoriaId)}' and ` +
        `fields/id_articulo eq '${this.esc(articuloId)}'`,
    });
  }
}
