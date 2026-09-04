// src/phases/02-validate.ts
//
// Fase 2 — VALIDATE (dry-run). Recorre las filas, arma cada payload
// con el builder (mapas de sprint/label vacíos: no se resuelve nada),
// agrega las incidencias y produce un reporte. NO escribe en la base.

import type { RawRow } from '../lib/excel.ts';
import type { UserResolver } from '../lib/users.ts';
import type { Issue } from '../lib/buildPayload.ts';
import { buildPayload, type BuildContext } from '../lib/buildPayload.ts';
import { findMissingHeaders } from '../lib/excel.ts';
import { COL } from '../config/mapping.ts';
import { extractUniqueSprints, extractUniqueLabels } from './01-resolve.ts';
import { cleanText } from '../lib/transforms.ts';

interface UnresolvedAssignee {
  name:        string;
  reason:      'not_found' | 'ambiguous';
  candidates?: string[];
}

export interface DryRunResult {
  fileName:            string;
  totalRows:          number;
  blankRowsSkipped:   number;
  missingHeaders:     string[];
  warnCount:          number;
  infoCount:          number;
  unresolvedAssignees: UnresolvedAssignee[];
  uniqueSprints:      string[];
  uniqueLabels:       string[];
  rowIssues:          { row: number; issues: Issue[] }[];
}

/** Una fila está "en blanco" si todas las columnas mapeadas están vacías. */
function isBlankRow(row: RawRow): boolean {
  return Object.values(COL).every((col) => cleanText(row[col]) === null);
}

export function runDryRun(
  rows: RawRow[],
  fileName: string,
  headers: string[],
  userResolver: UserResolver,
): DryRunResult {
  const ctx: BuildContext = {
    sprintMap:    new Map(),
    labelMap:     new Map(),
    userResolver,
    sourceFile:   fileName,
  };

  const missingHeaders = findMissingHeaders(headers, Object.values(COL));

  let warnCount = 0;
  let infoCount = 0;
  let blankRowsSkipped = 0;
  const rowIssues: { row: number; issues: Issue[] }[] = [];
  const unresolved = new Map<string, UnresolvedAssignee>();

  rows.forEach((row, i) => {
    const excelRow = i + 2; // fila 1 = encabezados; los datos empiezan en la 2

    if (isBlankRow(row)) { blankRowsSkipped++; return; }

    const { issues } = buildPayload(row, excelRow, ctx);

    for (const issue of issues) {
      if (issue.level === 'warn') warnCount++; else infoCount++;

      // Capturar asignados sin resolver (únicos por nombre)
      if (issue.field === COL.asignada) {
        const m = issue.message.match(/"([^"]+)"/);
        const name = m ? m[1] : issue.message;
        const reason: 'not_found' | 'ambiguous' =
          issue.message.includes('ambiguo') ? 'ambiguous' : 'not_found';
        if (!unresolved.has(name)) {
          const cand = issue.message.includes('→ ')
            ? issue.message.split('→ ')[1]?.replace(' → sin asignar', '').split(' / ')
            : undefined;
          unresolved.set(name, { name, reason, candidates: reason === 'ambiguous' ? cand : undefined });
        }
      }
    }

    if (issues.some((x) => x.level === 'warn'))
      rowIssues.push({ row: excelRow, issues: issues.filter((x) => x.level === 'warn') });
  });

  return {
    fileName,
    totalRows: rows.length - blankRowsSkipped,
    blankRowsSkipped,
    missingHeaders,
    warnCount,
    infoCount,
    unresolvedAssignees: [...unresolved.values()],
    uniqueSprints: extractUniqueSprints(rows),
    uniqueLabels:  extractUniqueLabels(rows),
    rowIssues,
  };
}

/** Imprime el reporte del dry-run de forma legible. */
export function printDryRunReport(r: DryRunResult): void {
  const line = '─'.repeat(56);
  console.log(`\n${line}`);
  console.log(`  DRY-RUN · ${r.fileName}`);
  console.log(line);
  console.log(`  Filas a migrar:        ${r.totalRows}`);
  console.log(`  Filas en blanco:       ${r.blankRowsSkipped} (ignoradas)`);
  console.log(`  Advertencias (warn):   ${r.warnCount}`);
  console.log(`  Informativas (info):   ${r.infoCount}`);

  if (r.missingHeaders.length > 0) {
    console.log(`\n  ⚠  ENCABEZADOS FALTANTES (esos campos quedarán vacíos):`);
    for (const h of r.missingHeaders) console.log(`       · ${h}`);
  } else {
    console.log(`\n  ✓ Todos los encabezados esperados están presentes.`);
  }

  console.log(`\n  Sprints a crear/resolver: ${r.uniqueSprints.length}`);
  for (const s of r.uniqueSprints) console.log(`       · ${s}`);

  console.log(`\n  Etiquetas a crear/resolver: ${r.uniqueLabels.length}`);
  for (const l of r.uniqueLabels) console.log(`       · ${l}`);

  if (r.unresolvedAssignees.length > 0) {
    console.log(`\n  ⚠  ASIGNADOS SIN RESOLVER (se migran sin asignar):`);
    for (const a of r.unresolvedAssignees) {
      if (a.reason === 'ambiguous')
        console.log(`       · "${a.name}" → ambiguo: ${a.candidates?.join(' / ')}`);
      else
        console.log(`       · "${a.name}" → no encontrado`);
    }
  } else {
    console.log(`\n  ✓ Todos los asignados resolvieron correctamente.`);
  }

  if (r.rowIssues.length > 0) {
    console.log(`\n  Filas con advertencias (${r.rowIssues.length}):`);
    for (const ri of r.rowIssues.slice(0, 30)) {
      const msgs = ri.issues.map((x) => `${x.field}: ${x.message}`).join('; ');
      console.log(`       fila ${ri.row} → ${msgs}`);
    }
    if (r.rowIssues.length > 30)
      console.log(`       … y ${r.rowIssues.length - 30} más.`);
  }

  console.log(`\n${line}`);
  console.log(`  Nada se escribió. Revisá el reporte antes de --commit.`);
  console.log(`${line}\n`);
}