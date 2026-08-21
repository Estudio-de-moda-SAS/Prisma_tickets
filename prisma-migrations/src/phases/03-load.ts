// src/phases/03-load.ts
//
// Fase 3 — LOAD (commit). Resuelve sprints/labels (escribe), arma
// cada payload con los mapas reales y crea las solicitudes llamando
// a migrateRequest. Idempotente: las filas ya migradas se saltan.

import type { RawRow } from '../lib/excel.ts';
import type { UserResolver } from '../lib/users.ts';
import { callWithRetry } from '../lib/apiClient.ts';
import { buildPayload, type BuildContext } from '../lib/buildPayload.ts';
import { resolveSprintsAndLabels } from './01-resolve.ts';
import { COL } from '../config/mapping.ts';
import { cleanText } from '../lib/transforms.ts';

export interface LoadResult {
  created:        number;
  skipped:        number;   // ya estaban en TBL_Migration_Map
  failed:         { row: number; error: string }[];
  createdSprints: string[];
  createdLabels:  string[];
}

/** Fila "en blanco": todas las columnas mapeadas vacías. */
function isBlankRow(row: RawRow): boolean {
  return Object.values(COL).every((col) => cleanText(row[col]) === null);
}

export async function runLoad(
  rows: RawRow[],
  fileName: string,
  userResolver: UserResolver,
  opts: { teamId: number; boardId: number },
): Promise<LoadResult> {
  // ── 1. Resolver dependencias (escribe sprints/labels) ─────
  console.log('\n  Resolviendo sprints y etiquetas…');
  const { sprintMap, labelMap, createdSprints, createdLabels } =
    await resolveSprintsAndLabels(rows, opts);
  console.log(`  Sprints creados: ${createdSprints.length} · Etiquetas creadas: ${createdLabels.length}`);

  const ctx: BuildContext = { sprintMap, labelMap, userResolver, sourceFile: fileName };

  // ── 2. Crear solicitudes una por una ──────────────────────
  let created = 0;
  let skipped = 0;
  const failed: { row: number; error: string }[] = [];

  const dataRows = rows
    .map((row, i) => ({ row, excelRow: i + 2 }))
    .filter(({ row }) => !isBlankRow(row));

  console.log(`\n  Migrando ${dataRows.length} solicitudes…\n`);

  let processed = 0;
  for (const { row, excelRow } of dataRows) {
    const { payload } = buildPayload(row, excelRow, ctx);
    try {
      const res = await callWithRetry<{ skipped: boolean; requestId: string }>(
        'migrateRequest', payload as unknown as Record<string, unknown>,
      );
      if (res.skipped) skipped++; else created++;
    } catch (err) {
      failed.push({ row: excelRow, error: (err as Error).message });
    }

    processed++;
    if (processed % 25 === 0 || processed === dataRows.length)
      console.log(`    ${processed}/${dataRows.length}  (creadas: ${created}, saltadas: ${skipped}, fallidas: ${failed.length})`);
  }

  return { created, skipped, failed, createdSprints, createdLabels };
}

/** Imprime el resumen final de la carga. */
export function printLoadReport(r: LoadResult): void {
  const line = '─'.repeat(56);
  console.log(`\n${line}`);
  console.log(`  COMMIT · resultado`);
  console.log(line);
  console.log(`  Solicitudes creadas:   ${r.created}`);
  console.log(`  Saltadas (ya migradas): ${r.skipped}`);
  console.log(`  Fallidas:              ${r.failed.length}`);
  console.log(`  Sprints creados:       ${r.createdSprints.length}`);
  console.log(`  Etiquetas creadas:     ${r.createdLabels.length}`);

  if (r.failed.length > 0) {
    console.log(`\n  ⚠  FILAS FALLIDAS (reejecutá para reintentarlas):`);
    for (const f of r.failed) console.log(`       fila ${f.row} → ${f.error}`);
  } else {
    console.log(`\n  ✓ Sin fallos.`);
  }

  console.log(`\n${line}\n`);
}