import { GraphRest } from "../graph/GraphRest";
import type { GetAllOpts, PageResult } from "../Models/Commons";

export abstract class BaseSharePointListService<TModel, TCreate = Omit<TModel, "ID">, TUpdate = Partial<Omit<TModel, "ID">>> {
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
    listName: string
  ) {
    this.graph = graph;
    this.hostname = hostname;
    this.sitePath = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;
    this.listName = listName;
  }

  protected abstract toModel(item: any): TModel;

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

      const parsed = JSON.parse(raw);
      this.siteId = parsed?.siteId || this.siteId;
      this.listId = parsed?.listId || this.listId;
    } catch {
      // ignore
    }
  }

  private saveCache(): void {
    try {
      localStorage.setItem(
        this.cacheKey,
        JSON.stringify({
          siteId: this.siteId,
          listId: this.listId,
        })
      );
    } catch {
      // ignore
    }
  }

  protected async ensureIds(): Promise<void> {
    if (!this.siteId || !this.listId) {
      this.loadCache();
    }

    if (!this.siteId) {
      const site = await this.graph.get<any>(`/sites/${this.hostname}:${this.sitePath}`);
      this.siteId = site?.id;
      if (!this.siteId) {
        throw new Error("No se pudo resolver siteId");
      }
      this.saveCache();
    }

    if (!this.listId) {
      const lists = await this.graph.get<any>(
        `/sites/${this.siteId}/lists?$filter=displayName eq '${this.esc(this.listName)}'`
      );
      const list = lists?.value?.[0];

      if (!list?.id) {
        throw new Error(`Lista no encontrada: ${this.listName}`);
      }

      this.listId = list.id;
      this.saveCache();
    }
  }

  async create(record: TCreate): Promise<TModel> {
    await this.ensureIds();

    const res = await this.graph.post<any>(
      `/sites/${this.siteId}/lists/${this.listId}/items`,
      { fields: record }
    );

    return this.toModel(res);
  }

  async update(id: string, changed: TUpdate): Promise<TModel> {
    await this.ensureIds();

    await this.graph.patch<any>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}/fields`,
      changed
    );

    const res = await this.graph.get<any>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}?$expand=fields`
    );

    return this.toModel(res);
  }

  async delete(id: string): Promise<void> {
    await this.ensureIds();
    await this.graph.delete(`/sites/${this.siteId}/lists/${this.listId}/items/${id}`);
  }

  async get(id: string): Promise<TModel> {
    await this.ensureIds();

    const res = await this.graph.get<any>(
      `/sites/${this.siteId}/lists/${this.listId}/items/${id}?$expand=fields`
    );

    return this.toModel(res);
  }

  async getAll(opts?: GetAllOpts): Promise<PageResult<TModel>> {
    await this.ensureIds();

    const qs = new URLSearchParams({ $expand: "fields" });

    if (opts?.filter) qs.set("$filter", opts.filter);
    if (opts?.orderby) qs.set("$orderby", opts.orderby);
    if (opts?.top != null) qs.set("$top", String(opts.top));

    const url = `/sites/${this.siteId}/lists/${this.listId}/items?${qs.toString()}`;
    return this.fetchPage(url);
  }

  async getByNextLink(nextLink: string): Promise<PageResult<TModel>> {
    return this.fetchPage(nextLink, true);
  }

  protected async fetchPage(url: string, isAbsolute = false): Promise<PageResult<TModel>> {
    const res = isAbsolute
      ? await this.graph.getAbsolute<any>(url)
      : await this.graph.get<any>(url);

    const raw = Array.isArray(res?.value) ? res.value : [];
    const items = raw.map((item: any) => this.toModel(item));
    const nextLink = res?.["@odata.nextLink"] ? String(res["@odata.nextLink"]) : null;

    return { items, nextLink };
  }

  async getAllPlain(opts?: GetAllOpts): Promise<TModel[]> {
    await this.ensureIds();

    const normalizeFieldTokens = (value: string): string =>
      value
        .replace(/\bID\b/g, "id")
        .replace(/(^|[^/])\bTitle\b/g, "$1fields/Title");

    const escapeODataLiteral = (value: string): string => value.replace(/'/g, "''");

    const normalizeFilter = (raw: string): string => {
      let out = normalizeFieldTokens(raw.trim());
      out = out.replace(/'(.*?)'/g, (_match, p1) => `'${escapeODataLiteral(p1)}'`);
      return out;
    };

    const normalizeOrderby = (raw: string): string => normalizeFieldTokens(raw.trim());

    const qs = new URLSearchParams();
    qs.set("$expand", "fields");
    qs.set("$select", "id,webUrl");

    if (opts?.orderby) qs.set("$orderby", normalizeOrderby(opts.orderby));
    if (opts?.top != null) qs.set("$top", String(opts.top));
    if (opts?.filter) qs.set("$filter", normalizeFilter(String(opts.filter)));

    const query = qs.toString().replace(/\+/g, "%20");

    const url = `/sites/${encodeURIComponent(this.siteId!)}/lists/${encodeURIComponent(this.listId!)}/items?${query}`;

    try {
      const res = await this.graph.get<any>(url);
      return (res?.value ?? []).map((item: any) => this.toModel(item));
    } catch (e: any) {
      const code = e?.error?.code ?? e?.code;

      if (code === "itemNotFound" && opts?.filter) {
        const qs2 = new URLSearchParams(qs);
        qs2.delete("$filter");

        const url2 = `/sites/${encodeURIComponent(this.siteId!)}/lists/${encodeURIComponent(this.listId!)}/items?${qs2.toString()}`;
        const res2 = await this.graph.get<any>(url2);

        return (res2?.value ?? []).map((item: any) => this.toModel(item));
      }

      throw e;
    }
  }
}