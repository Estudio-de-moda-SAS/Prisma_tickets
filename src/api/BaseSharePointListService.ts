import { GraphRest } from '@/graph/GraphRest';
import type { GetAllOpts, PageResult } from '@/types/commons';

export abstract class BaseSharePointListService<
  TModel,
  TCreate = Omit<TModel, 'id'>,
  TUpdate = Partial<Omit<TModel, 'id'>>,
> {
  protected graph: GraphRest;
  protected hostname: string;
  protected sitePath: string;
  protected listName: string;

  private siteId?: string;
  private listId?: string;

  constructor(
    graph: GraphRest,
    hostname: string,
    sitePath: string,
    listName: string,
  ) {
    this.graph = graph;
    this.hostname = hostname;
    this.sitePath = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
    this.listName = listName;
  }

  protected abstract toModel(item: unknown): TModel;

  protected esc(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  private get cacheKey(): string {
    return `sp:${this.hostname}${this.sitePath}:${this.listName}`;
  }

  private loadCache(): void {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { siteId?: string; listId?: string };
      this.siteId = parsed?.siteId ?? this.siteId;
      this.listId = parsed?.listId ?? this.listId;
    } catch { /* ignore */ }
  }

  private saveCache(): void {
    try {
      localStorage.setItem(
        this.cacheKey,
        JSON.stringify({ siteId: this.siteId, listId: this.listId }),
      );
    } catch { /* ignore */ }
  }

  protected async ensureIds(): Promise<void> {
    if (!this.siteId || !this.listId) this.loadCache();

    if (!this.siteId) {
      const site = await this.graph.get<{ id: string }>(
        `/sites/${this.hostname}:${this.sitePath}`,
      );
      this.siteId = site?.id;
      if (!this.siteId) throw new Error('No se pudo resolver siteId');
      this.saveCache();
    }

    if (!this.listId) {
      const lists = await this.graph.get<{ value: { id: string }[] }>(
        `/sites/${this.siteId}/lists?$filter=displayName eq '${this.esc(this.listName)}'`,
      );
      const list = lists?.value?.[0];
      if (!list?.id) throw new Error(`Lista no encontrada: ${this.listName}`);
      this.listId = list.id;
      this.saveCache();
    }
  }

  async create(record: TCreate): Promise<TModel> {
    await this.ensureIds();
    const res = await this.graph.post<unknown>(
      `/sites/${this.siteId}/lists/${this.listId}/items`,
      { fields: record },
    );
    return this.toModel(res);
  }

  async update(id: string, changed: TUpdate): Promise<TModel> {
    await this.ensureIds();
    await this.graph.patch<unknown>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}/fields`,
      changed,
    );
    const res = await this.graph.get<unknown>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}?$expand=fields`,
    );
    return this.toModel(res);
  }

  async delete(id: string): Promise<void> {
    await this.ensureIds();
    await this.graph.delete(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}`,
    );
  }

  async get(id: string): Promise<TModel> {
    await this.ensureIds();
    const res = await this.graph.get<unknown>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}?$expand=fields`,
    );
    return this.toModel(res);
  }

  async getAll(opts?: GetAllOpts): Promise<PageResult<TModel>> {
    await this.ensureIds();

    const qs = new URLSearchParams({ $expand: 'fields' });
    if (opts?.filter) qs.set('$filter', opts.filter);
    if (opts?.orderby) qs.set('$orderby', opts.orderby);
    if (opts?.top != null) qs.set('$top', String(opts.top));

    return this.fetchPage(
      `/sites/${this.siteId}/lists/${this.listId}/items?${qs.toString()}`,
    );
  }

  async getByNextLink(nextLink: string): Promise<PageResult<TModel>> {
    return this.fetchPage(nextLink, true);
  }

  protected async fetchPage(
    url: string,
    isAbsolute = false,
  ): Promise<PageResult<TModel>> {
    const res = isAbsolute
      ? await this.graph.getAbsolute<{ value: unknown[]; '@odata.nextLink'?: string }>(url)
      : await this.graph.get<{ value: unknown[]; '@odata.nextLink'?: string }>(url);

    const raw = Array.isArray(res?.value) ? res.value : [];
    return {
      items: raw.map((item) => this.toModel(item)),
      nextLink: res?.['@odata.nextLink'] ? String(res['@odata.nextLink']) : null,
    };
  }

  async getAllPlain(opts?: GetAllOpts): Promise<TModel[]> {
    await this.ensureIds();

    const normalizeToken = (v: string) =>
      v.replace(/\bID\b/g, 'id').replace(/(^|[^/])\bTitle\b/g, '$1fields/Title');

    const qs = new URLSearchParams();
    qs.set('$expand', 'fields');
    qs.set('$select', 'id,webUrl');
    if (opts?.orderby) qs.set('$orderby', normalizeToken(opts.orderby));
    if (opts?.top != null) qs.set('$top', String(opts.top));
    if (opts?.filter) qs.set('$filter', normalizeToken(opts.filter));

    const url = `/sites/${encodeURIComponent(this.siteId!)}/lists/${encodeURIComponent(this.listId!)}/items?${qs.toString().replace(/\+/g, '%20')}`;

    try {
      const res = await this.graph.get<{ value: unknown[] }>(url);
      return (res?.value ?? []).map((item) => this.toModel(item));
    } catch (e: unknown) {
      const code = (e as { error?: { code?: string }; code?: string })?.error?.code
        ?? (e as { code?: string })?.code;

      if (code === 'itemNotFound' && opts?.filter) {
        const qs2 = new URLSearchParams(qs);
        qs2.delete('$filter');
        const url2 = `/sites/${encodeURIComponent(this.siteId!)}/lists/${encodeURIComponent(this.listId!)}/items?${qs2.toString()}`;
        const res2 = await this.graph.get<{ value: unknown[] }>(url2);
        return (res2?.value ?? []).map((item) => this.toModel(item));
      }

      throw e;
    }
  }
}
