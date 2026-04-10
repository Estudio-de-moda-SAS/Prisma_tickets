// src/utils/Commons.ts
import type { GraphRest } from "../graph/GraphRest";

export type EnsureIdsResult = { siteId: string; listId: string };

export const esc = (s: string) => String(s).replace(/'/g, "''");

/** Lee cache (si existe) y lo devuelve */
function loadCache(
  hostname: string,
  sitePath: string,
  listName: string
): Partial<EnsureIdsResult> {
  try {
    const k = `sp:${hostname}${sitePath}:${listName}`;
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw) as Partial<EnsureIdsResult>;
  } catch {}
  return {};
}

/** Persiste en cache si ambos IDs existen */
function saveCache(
  hostname: string,
  sitePath: string,
  listName: string,
  siteId?: string,
  listId?: string
) {
  try {
    if (!siteId || !listId) return;
    const k = `sp:${hostname}${sitePath}:${listName}`;
    localStorage.setItem(k, JSON.stringify({ siteId, listId }));
  } catch {}
}

export async function ensureIds(
  siteId: string | undefined,
  listId: string | undefined,
  graph: GraphRest,
  hostname: string,
  sitePath: string,   // p.ej. "/sites/TransformacionDigital/IN/HD"
  listName: string    // p.ej. "Tickets"
): Promise<EnsureIdsResult> {
  // normaliza sitePath
  const sp = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;

  // 1) intenta cache
  if (!siteId || !listId) {
    const cached = loadCache(hostname, sp, listName);
    siteId = cached.siteId ?? siteId;
    listId = cached.listId ?? listId;
  }

  // 2) resuelve siteId si falta
  if (!siteId) {
    // OJO: sin colon al final
    const site = await graph.get<any>(`/sites/${hostname}:${sp}`);
    siteId = site?.id;
    if (!siteId) throw new Error("No se pudo resolver siteId");
    saveCache(hostname, sp, listName, siteId, listId);
  }

  // 3) resuelve listId si falta
  if (!listId) {
    const lists = await graph.get<any>(
      `/sites/${siteId}/lists?$filter=displayName eq '${esc(listName)}'`
    );
    const list = lists?.value?.[0];
    if (!list?.id) throw new Error(`Lista no encontrada: ${listName}`);
    listId = list.id as string;
    saveCache(hostname, sp, listName, siteId, listId);
  }

  return { siteId, listId };
}

export function  norm (s?: string){
 return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

export const fileToBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); // data:image/png;base64,xxx
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo archivo"));
    reader.readAsDataURL(file);
  });

export function fileToBasePA64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.readAsDataURL(file);
    fr.onload = () => {
      const dataUrl = String(fr.result || "");
      const pureBase64 = dataUrl.substring(dataUrl.indexOf(",") + 1); // 👈 solo base64
      resolve(pureBase64);
    };
    fr.onerror = reject;
  });
}

export function truncateNoCutGraphemes(s: string, max: number, suffix = "...") {
  const seg = new Intl.Segmenter("es", { granularity: "grapheme" });
  const graphemes = Array.from(seg.segment(s), x => x.segment);
  if (graphemes.length <= max) return s;

  const upTo = graphemes.slice(0, max).join("");

  // busca el último separador de palabra antes del límite
  const m = upTo.match(/[\s\p{P}]+(?=[^\s\p{P}]*$)/u);
  const cutAt = m ? upTo.length - m[0].length : upTo.length;

  const safe = upTo.slice(0, cutAt).replace(/[.,;:!?\s]+$/u, "");
  return safe + suffix;
}

const getByPath = (obj: any, path: string) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

export const sortByPath = (
  path: string,
  type: string = "string",
  dir: string = "asc",
  nulls: string = "last"
) => {
  const dirMul = dir === "asc" ? 1 : -1;
  const nullMul = nulls === "first" ? -1 : 1;

  return (a: any, b: any) => {
    let va = getByPath(a, path);
    let vb = getByPath(b, path);

    const aNull = va == null || va === "";
    const bNull = vb == null || vb === "";
    if (aNull && bNull) return 0;
    if (aNull) return nullMul;
    if (bNull) return -nullMul;

    if (type === "date") {
      const ta = new Date(va).getTime();
      const tb = new Date(vb).getTime();
      return (ta - tb) * dirMul;
    }

    if (type === "number") {
      const na = Number(va);
      const nb = Number(vb);
      // NaN al final siempre
      const aNaN = Number.isNaN(na);
      const bNaN = Number.isNaN(nb);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;
      if (bNaN) return -1;
      return (na - nb) * dirMul;
    }

    // string
    const sa = String(va);
    const sb = String(vb);
    return sa.localeCompare(sb, "es", { sensitivity: "base", numeric: true }) * dirMul;
  };
};

export const escapeOData = (s: string) => String(s ?? "").replace(/'/g, "''");

export function s(v: any) {
  return String(v ?? "").trim();
}

export function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}