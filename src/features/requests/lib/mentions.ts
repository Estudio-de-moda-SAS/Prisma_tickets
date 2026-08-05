// src/features/requests/lib/mentions.ts
import type { AppUser } from '../hooks/useUsers';

export const TI_DEPARTMENT_ID = 7;

type Mentioner = { User_ID: number; User_Role: string; Department_ID: number | null };

/** Regla 3: en confidencial solo admin puede mencionar. */
export function canMention(m: Mentioner, isConfidential: boolean): boolean {
  return isConfidential ? m.User_Role === 'admin' : true;
}

/** Regla 2: admin → todos; no-admin → TI ∪ su propio depto.
 *  (Si querés "TI + depto del solicitante", pasá el depto del solicitante
 *   en vez de m.Department_ID acá.) */
/** Un pre-registro es un usuario sin EntraID resuelto: no ha hecho login nunca.
 *  Señal disponible en AppUser: User_Name vacío (se llena en el primer login). */
function isPreRegistered(u: AppUser): boolean {
  return !(u.User_Name ?? '').trim();
}

export function mentionablePool(users: AppUser[], _m: Mentioner): AppUser[] {
  // Todos pueden mencionar a cualquiera, excepto:
  // - pre-registros (sin nombre, no han hecho login)
  // - usuarios sin departamento asignado
  return users.filter((u) => !isPreRegistered(u) && u.Department_ID != null);
}

/** Agrupa una lista plana de usuarios por departamento, para render con headers.
 *  TI primero, resto alfabético, "Sin departamento" al final. */
export type MentionGroup = { deptId: number | null; deptName: string; users: AppUser[] };

export function groupByDepartment(users: AppUser[]): MentionGroup[] {
  const map = new Map<number | null, MentionGroup>();
  for (const u of users) {
    const deptId   = u.Department_ID ?? null;
    const deptName = u.department?.Department_Name ?? (deptId == null ? 'Sin departamento' : `Departamento ${deptId}`);
    if (!map.has(deptId)) map.set(deptId, { deptId, deptName, users: [] });
    map.get(deptId)!.users.push(u);
  }
  return [...map.values()].sort((a, b) => {
    if (a.deptId === TI_DEPARTMENT_ID) return -1;   // TI primero
    if (b.deptId === TI_DEPARTMENT_ID) return 1;
    if (a.deptId == null) return 1;                 // "Sin departamento" al final
    if (b.deptId == null) return -1;
    return a.deptName.localeCompare(b.deptName);
  });
}
export function filterMentionables(
  query: string,
  users: AppUser[],
  m: Mentioner,
  isConfidential: boolean,
  opts: { excludeUserId?: number; limit?: number } = {},
): AppUser[] {
  if (!canMention(m, isConfidential)) return [];
  const { excludeUserId, limit = 50 } = opts;
  const q = query.trim().toLowerCase();
  const pool = mentionablePool(users, m).filter((u) => u.User_ID !== excludeUserId);
  if (!q) return pool;   // sin búsqueda → todos (agrupados + scroll en el panel)
  const matched = pool.filter((u) =>
    u.User_Name.toLowerCase().includes(q) || u.User_Email.toLowerCase().includes(q));
  return matched.slice(0, limit);
}

/** Extrae IDs de un texto con marcadores @[id] (dedup). */
export function extractMentionIds(text: string): number[] {
  const re = /@\[(\d+)\]/g;
  const ids = new Set<number>();
  let x: RegExpExecArray | null;
  while ((x = re.exec(text)) !== null) ids.add(Number(x[1]));
  return [...ids];
}

// Partículas que unen apellidos compuestos en español (y algunas comunes).
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'do', 'dos', 'van', 'von', 'y', 'e', 'san', 'santa']);

/** Acorta un nombre completo a "primer nombre + primer apellido",
 *  respetando apellidos compuestos con partículas (del, de la, van…).
 *  Ej: "Juan Del Castillo" → "Juan Del Castillo"
 *      "Ana Maria Perez Gomez" → "Ana Perez"
 *      "Luis de la Cruz Rojas" → "Luis de la Cruz" */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return full.trim();           // "Juan Perez" → tal cual

  const first = parts[0];                               // primer nombre
  // Buscar dónde empieza el apellido: si hay 4+ tokens, asumimos 2 nombres,
  // apellido empieza en índice 2; si hay 3, apellido empieza en índice 1.
  let apStart = parts.length >= 4 ? 2 : 1;

  // Armar el primer apellido incluyendo partículas que lo preceden/unen.
  const ap: string[] = [];
  let i = apStart;
  // arrastrar partículas iniciales (de, del, la…)
  while (i < parts.length && PARTICULAS.has(parts[i].toLowerCase())) { ap.push(parts[i]); i++; }
  // el núcleo del apellido
  if (i < parts.length) { ap.push(parts[i]); i++; }
  // si el siguiente token también es partícula seguida de otra palabra, incluirlo
  // (caso "de la Cruz": part, part, núcleo)
  while (i < parts.length && PARTICULAS.has(parts[i - 1]?.toLowerCase() ?? '') === false && PARTICULAS.has(parts[i].toLowerCase())) {
    ap.push(parts[i]); i++;
    if (i < parts.length) { ap.push(parts[i]); i++; }
  }

  return `${first} ${ap.join(' ')}`.trim();
}