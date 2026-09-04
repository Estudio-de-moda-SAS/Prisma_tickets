// src/phases/01-resolve.ts
//
// Fase 1 — RESOLVE. Antes de crear solicitudes, resuelve sus
// dependencias: sprints y labels. Hace upsert de cada valor único
// y devuelve los mapas (nombre normalizado → id) que usa la carga.
//
// Solo se ejecuta en modo --commit (escribe en la base). El dry-run
// usa extractUniqueSprints / extractUniqueLabels para reportar sin escribir.

import type { RawRow } from '../lib/excel.ts';
import { call } from '../lib/apiClient.ts';
import { COL } from '../config/mapping.ts';
import { cleanText, normalizeKey } from '../lib/transforms.ts';

export interface ResolveResult {
  sprintMap:      Map<string, number>;  // normalizeKey(texto) → Sprint_ID
  labelMap:       Map<string, number>;  // normalizeKey(nombre) → Label_ID
  createdSprints: string[];             // nombres creados (no existían)
  createdLabels:  string[];
}

/** Valores únicos de una columna, preservando el primer texto original visto. */
function uniqueByKey(rows: RawRow[], column: string): Map<string, string> {
  const map = new Map<string, string>(); // key normalizada → texto original
  for (const row of rows) {
    const text = cleanText(row[column]);
    if (text === null) continue;
    const key = normalizeKey(text);
    if (!map.has(key)) map.set(key, text);
  }
  return map;
}

/** Sprints únicos del Excel, separando celdas con coma. */
export function extractUniqueSprints(rows: RawRow[]): string[] {
  const map = new Map<string, string>(); // key normalizada → texto original
  for (const row of rows) {
    const raw = cleanText(row[COL.sprint]);
    if (raw === null) continue;
    for (const name of raw.split(',').map((n) => n.trim()).filter((n) => n.length > 0)) {
      const key = normalizeKey(name);
      if (!map.has(key)) map.set(key, name);
    }
  }
  return [...map.values()];
}

/** Epicas/labels únicos del Excel, separando celdas con coma. */
export function extractUniqueLabels(rows: RawRow[]): string[] {
  const map = new Map<string, string>(); // key normalizada → texto original
  for (const row of rows) {
    const raw = cleanText(row[COL.epica]);
    if (raw === null) continue;
    for (const name of raw.split(',').map((n) => n.trim()).filter((n) => n.length > 0)) {
      const key = normalizeKey(name);
      if (!map.has(key)) map.set(key, name);
    }
  }
  return [...map.values()];
}

/**
 * Resuelve (crea o reutiliza) todos los sprints y labels presentes
 * en las filas, y devuelve los mapas para la carga.
 */
export async function resolveSprintsAndLabels(
  rows: RawRow[],
  opts: { teamId: number; boardId: number },
): Promise<ResolveResult> {
  const sprintMap      = new Map<string, number>();
  const labelMap       = new Map<string, number>();
  const createdSprints: string[] = [];
  const createdLabels:  string[] = [];

  // ── Sprints (globales, por texto exacto, separando comas) ─
  const sprintMapUnique = new Map<string, string>(); // key → texto original
  for (const row of rows) {
    const raw = cleanText(row[COL.sprint]);
    if (raw === null) continue;
    for (const name of raw.split(',').map((n) => n.trim()).filter((n) => n.length > 0)) {
      const key = normalizeKey(name);
      if (!sprintMapUnique.has(key)) sprintMapUnique.set(key, name);
    }
  }
  for (const [key, text] of sprintMapUnique) {
    const res = await call<{ sprintId: number; created: boolean }>(
      'upsertSprintByName', { text },
    );
    sprintMap.set(key, res.sprintId);
    if (res.created) createdSprints.push(text);
  }

  // ── Labels (por tripleta nombre+equipo+board, separando comas) ─
  const labelMapUnique = new Map<string, string>(); // key → nombre original
  for (const row of rows) {
    const raw = cleanText(row[COL.epica]);
    if (raw === null) continue;
    for (const name of raw.split(',').map((n) => n.trim()).filter((n) => n.length > 0)) {
      const key = normalizeKey(name);
      if (!labelMapUnique.has(key)) labelMapUnique.set(key, name);
    }
  }
  for (const [key, name] of labelMapUnique) {
    const res = await call<{ labelId: number; created: boolean }>(
      'upsertLabelByName', { name, teamId: opts.teamId, boardId: opts.boardId },
    );
    labelMap.set(key, res.labelId);
    if (res.created) createdLabels.push(name);
  }

  return { sprintMap, labelMap, createdSprints, createdLabels };
}