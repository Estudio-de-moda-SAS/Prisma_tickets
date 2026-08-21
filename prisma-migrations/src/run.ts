// src/run.ts
//
// Orquestador de la migración. Punto de entrada del proyecto.
//
//   npm run dry    -- --file ./excels/crm.xlsx
//   npm run commit -- --file ./excels/crm.xlsx
//
// (también se puede pasar --sheet "NombreHoja" si los datos no
//  están en la primera hoja del libro)

import { readExcel } from './lib/excel.ts';
import { buildUserResolver } from './lib/users.ts';
import { runDryRun, printDryRunReport } from './phases/02-validate.ts';
import { runLoad, printLoadReport } from './phases/03-load.ts';
import { BOARD_ID, TARGET_TEAM_ID } from './config/runConfig.ts';

interface Args {
  mode:  'dry' | 'commit';
  file:  string | null;
  sheet: string | undefined;
}

function parseArgs(): Args {
  // @ts-ignore
  const argv = process.argv.slice(2);
  let mode: 'dry' | 'commit' = 'dry'; // por defecto: seguro
  let file: string | null = null;
  let sheet: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit')       mode = 'commit';
    else if (a === '--dry-run') mode = 'dry';
    else if (a === '--file')    file = argv[++i] ?? null;
    else if (a === '--sheet')   sheet = argv[++i];
  }
  return { mode, file, sheet };
}

async function main(): Promise<void> {
  const { mode, file, sheet } = parseArgs();

  if (!file) {
    console.error('\n❌ Falta el archivo. Uso:');
    console.error('   npm run dry    -- --file ./ruta/al.xlsx');
    console.error('   npm run commit -- --file ./ruta/al.xlsx\n');
    // @ts-ignore
    process.exit(1);
  }

  console.log(`\nLeyendo ${file}…`);
const { rows, headers, fileName } = readExcel(file!, sheet);  console.log(`  ${rows.length} filas, ${headers.length} columnas detectadas.`);
  console.log(`  Equipo destino: ${TARGET_TEAM_ID} · Board: ${BOARD_ID}`);

  console.log('Cargando usuarios para resolver asignados…');
  const userResolver = await buildUserResolver();

  if (mode === 'dry') {
    const result = runDryRun(rows, fileName, headers, userResolver);
    printDryRunReport(result);
  } else {
    console.log('\n⚠  MODO COMMIT — esto ESCRIBE en la base de datos.');
    const result = await runLoad(rows, fileName, userResolver, {
      teamId:  TARGET_TEAM_ID,
      boardId: BOARD_ID,
    });
    printLoadReport(result);
  }
}

main().catch((err) => {
  console.error('\n❌ Error fatal:', (err as Error).message);
  // @ts-ignore
  process.exit(1);
});