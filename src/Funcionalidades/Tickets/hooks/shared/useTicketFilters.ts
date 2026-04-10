import type { DateRange, GetAllOpts } from "../../../../Models/Commons";
import type { SortDir, SortField } from "../../../../Models/Tickets";


export const sortFieldToOData: Record<SortField, string> = {
  id: "Id",
  FechaApertura: "fields/FechaApertura",
  TiempoSolucion: "fields/TiempoSolucion",
  Title: "fields/Title",
  resolutor: "fields/Nombreresolutor",
};

export function buildTicketsFilter(params: {role: string; userMail: string; filterMode: string; range: DateRange; pageSize: number; sorts: Array<{ field: SortField; dir: SortDir }>; }): GetAllOpts {
  const { role, userMail, filterMode, range, pageSize, sorts, } = params;

  const filters: string[] = [];
  const isAdmin = role === "Administrador";

  if (!isAdmin) {
    const emailSafe = String(userMail ?? "").replace(/'/g, "''");

    const myVisibility =
      `(fields/CorreoSolicitante eq '${emailSafe}' or ` +
      `fields/CorreoObservador eq '${emailSafe}' or ` +
      `fields/Correoresolutor eq '${emailSafe}')`;

    filters.push(myVisibility);
  }

  if (filterMode === "En curso") {
    filters.push(
      `(fields/Estadodesolicitud eq 'En atención' or fields/Estadodesolicitud eq 'Fuera de tiempo')`
    );
  } else if (filterMode !== "Todos") {
    filters.push(`startswith(fields/Estadodesolicitud,'Cerrado')`);
  }

  if (range.from && range.to && range.from < range.to) {
    filters.push(`fields/FechaApertura ge '${range.from}T00:00:00Z'`);
    filters.push(`fields/FechaApertura le '${range.to}T23:59:59Z'`);
  }

  const orderParts = sorts
    .map((s) => {
      const col = sortFieldToOData[s.field];
      return col ? `${col} ${s.dir}` : "";
    })
    .filter(Boolean);

  if (!sorts.some((s) => s.field === "id")) {
    orderParts.push("ID desc");
  }

  return {
    filter: filters.join(" and "),
    orderby: orderParts.join(","),
    top: pageSize,
  };
}