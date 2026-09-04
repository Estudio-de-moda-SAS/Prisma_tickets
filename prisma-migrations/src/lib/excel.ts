// src/lib/excel.ts
//
// Extract: lee un .xlsx y devuelve las filas como objetos
// { 'Encabezado': valor }. El mapeo consume por NOMBRE de columna,
// así que el orden físico de las columnas es irrelevante.

import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
/** Una fila cruda: clave = encabezado exacto del Excel. */
export type RawRow = Record<string, unknown>;

export interface ReadResult {
  rows:     RawRow[];
  headers:  string[];   // encabezados detectados (para validar el mapeo)
  fileName: string;     // nombre base del archivo (idempotencia: Source_File)
}

/**
 * Lee la primera hoja (o la indicada) de un .xlsx.
 *
 * Notas de robustez:
 *  · raw: false  → las celdas vienen como texto formateado, no como
 *    serial numérico, así las fechas llegan como "7/1/2026" y el
 *    transform las interpreta día-primero. (El transform igual maneja
 *    Date y serial por si acaso.)
 *  · defval: ''  → las celdas vacías quedan como '' en vez de faltar,
 *    para que toda fila tenga todas las claves.
 */
export function readExcel(path: string, sheetName?: string): ReadResult {
  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { cellDates: true });

  const targetSheet = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[targetSheet];
  if (!ws) {
    throw new Error(
      `No se encontró la hoja "${targetSheet}". Hojas disponibles: ${wb.SheetNames.join(', ')}`,
    );
  }

// Lectura "texto": preserva el comportamiento de todas las columnas
  // (textos, horas "6:00", números) tal como estaban.
  const formattedRows = XLSX.utils.sheet_to_json<RawRow>(ws, {
    raw:    false,
    defval: '',
  });
  // Lectura "tipada": las celdas de fecha llegan como Date real. La usamos
  // SOLO para rescatar fechas; el resto se toma de formattedRows.
  const typedRows = XLSX.utils.sheet_to_json<RawRow>(ws, {
    raw:    true,
    defval: '',
  });

  // Merge + normalización de claves en una pasada:
  //  · Si la celda es una fecha real (Date en la versión tipada) se usa el
  //    Date → el transform la lee sin ambigüedad D/M vs M/D. Sin esto,
  //    SheetJS reformatea la fecha a texto M/D ("10/6/25") e invierte mes/día.
  //  · Las claves se trimean/colapsan para que un encabezado con espacio de
  //    más no deje la columna en undefined.
  const rows: RawRow[] = formattedRows.map((frow, i) => {
    const trow = typedRows[i] ?? {};
    const clean: RawRow = {};
    for (const [k, val] of Object.entries(frow)) {
      const key = k.trim().replace(/\s+/g, ' ');
      clean[key] = (trow[k] instanceof Date) ? trow[k] : val;
    }
    return clean;
  });
  

  // Encabezados: los tomamos de la primera fila del rango.
  const headerRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false });
  const headers = ((headerRows[0] ?? []) as unknown[])
    .map((h) => String(h ?? '').trim())
    .filter((h) => h.length > 0);

  const fileName = path.split(/[/\\]/).pop() ?? path;

  return { rows, headers, fileName };
}

/**
 * Verifica que los encabezados esperados existan en el Excel.
 * Devuelve los que faltan (vacío = todo en orden). El dry-run
 * lo usa para avisar antes de procesar nada.
 */
export function findMissingHeaders(headers: string[], expected: string[]): string[] {
  const present = new Set(headers.map((h) => h.trim()));
  return expected.filter((e) => !present.has(e));
}