import type { Categoria, SubCategoria } from "../../../Models/Categorias";

export const first = (...vals: any[]) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

export function mapCategoria(row: any): Categoria {
  return {
    ID: String(first(row.ID, row.Id, row.id)),
    Title: String(first(row.Title, "No mapeado")),
  };
}

export function mapSubCategoria(row: any): SubCategoria {
  return {
    ID: String(first(row.ID, row.Id, row.id)),
    Title: String(first(row.Title, "No mapeado")),
    Id_categoria: String(first(row.Id_categoria, "")),
  };
}

export type AttachmentRow = {
  name: string;
  link: string;
};

export function normalizeAttachmentsResponse(raw: any[]): AttachmentRow[] {
  const normalized = (Array.isArray(raw) ? raw : [])
    .map((r, i) => ({
      name: r?.name ?? r?.DisplayName ?? `Archivo ${i + 1}`,
      link: r?.url ?? r?.AbsoluteUri ?? r?.link ?? "",
    }))
    .filter((a) => a.link);

  return Array.from(new Map(normalized.map((a) => [a.link, a])).values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}