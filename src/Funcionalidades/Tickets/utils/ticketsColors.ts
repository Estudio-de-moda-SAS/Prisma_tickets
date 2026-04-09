import type { Ticket } from "../../../Models/Tickets";
import { parseFechaFlex } from "../../../utils/Date";

export function calcularColorEstado(ticket: Ticket): string {
  const estado = (ticket.Estadodesolicitud ?? "").toLowerCase();

  if (estado === "cerrado" || estado === "cerrado fuera de tiempo") {
    return "rgb(255, 255, 255)";
  }

  if (!ticket.FechaApertura || !ticket.TiempoSolucion) {
    return "rgba(255,0,0,1)";
  }

  const inicio = parseFechaFlex(ticket.FechaApertura).getTime();
  const fin = parseFechaFlex(ticket.TiempoSolucion).getTime();
  const ahora = Date.now();

  if (isNaN(inicio) || isNaN(fin)) {
    return "rgba(255,0,0,1)";
  }

  const horasTotales = (fin - inicio) / 3_600_000;
  const horasRestantes = (fin - ahora) / 3_600_000;

  if (horasTotales <= 0 || horasRestantes <= 0) {
    return "rgba(255,0,0,1)";
  }

  const p = Math.max(0, Math.min(1, horasRestantes / horasTotales));

  const r = p > 0.5 ? 34 : p > 0.1 ? 255 : 255;
  const g = p > 0.5 ? 139 : p > 0.1 ? 165 : 0;
  const b = p > 0.5 ? 34 : p > 0.1 ? 0 : 0;

  const alpha = Math.max(0.3, 1 - p);
  return `rgba(${r},${g},${b},${alpha})`;
}