// src/lib/transforms.ts
//
// Conversiones puras Excel → formato que espera la base.
// Sin efectos secundarios, fáciles de testear.

import { PRIORITY_TO_SCORE } from '../config/runConfig.ts';

/** Trim simple; null si queda vacío. */
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Normaliza para comparar: minúsculas, sin tildes, sin espacios extra. */
export function normalizeKey(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .toLowerCase()
    .trim();
}

/**
 * "HH:MM" → horas decimales. "6:00"→6, "6:30"→6.5.
 * Acepta también un número plano ("6", "6.5"). Vacío → null.
 */
export function hoursToDecimal(v: unknown): number | null {
  const s = cleanText(v);
  if (s === null) return null;

  if (s.includes(':')) {
    const [hStr, mStr] = s.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr ?? '0', 10);
    if (Number.isNaN(h)) return null;
    return h + (Number.isNaN(m) ? 0 : m) / 60;
  }

  const n = parseFloat(s.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/**
 * Fecha del Excel → ISO UTC en medianoche de Bogotá.
 * Colombia es UTC-5 fijo (sin horario de verano), así que la
 * medianoche local = 05:00 UTC del mismo día calendario.
 *
 * Maneja tres formatos posibles según cómo lea el Excel:
 *   · string "D/M/AAAA"  (día primero — formato colombiano)
 *   · Date  (si xlsx ya lo parseó)
 *   · number (serial de Excel)
 */
export function colombianDateToUTC(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  let y: number, mo: number, d: number;

  if (v instanceof Date) {
    y = v.getUTCFullYear(); mo = v.getUTCMonth() + 1; d = v.getUTCDate();
  } else if (typeof v === 'number') {
    // Serial de Excel: epoch 1899-12-30 (corrige el bug del año 1900).
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    const dt = new Date(ms);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else {
    const s = String(v).trim();
    const parts = s.split(/[/\-.]/);
    if (parts.length < 3) return null;
    d  = parseInt(parts[0], 10);   // DÍA primero
    mo = parseInt(parts[1], 10);
    y  = parseInt(parts[2], 10);
    if (Number.isNaN(d) || Number.isNaN(mo) || Number.isNaN(y)) return null;
    if (y < 100) y += 2000; // por si viene "26" en vez de "2026"
  }

  // 05:00 UTC = 00:00 Bogotá
  return new Date(Date.UTC(y, mo - 1, d, 5, 0, 0)).toISOString();
}

/** "Sí"/"Si"/"true"/"1" → true; "No"/vacío → false. */
export function siNoToBool(v: unknown): boolean {
  const k = normalizeKey(v);
  return k === 'si' || k === 'true' || k === '1' || k === 'x';
}

/** Prioridad ("Alto", "Urgente"…) → Score. Desconocida/vacía → null. */
export function priorityToScore(v: unknown): number | null {
  const k = normalizeKey(v);
  if (!k) return null;
  return PRIORITY_TO_SCORE[k] ?? null;
}

/** Progreso derivado: cerrada → 100, abierta → 0. */
export function deriveProgress(finishedAtIso: string | null): number {
  return finishedAtIso ? 100 : 0;
}