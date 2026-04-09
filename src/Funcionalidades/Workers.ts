// src/hooks/useWorkers.tsx
import * as React from 'react';
import { GraphRest } from '../graph/GraphRest';
import type { UserOption, Worker } from '../Models/Commons';
import { useAuth } from '../Auth/authContext';

type Options = {
  onlyEnabled?: boolean;
  previewLimit?: number;
  spListService?: { getAll: (opts?: any) => Promise<any[]> };
  spOrderBy?: string;
  spTop?: number;
  spFilter?: string;
};

const norm = (s?: string) => {
  const base = (s ?? '').normalize('NFD').toLowerCase().trim();
  try {
    return base.replace(/\p{Diacritic}/gu, '');
  } catch {
    // Fallback: elimina marcas combinantes (Mn)
    return base.replace(/[\u0300-\u036f]/g, '');
  }
};

type CacheKey = string;
const cache: Record<CacheKey, { data: Worker[] | null; promise: Promise<Worker[]> | null }> = {};

function cacheKey(opts: Options) {
  return JSON.stringify({
    onlyEnabled: opts.onlyEnabled ?? true,
    previewLimit: opts.previewLimit ?? null,
    hasSP: !!opts.spListService,
    spOrderBy: opts.spOrderBy ?? '',
    spTop: opts.spTop ?? 0,
    spFilter: opts.spFilter ?? '',
  });
}

function mapGraphUser(u: any, i: number): Worker {
  const id = u.id ?? u.userPrincipalName ?? u.mail ?? i;
  return {
    id: String(id),
    displayName: String(u.displayName ?? '—'),
    mail: String(u.mail ?? u.userPrincipalName ?? ''),
    jobTitle: String(u.jobTitle ?? ''),
  };
}

function mapSPRowToWorker(r: any): Worker {
  const f = r?.fields ?? r ?? {};
  return {
    id: String(r.ID ?? r.Id ?? f.ID ?? f.Id ?? ''),
    displayName: String(
      f.Nombre ?? f.DisplayName ?? f.Title ?? r.Nombre ?? r.DisplayName ?? r.Title ?? '—'
    ),
    mail: String(f.Correo ?? f.Email ?? r.Correo ?? r.Email ?? ''),
    jobTitle: String(f.Cargo ?? r.Cargo ?? ''),
  };
}

async function fetchUsersFromGraph(graph: GraphRest, opts: Options): Promise<Worker[]> {
  const onlyEnabled = opts.onlyEnabled ?? true;
  console.log(onlyEnabled)

  const select = encodeURIComponent(
    'id,displayName,mail,userPrincipalName,jobTitle,accountEnabled'
  );
  const top = 999;
  const filters: string[] = [];
  //if (onlyEnabled) filters.push('accountEnabled eq true');

  let url =
    `/users?$select=${select}&$top=${top}` +
    (filters.length ? `&$filter=${encodeURIComponent(filters.join(' and '))}` : '');
  const acc: any[] = [];

  while (url) {
    const page = await graph.get<any>(url);
    const rows: any[] = Array.isArray(page?.value) ? page.value : [];
    acc.push(...rows);
    const next = page?.['@odata.nextLink'] as string | undefined;
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : '';
  }

  // Dedup por email si existe, si no por id
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const u of acc) {
    const email = String(u.mail || u.userPrincipalName || '').trim().toLowerCase();
    const id = String(u.id ?? '');
    const key = email || id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(u);
  }
  const mapped = unique.map(mapGraphUser);
  return mapped
}

async function fetchUsersFromSharePoint(opts: Options): Promise<Worker[]> {
  if (!opts.spListService) return [];
  const items = await opts.spListService.getAll({
    orderby: opts.spOrderBy ?? 'fields/Title asc',
    top: opts.spTop ?? 5000,
    ...(opts.spFilter ? { filter: opts.spFilter } : {}),
  });

  const mapped = (items ?? []).map(mapSPRowToWorker);
  // Sin filtro de dominio: devolvemos todos los válidos (con o sin email)
  return mapped.filter((w) => !!(w.displayName || w.mail || w.id));
}

export function useWorkers(options: Options = {}) {
  const { ready, getToken } = useAuth();
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [workersOptions, setWorkersOptions] = React.useState<UserOption[]>([]);
  const [loadingWorkers, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const key = cacheKey(options);

  // === helpers ===
  const mapWorkersToOptions = React.useCallback((list: Worker[]): UserOption[] => {
    return (list ?? [])
      .map((u) => ({
        value: (u.mail || String(u.id) || '').trim(),
        label: u.displayName || '-',
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const load = React.useCallback(async () => {
    if (!ready) return;

    setLoading(true);
    setError(null);

    try {
      const previewLimit =
        typeof options.previewLimit === "number" ? options.previewLimit : undefined;

      // ---------- 1) RAMA: DATOS EN CACHE ----------
      if (cache[key]?.data) {
        const cached = cache[key]!.data!;

        const sliced =
          typeof previewLimit === "number" ? cached.slice(0, previewLimit) : cached;

        setWorkers(sliced);
        setWorkersOptions(mapWorkersToOptions(sliced));
        return;
      }

      // Si no existe entrada en cache, la creamos
      if (!cache[key]) {
        cache[key] = { data: null, promise: null };
      }

      // ---------- 2) SOLO CREAMOS LA PROMISE UNA VEZ ----------
      if (!cache[key]!.promise) {
        const graph = new GraphRest(getToken);

        cache[key]!.promise = (async () => {
          const [fromGraph, fromSP] = await Promise.all([
            fetchUsersFromGraph(graph, options),
            fetchUsersFromSharePoint(options),
          ]);

          // ---------- 3) MERGE + DEDUP ----------
          const map = new Map<string, Worker>();

          const put = (w: Worker) => {
            const email = (w.mail ?? "").trim().toLowerCase();
            const id = String(w.id ?? "").trim();
            const name = (w.displayName ?? "").trim();

            // key primaria: mail > id > displayName
            const k = email || id || name;

            if (!k) {
              // opcional: log para debug
              console.warn("Worker sin mail, id ni nombre, descartado:", w);
              return;
            }

            if (!map.has(k)) {
              map.set(k, w);
            }
          };

          for (const g of fromGraph) put(g);
          for (const s of fromSP) put(s);

          const merged = Array.from(map.values());

          // Orden alfabético por nombre
          merged.sort((a, b) =>
            (a.displayName ?? "").localeCompare(b.displayName ?? "")
          );

          // Guardamos en cache
          cache[key]!.data = merged;
          return merged;
        })().finally(() => {
          cache[key]!.promise = null;
        });
      }

      // ---------- 4) ESPERAMOS LA PROMISE (CACHEADA) ----------
      const data = await cache[key]!.promise!;

      const sliced =
        typeof previewLimit === "number" ? data.slice(0, previewLimit) : data;

      setWorkers(sliced);
      setWorkersOptions(mapWorkersToOptions(sliced));
    } catch (e: any) {
      console.error("Error cargando usuarios:", e);
      setWorkers([]);
      setWorkersOptions([]);
      setError(e?.message ?? "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }, [ready, getToken, key, options.previewLimit, mapWorkersToOptions]);


  // Efecto después de declarar `load`
  React.useEffect(() => {
    load();
  }, [load, key]);

  const filter = React.useCallback(
    (term: string) => {
      if (!term) return workers;
      const q = norm(term);
      return workers.filter((w) =>
        norm(`${w.displayName} ${w.jobTitle ?? ''} ${w.mail ?? ''}`).includes(q)
      );
    },
    [workers]
  );

  const refresh = React.useCallback(async () => {
    if (!ready) return;
    cache[key] = { data: null, promise: null };
    await load();
  }, [ready, load, key]);

  return { workers, workersOptions, loadingWorkers, error, filter, refresh };
}

